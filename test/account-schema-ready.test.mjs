import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {Pool} from 'pg';
import {createApplicationDatabase} from '../dist/src/state/postgres.mjs';
import {createAccountState} from '../dist/src/state/account-state.mjs';
import {createCaptureCredentials} from '../dist/src/sessions/credentials.mjs';
import {createCaptureHandler} from '../dist/src/sessions/ingest.mjs';
import {sessionScope} from '../dist/src/sessions/event-identity.mjs';
import {postgresUrl} from './fixtures/application-database.mjs';
const live=(name,run)=>test(name,{skip:!postgresUrl},run),owner={tenantId:'org_schema',userId:'user_owner'},peer={...owner,userId:'user_peer'};
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){
 const schema='oc_account_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:postgresUrl,max:1});await admin.query(`CREATE SCHEMA ${schema}`);
 const database=createApplicationDatabase({connectionString:postgresUrl,namespace:schema,max:4,options:'-c search_path='+schema+' -c lock_timeout=400ms'});let closed=false;
 const close=async()=>{if(closed)return;closed=true;await database.close();try{await admin.query(`DROP SCHEMA ${schema} CASCADE; DROP SCHEMA IF EXISTS ${database.identitySchema} CASCADE`);}finally{await admin.end();}};
 t.after(close);await database.ready();return {database,close};
}
async function schemaEvidence(database){return (await database.pool.query(`SELECT c.relname,con.oid::text,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid WHERE c.relnamespace=current_schema()::regnamespace AND c.relname IN ('opencrawl_capture_credentials','opencrawl_capture_generations') ORDER BY c.relname,con.conname`)).rows;}
async function legacy(database){
 await database.pool.query(`CREATE TABLE opencrawl_capture_credentials(namespace text NOT NULL,credential_id text NOT NULL,owner_scope text NOT NULL,record jsonb NOT NULL,PRIMARY KEY(namespace,credential_id),CHECK(record->>'id'=credential_id));
 CREATE TABLE opencrawl_capture_generations(namespace text NOT NULL,owner_scope text NOT NULL,generation text NOT NULL,PRIMARY KEY(namespace,owner_scope));
 CREATE INDEX opencrawl_capture_credentials_owner ON opencrawl_capture_credentials(namespace,owner_scope)`);
 const token='occ1_'+'a'.repeat(64),record={schemaVersion:1,id:hash(token),principal:owner,expiresAt:'2030-01-01T00:00:00.000Z',revoked:false,generation:'b'.repeat(64)};
 await database.pool.query('INSERT INTO opencrawl_capture_credentials VALUES($1,$2,$3,$4)',[database.namespace,record.id,sessionScope(owner),record]);
 await database.pool.query('INSERT INTO opencrawl_capture_generations VALUES($1,$2,$3)',[database.namespace,sessionScope(owner),record.generation]);return {token,record};
}

live('current account startup does not block a real credential request holding generation and credential writer locks',async t=>{
 const {database}=await fixture(t),accounts=createAccountState(database);await accounts.ready();const before=await schemaEvidence(database);
 let release,acquired;const held=new Promise(r=>acquired=r),resume=new Promise(r=>release=r);
 const issuing={...database,transaction:run=>database.transaction(async client=>{
  // Hold the actual transaction's table lock while paused after its generation read.
  await client.query('LOCK TABLE opencrawl_capture_credentials IN ROW EXCLUSIVE MODE');const query=client.query;
  client.query=async function(sql,...args){const result=await query.call(this,sql,...args);if(sql.startsWith('SELECT generation FROM opencrawl_capture_generations')){acquired();await resume;}return result;};
  try{return await run(client);}finally{client.query=query;}
 })};
 const credentials=createCaptureCredentials({state:{accounts:createAccountState(issuing)}}),handler=createCaptureHandler({ingest:{},credentials,authenticate:async()=>owner});
 const server=createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const response=fetch('http://127.0.0.1:'+server.address().port+'/api/sessions/credentials',{method:'POST'}).then(async r=>({status:r.status,body:await r.json()}));
 try{
  try{await held;await createAccountState(database).ready();assert.deepEqual(await schemaEvidence(database),before,'Current constraints remain the same objects, not recreated');}finally{release();}
  const result=await response;assert.equal(result.status,200,JSON.stringify(result.body.error));assert.ok(result.body.data?.token);assert.ok(await accounts.credentials.authenticate(hash(result.body.data.token)));
 }finally{release();await response.catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));}
});

live('concurrent credential issue, revocation and repeated startup preserve owner serialization',async t=>{
 const {database}=await fixture(t),accounts=createAccountState(database);await accounts.ready();const credentials=createCaptureCredentials({state:{accounts}}),agent=createCaptureCredentials({state:{accounts},purpose:'agent'});
 const peerToken=await credentials.issue(peer),agentToken=await agent.issue(owner);
 let release,acquired;const held=new Promise(r=>acquired=r),resume=new Promise(r=>release=r);
 const issuing={...database,transaction:run=>database.transaction(async client=>{const query=client.query;client.query=async function(sql,...args){const r=await query.call(this,sql,...args);if(sql.startsWith('SELECT generation FROM opencrawl_capture_generations')){acquired();await resume;}return r;};try{return await run(client);}finally{client.query=query;}})};
 const issuingCredentials=createCaptureCredentials({state:{accounts:createAccountState(issuing)}}),pending=issuingCredentials.issue(owner);await held;
 const revoked=credentials.revokeAll(owner);revoked.catch(()=>{});
 let issued;try{try{await Promise.all([createAccountState(database).ready(),createAccountState(database).ready()]);}finally{release();}
 issued=await pending;await revoked;}finally{release();await Promise.allSettled([pending,revoked]);}
 assert.equal(await credentials.authenticate(issued.token),null);assert.ok(await credentials.authenticate(peerToken.token));assert.ok(await agent.authenticate(agentToken.token));
 const fresh=await credentials.issue(owner);assert.ok(await credentials.authenticate(fresh.token));
});

live('exact legacy account schema upgrades once with original rows, generations and purpose isolation intact',async t=>{
 const {database}=await fixture(t),{token,record}=await legacy(database),accounts=createAccountState(database);await accounts.ready();
 assert.deepEqual(await accounts.exportCredential(record.id),record);assert.deepEqual(await accounts.exportGeneration(sessionScope(owner)),{generation:record.generation});
 const capture=createCaptureCredentials({state:{accounts}}),agent=createCaptureCredentials({state:{accounts},purpose:'agent'});assert.ok(await capture.authenticate(token));assert.equal(await agent.authenticate(token),null);
 await accounts.importCredential(record,'agent');await accounts.importGeneration(sessionScope(owner),{generation:record.generation},'agent');assert.ok(await agent.authenticate(token));
 await capture.revokeAll(owner);assert.equal(await capture.authenticate(token),null);assert.ok(await agent.authenticate(token));
 await assert.rejects(database.pool.query("UPDATE opencrawl_capture_credentials SET purpose='foreign'"),{code:'23514'});
 const indexes=(await database.pool.query("SELECT to_regclass(current_schema()||'.opencrawl_capture_credentials_owner') AS old,to_regclass(current_schema()||'.opencrawl_credentials_purpose_owner') AS current")).rows[0];assert.equal(indexes.old,null);assert.ok(indexes.current);
 const before=await schemaEvidence(database);await createAccountState(database).ready();assert.deepEqual(await schemaEvidence(database),before);
});

live('account startup rejects incompatible purpose columns, constraints, primary keys and owner indexes',async t=>{
 const mutations=[
  "ALTER TABLE opencrawl_capture_credentials DROP CONSTRAINT opencrawl_capture_credentials_pkey; ALTER TABLE opencrawl_capture_credentials ADD PRIMARY KEY(namespace,credential_id); ALTER TABLE opencrawl_capture_credentials ALTER COLUMN purpose DROP NOT NULL",
  "ALTER TABLE opencrawl_capture_generations ALTER COLUMN purpose SET DEFAULT 'agent'",
  "ALTER TABLE opencrawl_capture_credentials DROP CONSTRAINT opencrawl_capture_credentials_purpose_check",
  "ALTER TABLE opencrawl_capture_credentials DROP CONSTRAINT opencrawl_capture_credentials_purpose_check; ALTER TABLE opencrawl_capture_credentials ADD CHECK(purpose IN ('capture','agent','foreign'))",
  "ALTER TABLE opencrawl_capture_generations DROP CONSTRAINT opencrawl_capture_generations_purpose_check; ALTER TABLE opencrawl_capture_generations ADD CONSTRAINT opencrawl_capture_generations_purpose_check CHECK(purpose IN ('capture','agent')) NOT VALID",
  "ALTER TABLE opencrawl_capture_credentials DROP CONSTRAINT opencrawl_capture_credentials_pkey; ALTER TABLE opencrawl_capture_credentials ADD PRIMARY KEY(credential_id)",
  'DROP INDEX opencrawl_credentials_purpose_owner; CREATE INDEX opencrawl_credentials_purpose_owner ON opencrawl_capture_credentials(namespace,owner_scope)',
  'CREATE INDEX opencrawl_capture_credentials_owner ON opencrawl_capture_generations(namespace,owner_scope)',
 ];
 for(const sql of mutations){const {database,close}=await fixture(t);try{await createAccountState(database).ready();await database.pool.query(sql);const before=await schemaEvidence(database);await assert.rejects(createAccountState(database).ready(),/Incompatible credential|Existing.*index.*incompatible/i);assert.deepEqual(await schemaEvidence(database),before);}finally{await close();}}
});

live('legacy account upgrade rolls back column and primary-key changes when a named owner index is incompatible',async t=>{
 const {database}=await fixture(t),{record}=await legacy(database);await database.pool.query('CREATE INDEX opencrawl_credentials_purpose_owner ON opencrawl_capture_credentials(credential_id)');const before=await schemaEvidence(database);
 await assert.rejects(createAccountState(database).ready(),/index.*incompatible/i);
 assert.deepEqual(await schemaEvidence(database),before);assert.equal((await database.pool.query("SELECT count(*)::int n FROM pg_attribute WHERE attrelid='opencrawl_capture_credentials'::regclass AND attname='purpose' AND NOT attisdropped")).rows[0].n,0);
 assert.deepEqual((await database.pool.query('SELECT record FROM opencrawl_capture_credentials')).rows[0].record,record);assert.ok((await database.pool.query("SELECT to_regclass('opencrawl_capture_credentials_owner') AS old")).rows[0].old);
});


live('legacy account upgrade drops only its owning index when an earlier schema has the same index name',async t=>{
 const {database}=await fixture(t),{record}=await legacy(database),shadow='oc_shadow_'+randomUUID().replaceAll('-','');
 await database.pool.query(`CREATE SCHEMA ${shadow}; CREATE TABLE ${shadow}.unrelated(namespace text,owner_scope text); CREATE INDEX opencrawl_capture_credentials_owner ON ${shadow}.unrelated(namespace,owner_scope)`);
 const before=(await database.pool.query("SELECT c.oid::text,c.relname,i.indrelid::text FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid WHERE c.relnamespace=$1::regnamespace AND c.relname='opencrawl_capture_credentials_owner'",[shadow])).rows[0];
 const scoped={...database,transaction:run=>database.transaction(async client=>{
  // Introduce the competing search-path name after normal owning-schema creation.
  const query=client.query;client.query=async function(sql,...args){const result=await query.call(this,sql,...args);if(sql.startsWith('CREATE TABLE IF NOT EXISTS opencrawl_capture_credentials'))await query.call(this,`SET LOCAL search_path=${shadow},${database.namespace}`);return result;};
  try{return await run(client);}finally{client.query=query;}
 })};
 try{
  const accounts=createAccountState(scoped);await accounts.ready();assert.deepEqual(await accounts.exportCredential(record.id),record);
  assert.deepEqual((await database.pool.query("SELECT c.oid::text,c.relname,i.indrelid::text FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid WHERE c.relnamespace=$1::regnamespace AND c.relname='opencrawl_capture_credentials_owner'",[shadow])).rows[0],before);
  assert.equal((await database.pool.query("SELECT to_regclass($1||'.opencrawl_capture_credentials_owner') AS old",[database.namespace])).rows[0].old,null);
 }finally{await database.pool.query(`DROP SCHEMA ${shadow} CASCADE`);}

});
