import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applicationDatabaseFixture,postgresUrl} from './fixtures/application-database.mjs';
import {memorySessionStore} from './session-store-fixture.mjs';
import {createPostgresEventIdentities} from '../dist/src/sessions/postgres-identities.mjs';
import {migrateEventIdentitySource} from '../dist/src/sessions/identity-migration.mjs';
import {digest,eventIdentityLocation,MAX_EVENT_LEDGER_BYTES} from '../dist/src/sessions/event-identity.mjs';
import {createBoundObjectMigration} from '../dist/src/state/object-migration.mjs';
import {migrateApplicationSources,migrationHash} from '../dist/src/state/migration-engine.mjs';
import {requireApplicationStateReady} from '../dist/src/state/postgres.mjs';

const live=(name,run)=>test(name,{skip:!postgresUrl},run),prefix='sessions/observed-test/v1',owner={tenantId:'org_observed',userId:'user_fixture'};
const identity={prefix,principal:owner,harness:'codex',installationId:'machine',sessionId:'session'},encode=value=>Buffer.from(JSON.stringify(value));
async function fixture(t){
 const database=await applicationDatabaseFixture(t),store={...memorySessionStore(),bucket:'observed-fixture'},identities=createPostgresEventIdentities({connectionString:postgresUrl,namespace:database.namespace});
 t.after(()=>identities.close());await identities.ready();
 const databaseId=(await database.pool.query('SELECT database_id FROM opencrawl_event_identity_schema WHERE singleton')).rows[0].database_id;
 const migration=createBoundObjectMigration({database,store,prefix,tenantIds:[owner.tenantId],registryRecords:[],eventIdentities:identities});
 async function ready(sessionId='session'){
  const scope={...identity,sessionId},where=eventIdentityLocation(scope);await identities.reserve({...scope,store,events:[{id:'one',kind:'message'}]});
  const marker={schemaVersion:2,identity:where.identity,database:databaseId,namespace:digest(database.namespace)},bytes=encode(marker);await store.put(where.key,bytes);
  return {...where,marker,bytes,observedMarker:{source:where.source,bytes}};
 }
 return {database,store,identities,migration,ready};
}

live('ready v2 observed markers remove only duplicate source reads and independently verify SQL',async t=>{
 const f=await fixture(t),where=await f.ready(),read=f.store.readVersion;let reads=0;
 f.store.readVersion=async(...args)=>{reads++;return read(...args);};
 for(const write of [false,true,false]){const result=await f.migration.process(where.key,where.bytes,{write});assert.deepEqual(result.source,where.marker);assert.deepEqual(result.target,where.marker);}
 assert.equal(reads,0,'Read and write operations use the exact current marker body, with no extra GET');
 assert.equal((await f.identities.migrateSession({store:f.store,prefix,source:where.source})).reservedEvents,1);
 assert.deepEqual(await f.identities.exportLegacyLedger({store:f.store,prefix,source:where.source}),where.marker);assert.equal(reads,2,'Callers without an observed marker still read live');
 await f.database.pool.query('UPDATE opencrawl_event_identity_sessions SET event_count=2 WHERE namespace=$1',[f.database.namespace]);
 await assert.rejects(f.identities.exportLegacyLedger({store:f.store,prefix,source:where.source,observedMarker:where.observedMarker}),/count verification failed/);
 await f.database.pool.query('UPDATE opencrawl_event_identity_sessions SET event_count=1 WHERE namespace=$1',[f.database.namespace]);
 await f.identities.purgeSession(identity);
 const deleted=await f.migration.process(where.key,where.bytes,{write:true});assert.equal(deleted.source.deleted,true);assert.deepEqual(deleted.target,deleted.source);assert.equal(deleted.rows,0);
 await assert.rejects(f.identities.reserve({...identity,store:f.store,events:[{id:'late',kind:'message'}]}),{status:410});
});

live('observed marker source, shape, identity and matching database are mandatory',async t=>{
 const f=await fixture(t),where=await f.ready(),base={store:f.store,prefix,source:where.source};
 const bad=[
  {source:where.source+'elsewhere/',bytes:where.bytes},{source:where.source,bytes:Buffer.alloc(MAX_EVENT_LEDGER_BYTES+1)},
  {source:where.source,bytes:Buffer.from('{')},{source:where.source,bytes:encode(null)},
  ...[{identity:digest('wrong')},{database:randomUUID()},{namespace:digest('wrong')},{extra:true}].map(change=>({source:where.source,bytes:encode({...where.marker,...change})})),
 ];
 for(const observedMarker of bad)for(const operation of ['migrateSession','exportLegacyLedger'])await assert.rejects(f.identities[operation]({...base,observedMarker}),error=>[409,503].includes(error.status));
 const original=where.bytes,provided=Buffer.from(original),pending=f.identities.exportLegacyLedger({...base,observedMarker:{source:where.source,bytes:provided}});provided.fill(0);
 assert.deepEqual(await pending,where.marker,'Observation is parsed before asynchronous caller mutation');
 await f.database.pool.query('DELETE FROM opencrawl_event_identity_sessions WHERE namespace=$1',[f.database.namespace]);
 await assert.rejects(f.identities.migrateSession({...base,observedMarker:where.observedMarker}),{status:503});
 assert.equal(await f.identities.exportLegacyLedger({...base,observedMarker:where.observedMarker}),null,'An observed marker never fabricates missing SQL reservations');
});

live('v1 first imports preserve live before/after reads, reject stale observations and resume after drift',async t=>{
 const f=await fixture(t),where=eventIdentityLocation(identity),first={schemaVersion:1,identity:where.identity,events:{[digest('one')]:digest('body-one')}},changed={...first,events:{...first.events,[digest('two')]:digest('body-two')}};
 await f.store.put(where.key,encode(changed));
 await assert.rejects(f.identities.migrateSession({store:f.store,prefix,source:where.source,observedMarker:{source:where.source,bytes:encode(first)}}),/changed before migration/);
 assert.equal((await f.database.pool.query('SELECT count(*)::int n FROM opencrawl_event_identity_sessions WHERE namespace=$1',[f.database.namespace])).rows[0].n,0);
 await f.store.put(where.key,encode(first));const read=f.store.readVersion;let reads=0;
 f.store.readVersion=async(...args)=>{if(++reads===2)await f.store.put(where.key,encode(changed));return read(...args);};
 await assert.rejects(f.identities.migrateSession({store:f.store,prefix,source:where.source,observedMarker:{source:where.source,bytes:encode(first)}}),/changed during migration/);
 assert.equal(reads,2);assert.equal((await f.database.pool.query('SELECT state FROM opencrawl_event_identity_sessions WHERE namespace=$1',[f.database.namespace])).rows[0].state,'importing');
 reads=0;f.store.readVersion=async(...args)=>{reads++;return read(...args);};
 assert.equal((await f.identities.migrateSession({store:f.store,prefix,source:where.source,observedMarker:{source:where.source,bytes:encode(changed)}})).reservedEvents,2);assert.equal(reads,2);
 assert.deepEqual(await f.identities.exportLegacyLedger({store:f.store,prefix,source:where.source,observedMarker:{source:where.source,bytes:encode(changed)}}),changed);assert.equal(reads,3,'v1 export retains its original live read');
});

live('whole-source migration deduplicates across pages and drains bounded visits before failure',async t=>{
 const f=await fixture(t),sources=[];
 for(let n=0;n<9;n++){
  const where=eventIdentityLocation({...identity,sessionId:'batch-'+n}),bytes=encode({schemaVersion:1,identity:where.identity,events:{[digest('event')]:digest('body')}});await f.store.put(where.key,bytes);sources.push(where);
 }
 sources.sort((a,b)=>a.source<b.source?-1:1);
 // The first source continues across pages, including a raw batch that needs no
 // history download because the original ledger contains its reservations.
 const pages=[[sources[0].source+digest('a')+'.json.gz',sources[0].key],[sources[0].source+'f'.repeat(64)+'.json.gz',...sources.slice(1).map(row=>row.key)]];
 f.store.listPage=async(_root,{continuationToken}={})=>({keys:pages[Number(continuationToken??0)],nextToken:continuationToken?null:'1'});
 let active=0,peak=0,failVisit=true;const visited=[];
 const tracked={...f.identities,migrateSession:async options=>{
  active++;peak=Math.max(peak,active);visited.push(options.source);
  try{await new Promise(resolve=>setTimeout(resolve,options.source===sources[2].source?1:8));if(failVisit&&options.source===sources[2].source)throw new Error('Injected identity visit failure');return await f.identities.migrateSession(options);}finally{active--;}
 }};
 await assert.rejects(migrateEventIdentitySource({store:f.store,prefix,eventIdentities:tracked}),/Injected identity visit failure/);
 assert.equal(active,0);assert.equal(peak,4);assert.equal(visited.length,5,'One first-page source plus one failed group; no later group is dispatched');assert.equal(visited.filter(source=>source===sources[0].source).length,1);
 const committed=(await f.database.pool.query('SELECT source,state FROM opencrawl_event_identity_sessions WHERE namespace=$1 ORDER BY source',[f.database.namespace])).rows;
 assert.equal(committed.length,4);assert.ok(committed.every(row=>row.state==='ready'),'Successful per-session commits remain resumable');
 failVisit=false;visited.length=0;const result=await migrateEventIdentitySource({store:f.store,prefix,eventIdentities:tracked});assert.equal(result.sessionVisits,9);assert.equal(new Set(visited).size,9);assert.equal(visited.length,9);assert.equal(active,0);
 const original=f.store.listPage;f.store.listPage=async()=>({keys:[sources[1].key,sources[0].key],nextToken:null});
 await assert.rejects(migrateEventIdentitySource({store:f.store,prefix,eventIdentities:tracked}),/not ordered/);f.store.listPage=original;
});

live('fresh outer marker inventory rejects final source drift and exact restart resumes',async t=>{
 const f=await fixture(t),where=await f.ready(),source={version:1,bucket:'observed-fixture',prefix,organizationId:owner.tenantId};let drift=true,passes=0,reads=0;const read=f.store.readVersion;
 f.store.readVersion=async(...args)=>{reads++;const value=await read(...args);return {...value,version:value.data?digest(value.data):null};};
 async function operation(){const value=await f.store.readVersion(where.key),entry={key:where.key,domain:'event-identities',version:value.version,hash:migrationHash(value.data),bytes:value.data.length};return {entry,readback:await f.migration.process(where.key,value.data,{write:false}),migrate:()=>f.migration.process(where.key,value.data,{write:true})};}
 const run=()=>migrateApplicationSources({database:f.database,source,mode:'migrate',writersStopped:true,checkAccess:async()=>{},sources:async()=>{
  passes=0;return {async *inventory(){if(++passes===2&&drift)await f.store.put(where.key,Buffer.concat([where.bytes,Buffer.from(' ')]));yield {...await operation(),legacy:true,mutableObject:true};},validateInventory:async()=>{},read:operation,finalize:async()=>({})};
 }});
 await assert.rejects(run(),/changed during verification/);await assert.rejects(requireApplicationStateReady(f.database));assert.equal(reads,3,'Initial, import and final each independently read one original marker');
 await f.store.put(where.key,where.bytes);drift=false;reads=0;assert.equal((await run()).ready,true);assert.equal(reads,3);await requireApplicationStateReady(f.database);
});
