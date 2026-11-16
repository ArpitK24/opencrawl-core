import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createApplicationDatabase} from '../dist/src/state/postgres.mjs';
import {migrateApplicationSources,migrationHash} from '../dist/src/state/migration-engine.mjs';
import {canonical,targetDigest,orderedMigrationRows} from '../dist/src/state/sqlite-import.mjs';
import {ensureDeletionRequestSchema} from '../dist/src/state/deletion-requests.mjs';
import {postgresUrl} from './fixtures/application-database.mjs';

const live=(name,fn)=>test(name,{skip:!postgresUrl},fn);
async function fixture(t){
 const admin=new Pool({connectionString:postgresUrl,max:1}),schema='oc_query_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);
 const database=createApplicationDatabase({connectionString:postgresUrl,namespace:'query-fixture',options:'-c search_path='+schema,max:2});
 t.after(async()=>{await database.close();try{await admin.query(`DROP SCHEMA ${schema} CASCADE; DROP SCHEMA IF EXISTS ${database.identitySchema} CASCADE`);}finally{await admin.end();}});
 return {database,schema};
}
function nodes(plan){return [plan,...(plan.Plans??[]).flatMap(nodes)];}
async function explain(client,query,values=[]){return (await client.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query,values)).rows[0]['QUERY PLAN'][0].Plan;}
async function providerCollation(client){const result=await client.query("SELECT collname FROM pg_collation WHERE collisdeterministic AND collencoding IN (-1,pg_char_to_encoding(current_setting('server_encoding'))) AND ((collprovider='i' AND current_setting('server_encoding')='UTF8') OR collcollate NOT IN ('C','POSIX')) ORDER BY (collname='en-US-x-icu') DESC,collname LIMIT 1");return result.rows[0]?.collname??'POSIX';}
function indexedPage(plan,name,limit){
 const all=nodes(plan);assert.ok(!all.some(node=>/Sort|Seq Scan/.test(node['Node Type'])),JSON.stringify(plan));
 const scan=all.find(node=>node['Index Name']===name);assert.ok(scan,JSON.stringify(plan));assert.equal(scan['Actual Rows'],limit);assert.equal(scan['Rows Removed by Filter']??0,0);
}

live('migration schema upgrade adds the byte-order index without changing an existing manifest or source rows',async t=>{
 const {database}=await fixture(t);
 const collation=await providerCollation(database.pool);t.diagnostic('Published schema source-key collation: '+collation);
 // Published478 schema: preserve its default-collation PK and exact saved data.
 await database.pool.query(`CREATE TABLE opencrawl_application_installations(namespace text PRIMARY KEY,source_identity jsonb NOT NULL,migration_id uuid NOT NULL,state text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,source_manifest_hash text,inventory_complete boolean NOT NULL DEFAULT false);
 CREATE TABLE opencrawl_application_migration_sources(namespace text NOT NULL REFERENCES opencrawl_application_installations(namespace),source_key text COLLATE "${collation.replaceAll('"','""')}" NOT NULL,domain text NOT NULL,source_version text,source_hash text NOT NULL,source_bytes bigint NOT NULL,PRIMARY KEY(namespace,source_key));
 CREATE TABLE opencrawl_application_migrations(namespace text NOT NULL REFERENCES opencrawl_application_installations(namespace),domain text NOT NULL,source_key text NOT NULL,source_version text,source_hash text NOT NULL,target_hash text NOT NULL,imported_rows bigint NOT NULL,completed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(namespace,domain,source_key))`);
 const source={version:1,bucket:'upgrade-fixture',prefix:'legacy',organizationId:null},migrationId=randomUUID();
 const entries=Array.from({length:777},(_,i)=>{const key=['a','Z','é','中','😀'][i%5]+'/'+String(i).padStart(5,'0');return {key,domain:'audit',version:null,hash:migrationHash(key),bytes:i};}).sort((a,b)=>Buffer.compare(Buffer.from(a.key),Buffer.from(b.key)));
 const manifest=migrationHash(entries.map(value=>canonical(value)+'\n').join(''));
 await database.pool.query("INSERT INTO opencrawl_application_installations(namespace,source_identity,migration_id,state,verified_at,source_manifest_hash,inventory_complete) VALUES($1,$2,$3,'ready',now(),$4,true)",[database.namespace,source,migrationId,manifest]);
 for(const value of entries){await database.pool.query('INSERT INTO opencrawl_application_migration_sources VALUES($1,$2,$3,$4,$5,$6)',[database.namespace,value.key,value.domain,value.version,value.hash,value.bytes]);await database.pool.query('INSERT INTO opencrawl_application_migrations(namespace,domain,source_key,source_hash,target_hash,imported_rows) VALUES($1,$2,$3,$4,$4,0)',[database.namespace,value.domain,value.key,value.hash]);}
 const before=(await database.pool.query('SELECT * FROM opencrawl_application_installations')).rows;
 const result=await migrateApplicationSources({database,source,mode:'verify',checkAccess:async()=>{},sources:async()=>{throw Error('Ready upgrade must not reopen legacy sources');}});
 assert.equal(result.manifest,manifest);assert.equal(result.sources,777);assert.equal(result.migrationId,migrationId);assert.equal(result.alreadyReady,true);
 assert.deepEqual((await database.pool.query('SELECT * FROM opencrawl_application_installations')).rows,before);
 assert.equal((await database.pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND indexname='opencrawl_application_sources_byte_order'")).rows.length,1);
 assert.equal((await database.pool.query('SELECT count(*)::int n FROM opencrawl_application_migration_sources')).rows[0].n,777);
});

live('all migration keyset pages and receipt batches use matching indexes on actual PostgreSQL',async t=>{
 const {database}=await fixture(t);await database.ready();await ensureDeletionRequestSchema(database);
 const source={version:1,bucket:'plan-fixture',prefix:'legacy',organizationId:null};let tempDDL,tempQuery;
 await database.pool.query("INSERT INTO opencrawl_application_installations(namespace,source_identity,migration_id,state) VALUES($1,$2,$3,'importing')",[database.namespace,source,randomUUID()]);
 const connect=database.pool.connect.bind(database.pool);
 database.pool.connect=async()=>{const client=await connect(),query=client.query,release=client.release;
  client.query=function(sql,...args){if(typeof sql==='string'){if(sql.startsWith('CREATE TEMP TABLE oc_application_migration_scan'))tempDDL=sql;if(sql.includes('FROM oc_application_migration_scan WHERE source_key COLLATE'))tempQuery=sql;}return query.call(this,sql,...args);};
  client.release=function(...args){client.query=query;client.release=release;return release.apply(this,args);};return client;};
 try{await migrateApplicationSources({database,source,mode:'check',checkAccess:async()=>{},sources:async()=>({async *inventory(){},async validateInventory(){},async read(){throw Error('No source');},async finalize(){return {};}})});}finally{database.pool.connect=connect;}
 assert.ok(tempDDL&&tempQuery,'Capture exact product scan schema and query');
 const client=await database.pool.connect();
 try{
  await client.query(tempDDL);
  await client.query("INSERT INTO opencrawl_application_migration_sources SELECT $1,'s3:'||md5(i::text),'session-indexing',null,repeat('a',64),12 FROM generate_series(1,50000)i",[database.namespace]);
  await client.query('INSERT INTO oc_application_migration_scan(source_key,domain,source_version,source_hash,source_bytes) SELECT source_key,domain,source_version,source_hash,source_bytes FROM opencrawl_application_migration_sources');
  await client.query("INSERT INTO opencrawl_application_migrations(namespace,domain,source_key,source_hash,target_hash,imported_rows) SELECT namespace,domain,source_key,source_hash,source_hash,1 FROM opencrawl_application_migration_sources");
  await client.query("INSERT INTO opencrawl_session_deletions SELECT $1,'s3:'||md5(i::text),'prefix','org_fixture','user_fixture','codex',i::text,now() FROM generate_series(1,50000)i",[database.namespace]);
  await client.query('ANALYZE opencrawl_application_migration_sources; ANALYZE oc_application_migration_scan; ANALYZE opencrawl_application_migrations; ANALYZE opencrawl_session_deletions');
  indexedPage(await explain(client,tempQuery,['s3:8']),'oc_application_migration_scan_pkey',256);
  indexedPage(await explain(client,tempQuery.replace('LIMIT 256','LIMIT 100'),['s3:8']),'oc_application_migration_scan_pkey',100);
  indexedPage(await explain(client,'SELECT source_key,domain,source_version,source_hash,source_bytes FROM opencrawl_application_migration_sources WHERE namespace=$1 AND source_key COLLATE "C">$2 ORDER BY source_key COLLATE "C" LIMIT 256',[database.namespace,'s3:8']),'opencrawl_application_sources_byte_order',256);
  indexedPage(await explain(client,'SELECT request_key FROM opencrawl_session_deletions WHERE namespace=$1 AND source_prefix=$2 AND request_key COLLATE "C">$3 ORDER BY request_key COLLATE "C" LIMIT 51',[database.namespace,'prefix','s3:8']),'opencrawl_session_deletions_byte_order',51);
  const keys=(await client.query('SELECT source_key FROM opencrawl_application_migration_sources LIMIT 100')).rows.map(row=>row.source_key);
  indexedPage(await explain(client,"SELECT domain,source_key,source_version,source_hash,target_hash,imported_rows FROM opencrawl_application_migrations WHERE namespace=$1 AND domain='session-indexing' AND source_key=ANY($2::text[])",[database.namespace,keys]),'opencrawl_application_migrations_pkey',100);
 }finally{await client.query('DROP TABLE IF EXISTS pg_temp.oc_application_migration_scan');client.release();}
});

live('provider-owned text digests use one ordered cursor and preserve Unicode bytes across bounded pages',async t=>{
 const {database,schema}=await fixture(t);
 const client=await database.pool.connect();
 try{
  await client.query('BEGIN');
  const collation=await providerCollation(client);
  await client.query(`CREATE TABLE ${schema}.provider_rows(id text COLLATE "${collation.replaceAll('"','""')}" PRIMARY KEY,value text NOT NULL)`);
  t.diagnostic('Provider primary-key collation: '+collation);
  const rows=Array.from({length:777},(_,i)=>({id:['a','Z','é','中','😀'][i%5]+'/'+String(i).padStart(5,'0'),value:String(i)}));
  await client.query(`INSERT INTO ${schema}.provider_rows SELECT id,value FROM jsonb_to_recordset($1) AS x(id text,value text)`,[JSON.stringify(rows)]);
  let declarations=0,fetches=0,maxRows=0;const original=client.query;
  client.query=async function(sql,...args){const result=await original.call(this,sql,...args);if(sql.startsWith('DECLARE '))declarations++;if(sql.startsWith('FETCH ')){fetches++;maxRows=Math.max(maxRows,result.rows.length);}return result;};
  const actual=await targetDigest(client,schema,{name:'provider_rows',columns:{id:'text',value:'text'},primary:['id'],order:0},['id','value']);
  rows.sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
  assert.deepEqual(actual,{rows:777,sha256:migrationHash(rows.map(row=>canonical(row)+'\n').join(''))});
  assert.equal(declarations,1);assert.equal(fetches,4);assert.equal(maxRows,256);
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_cursors WHERE name LIKE 'oc_migration_%'")).rows[0].n,0);
  for await(const row of orderedMigrationRows(client,`SELECT * FROM ${schema}.provider_rows ORDER BY id COLLATE "C"`)){assert.ok(row.id);break;}
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_cursors WHERE name LIKE 'oc_migration_%'")).rows[0].n,0);
  await assert.rejects(async()=>{for await(const row of orderedMigrationRows(client,`SELECT * FROM ${schema}.provider_rows ORDER BY id COLLATE "C"`)){assert.ok(row.id);throw Error('Injected digest consumer failure');}},/Injected digest consumer failure/);
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_cursors WHERE name LIKE 'oc_migration_%'")).rows[0].n,0);
  await client.query('COMMIT');
 }finally{await client.query('ROLLBACK');client.release();}
});

live('Unicode multi-page imports retain their exact byte-order manifest across interruption and reject source drift',async t=>{
 const {database}=await fixture(t);await database.ready();
 const source={version:1,bucket:'resume-fixture',prefix:'legacy',organizationId:null},migrationId=randomUUID();
 await database.pool.query("INSERT INTO opencrawl_application_installations(namespace,source_identity,migration_id,state) VALUES($1,$2,$3,'importing')",[database.namespace,source,migrationId]);
 const records=Array.from({length:777},(_,i)=>{const key=['a','Z','é','中','😀'][i%5]+'/'+String(i).padStart(5,'0'),body={value:key};return {entry:{key,domain:'audit',version:null,hash:migrationHash(canonical(body)),bytes:Buffer.byteLength(canonical(body))},readback:{source:body,target:body,rows:0}};});
 const expected=migrationHash([...records].sort((a,b)=>Buffer.compare(Buffer.from(a.entry.key),Buffer.from(b.entry.key))).map(value=>canonical(value.entry)+'\n').join(''));
 let read=0,interrupt=true,drift=false;
 const options={database,source,mode:'migrate',writersStopped:true,checkAccess:async()=>{},sources:async()=>({
  async *inventory(){for(const value of records)yield {...value,entry:drift&&value===records[0]?{...value.entry,hash:migrationHash('changed')}:value.entry,legacy:true};},
  async validateInventory(){},async read(entry){if(interrupt&&++read>257)throw Error('Injected page interruption');const value=records.find(value=>value.entry.key===entry.key);assert.ok(value);return {...value,migrate:async()=>value.readback};},async finalize(){return {};}
 })};
 await assert.rejects(migrateApplicationSources(options),/Injected page interruption/);
 const original=(await database.pool.query('SELECT source_key,source_hash,target_hash,completed_at FROM opencrawl_application_migrations ORDER BY source_key COLLATE "C"')).rows;assert.equal(original.length,257);
 drift=true;await assert.rejects(migrateApplicationSources(options),/Legacy source changed/);drift=false;interrupt=false;
 const result=await migrateApplicationSources(options);assert.equal(result.manifest,expected);assert.equal(result.migrationId,migrationId);assert.equal(result.sources,777);
 const after=(await database.pool.query('SELECT source_key,source_hash,target_hash,completed_at FROM opencrawl_application_migrations ORDER BY source_key COLLATE "C"')).rows;
 assert.deepEqual(after.slice(0,257),original);assert.equal(after.length,777);
});

live('already-installed migration indexes do not acquire index-build locks during later schema readiness',async t=>{
 const {database,schema}=await fixture(t);await database.ready();await ensureDeletionRequestSchema(database);
 const writer=await database.pool.connect(),next=createApplicationDatabase({connectionString:postgresUrl,namespace:database.namespace,options:'-c search_path='+schema+' -c lock_timeout=250ms'});
 try{
  await writer.query('BEGIN; LOCK TABLE opencrawl_application_migration_sources,opencrawl_session_deletions IN ROW EXCLUSIVE MODE');
  await next.ready();await ensureDeletionRequestSchema(next);
 }finally{await writer.query('ROLLBACK');writer.release();await next.close();}
});

live('a preexisting wrong index definition cannot substitute for the required migration index',async t=>{
 const {database,schema}=await fixture(t);await database.ready();
 for(const definition of ['namespace,source_key','namespace text_pattern_ops,source_key COLLATE "C" text_pattern_ops','namespace,source_key COLLATE "C" DESC']){
  await database.pool.query('DROP INDEX opencrawl_application_sources_byte_order; CREATE INDEX opencrawl_application_sources_byte_order ON opencrawl_application_migration_sources('+definition+')');
  const next=createApplicationDatabase({connectionString:postgresUrl,namespace:database.namespace,options:'-c search_path='+schema});
  try{await assert.rejects(next.ready(),/Existing migration byte-order index is incompatible/);}finally{await next.close();}
 }
});
