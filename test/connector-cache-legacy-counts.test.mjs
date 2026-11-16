import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {dropTestSchemas} from './fixtures/application-database.mjs';
import {createObjectMigration} from '../dist/src/state/object-migration.mjs';
import {createConnectorCacheRetirements} from '../dist/src/state/connector-cache-retirements.mjs';
const url=process.env.OPENCRAWL_TEST_POSTGRES_URL,hash=value=>createHash('sha256').update(value).digest('hex');
const table='opencrawl_connector_cache_retirements',constraint=table+'_check';
// Exact pre-upgrade schema; exercise an existing table, not only fresh DDL.
const oldDDL=`CREATE TABLE opencrawl_connector_cache_retirements(
 namespace text NOT NULL,bucket text NOT NULL,retirement_key text NOT NULL,kind text NOT NULL CHECK(kind IN('object','snapshot')),
 source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),disposition text NOT NULL CHECK(disposition='full-temporal-connector-catchup'),
 pipeline text NOT NULL,source_key text,object_hash text,fingerprint text,checksum text,source_records bigint,records bigint NOT NULL CHECK(records>=0),objects bigint,ignored bigint,
 PRIMARY KEY(namespace,bucket,retirement_key),CHECK(source_records IS NULL OR source_records>=0),CHECK(ignored IS NULL OR ignored>=0),
 CHECK((kind='object' AND source_key IS NOT NULL AND object_hash IS NOT NULL AND object_hash~'^[a-f0-9]{64}$' AND source_records IS NOT NULL AND fingerprint IS NULL AND checksum IS NULL AND objects IS NULL AND ignored IS NULL)
 OR(kind='snapshot' AND source_key IS NULL AND object_hash IS NULL AND fingerprint IS NOT NULL AND fingerprint~'^[a-f0-9]{64}$' AND (checksum IS NULL OR checksum~'^[a-f0-9]{64}$') AND objects IS NOT NULL AND objects>=0)))`;
async function fixture(t){
 const schema='test_legacy_counts_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url,max:1});await admin.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:url,max:2,options:`-c search_path=${schema},pg_catalog`});
 t.after(async()=>{await pool.end();try{await dropTestSchemas(admin,[schema]);}finally{await admin.end();}});
 const database={namespace:randomUUID(),pool,ready:async()=>{},transaction:async run=>{const client=await pool.connect();try{await client.query('BEGIN');const result=await run(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}};
 const record={tenantId:'org_test',userId:'user_test',integrationId:'connection',provider:'slack',workspace:'workspace',s3Bucket:'synthetic-fixture',s3Prefix:'raw/v1/source=slack/workspace=workspace/connection=connection'};
 const store={bucket:record.s3Bucket,get:async()=>{throw Error('Unexpected source dependency');},put:async()=>assert.fail('Source write')};
 const options={database,store,prefix:'sessions/self-hosted/v1',organizationId:record.tenantId,registryRecords:[record],eventIdentities:{exportLegacyLedger:async()=>null}};
 return {database,pool,record,options,migration:createObjectMigration(options),repo:createConnectorCacheRetirements(database)};
}
function receipt(f,pipeline,extra={}){const key=f.record.s3Prefix+'/stream=messages/date=2026-11-05/sync=1/page.jsonl.gz';return {pipeline,key,sha256:hash('original compressed bytes'),records:3,...extra};}
function location(value){return 'derived/indexing/'+value.pipeline+'/'+hash('historical-index-binding')+'/'+hash(value.key)+'.json';}
function audit(f,value){const bytes=Buffer.from(JSON.stringify(value));return {version:1,kind:'object',bucket:f.record.s3Bucket,key:location(value),sourceHash:hash(bytes),disposition:'full-temporal-connector-catchup',receipt:value};}

test('historical Slack v1-v4 count omission survives exact audit readback and leaves live authority absent',{skip:!url},async t=>{
 const f=await fixture(t);
 // ec34279/slack-v1, d9f2055/v2, bc93391/v3, 3cb80f5/v4 producers
 // wrote only {pipeline,key,sha256,records}; #40 retained slack-v4 and added count.
 for(const pipeline of ['slack-v1','slack-v2','slack-v3','slack-v4']){
  const value=receipt(f,pipeline),bytes=Buffer.from(JSON.stringify(value)),key=location(value),before=hash(bytes);
  assert.equal((await f.migration.process(key,bytes,{write:false})).target,null);
  const result=await f.migration.process(key,bytes,{write:true});assert.deepEqual(result.source,result.target);assert.deepEqual(result.target,audit(f,value));assert.equal(hash(bytes),before);
  const row=(await f.pool.query(`SELECT source_records,source_hash FROM ${table} WHERE namespace=$1 AND retirement_key=$2`,[f.database.namespace,key])).rows[0];assert.equal(row.source_records,null);assert.equal(row.source_hash,before);assert.equal(Object.hasOwn(result.target.receipt,'sourceRecords'),false);
  const restarted=createObjectMigration(f.options);assert.deepEqual((await restarted.process(key,bytes,{write:true})).target,result.target);
 }
 assert.equal((await f.pool.query("SELECT to_regclass('opencrawl_indexing_receipts') AS relation")).rows[0].relation,null);
 assert.deepEqual(await f.repo.required(),{receipts:4,buckets:[f.record.s3Bucket]});
});

test('current counted forms remain exact; other omissions and malformed counts stay blocked',{skip:!url},async t=>{
 const f=await fixture(t);
 for(const pipeline of ['slack-v4','slack-v6','workspace-v1']){const value=receipt(f,pipeline,{sourceRecords:7});const result=await f.migration.process(location(value),Buffer.from(JSON.stringify(value)),{write:true});assert.deepEqual(result.target.receipt,value);}
 for(const pipeline of ['slack-v5','slack-v6','workspace-v1','unknown']){const value=receipt(f,pipeline);await assert.rejects(f.migration.process(location(value),Buffer.from(JSON.stringify(value)),{write:false}),/original source count/);}
 for(const sourceRecords of [null,'3',-1,1.5]){const value=receipt(f,'slack-v1',{sourceRecords});await assert.rejects(f.migration.process(location(value),Buffer.from(JSON.stringify(value)),{write:false}));}
 const legacy=receipt(f,'slack-v1');await assert.rejects(createObjectMigration({...f.options,registryRecords:[{...f.record,provider:'github'}]}).process(location(legacy),Buffer.from(JSON.stringify(legacy)),{write:false}),/original Slack source/);
 await assert.rejects(createObjectMigration({...f.options,registryRecords:[]}).process(location(legacy),Buffer.from(JSON.stringify(legacy)),{write:false}),/source binding/);
 await assert.rejects(f.migration.process(location(legacy).replace(hash(legacy.key),hash('wrong')),Buffer.from(JSON.stringify(legacy)),{write:false}),/identity mismatch/);
});

test('known old constraint upgrades atomically without changing retained rows or table identity',{skip:!url},async t=>{
 const f=await fixture(t);await f.pool.query(oldDDL);
 const value=receipt(f,'slack-v4',{sourceRecords:11}),original=audit(f,value);await f.repo.importRetirement(original);
 const snapshot={...original,key:'snapshot',kind:'snapshot',receipt:{pipeline:'workspace-v1',fingerprint:hash('snapshot'),records:5,objects:2}};await f.repo.importRetirement(snapshot);
 const before=(await f.pool.query(`SELECT tableoid::text,ctid::text,to_jsonb(r) AS row FROM ${table} r ORDER BY retirement_key`)).rows;
 await f.repo.ready();const after=(await f.pool.query(`SELECT tableoid::text,ctid::text,to_jsonb(r) AS row FROM ${table} r ORDER BY retirement_key`)).rows;assert.deepEqual(after,before);
 assert.deepEqual(await f.repo.exportRetirement(original.bucket,original.key),original);assert.deepEqual(await f.repo.exportRetirement(snapshot.bucket,snapshot.key),snapshot);
 const legacy=audit(f,receipt(f,'slack-v1'));await f.repo.importRetirement(legacy);assert.deepEqual(await f.repo.exportRetirement(legacy.bucket,legacy.key),legacy);
 const guard=(await f.pool.query("SELECT oid::text,convalidated,pg_get_constraintdef(oid,false) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2",[table,constraint])).rows[0];assert.ok(guard.convalidated);assert.match(guard.definition,/slack-v1/);
 await f.repo.ready();assert.equal((await f.pool.query('SELECT oid::text FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',[table,constraint])).rows[0].oid,guard.oid);
 // Direct SQL still denies missing newer counts and invalid legacy numeric values.
 await assert.rejects(f.pool.query(`UPDATE ${table} SET pipeline='slack-v6' WHERE retirement_key=$1`,[legacy.key]),e=>e.code==='23514');
 await assert.rejects(f.pool.query(`UPDATE ${table} SET source_records=-1 WHERE retirement_key=$1`,[legacy.key]),e=>e.code==='23514');
 assert.deepEqual(await f.repo.exportRetirement(legacy.bucket,legacy.key),legacy);
});

test('unknown, missing, or unvalidated old constraints are refused without adopting them',{skip:!url},async t=>{
 for(const mode of ['unknown','missing','unvalidated'])await t.test(mode,async t=>{
  const f=await fixture(t);await f.pool.query(oldDDL);await f.pool.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`);
  if(mode!=='missing')await f.pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK(records>=0)${mode==='unvalidated'?' NOT VALID':''}`);
  const before=(await f.pool.query('SELECT oid::text,convalidated,pg_get_constraintdef(oid,false) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',[table,constraint])).rows;
  await assert.rejects(f.repo.ready(),/Unsupported connector cache retirement constraint/);
  assert.deepEqual((await f.pool.query('SELECT oid::text,convalidated,pg_get_constraintdef(oid,false) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname=$2',[table,constraint])).rows,before);
 });
});
