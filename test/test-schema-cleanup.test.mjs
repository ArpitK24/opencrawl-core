import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';
import {Pool} from 'pg';
import {dropTestSchemas,postgresUrl} from './fixtures/application-database.mjs';

test('schema cleanup refuses unowned names before obtaining a database client',async()=>{
 const pool={connect:async()=>assert.fail('Invalid cleanup reached PostgreSQL')};
 for(const names of [[],['public'],['information_schema'],['pg_catalog'],['oc_query_unsafe'],['oc_query_'+'a'.repeat(32),'oc_query_'+'a'.repeat(32)],['x;DROP DATABASE y']])await assert.rejects(dropTestSchemas(pool,names),/generated test schemas/);
});

test('schema cleanup waits for identity introspection and removes only its explicit schema',{skip:!postgresUrl},async()=>{
 const pool=new Pool({connectionString:postgresUrl,max:3}),name='oc_query_'+randomUUID().replaceAll('-',''),other='oc_query_'+randomUUID().replaceAll('-','');
 let holder,operation;
 try{
  await pool.query(`CREATE SCHEMA "${name}"; CREATE SCHEMA "${other}"`);holder=await pool.connect();await holder.query('BEGIN');await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('opencrawl:identity-schema:maintenance',0))");
  let droppingPid;operation=dropTestSchemas({connect:async()=>{const client=await pool.connect();droppingPid=client.processID;return client;}},[name]);
  let waiting=false;
  for(let i=0;i<250&&!waiting;i++){if(droppingPid)waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS waiting",[droppingPid])).rows[0].waiting;if(!waiting)await setTimeout(20);}
  assert.equal(waiting,true,'Cleanup must wait on the same introspection lock');assert.equal((await pool.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname=ANY($1)',[[name,other]])).rows[0].n,2);
  await holder.query('COMMIT');holder.release();holder=null;await operation;operation=null;
  assert.deepEqual((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=ANY($1) ORDER BY nspname',[[name,other]])).rows,[{nspname:other}]);
 }finally{
  if(holder){await holder.query('ROLLBACK');holder.release();}await operation?.catch(()=>{});
  try{await dropTestSchemas(pool,[name,other]);}finally{await pool.end();}
 }
});
