import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createSetupStatus} from '../dist/src/setup/status.mjs';
import {createSetupHandler} from '../dist/src/setup/http.mjs';
import {createSessionIngest} from '../dist/src/sessions/ingest.mjs';
import {createSessionSearch} from '../dist/src/sessions/search.mjs';
import {createSessionPipeline} from '../dist/src/sessions/indexer.mjs';
import {createWorkspaceSearch} from '../dist/src/search/workspace.mjs';
import {createOpenCrawlMcp} from '../dist/src/mcp/server.mjs';
import {memorySessionStore} from './session-store-fixture.mjs';

const owner={tenantId:'org_setup',userId:'alice'};
const selection={installationId:'machine-installation',client:'codex'};
const observation=(client='codex',extra={})=>({client,installed:true,forward:true,history:'skip',historyProgress:{state:'not_started',completed:0},hookTrust:'pending',...extra});
const registration=(clients=[observation()])=>({installationId:selection.installationId,machine:{id:'machine',label:'My machine'},clients});
async function fixture() {
  const store=memorySessionStore();let time=Date.parse('2026-11-14T12:00:00Z'),hits=[],fetched,searches=0;
  const search={search:async()=>{searches++;return {results:hits};},fetch:async()=>fetched??hits[0]};
  const setup=createSetupStatus({store,search,now:()=>new Date(time)});
  await setup.installation(owner,registration([observation(),observation('claude-code')]));
  const proof=(await setup.verify(owner,selection)).proof;time+=1000;
  const batch=(extra={})=>({schemaVersion:1,installationId:selection.installationId,sessionId:'native-session',harness:'codex',origin:'cli',captureMode:'live',owner,events:[{id:'native-message',nativeId:'native-message',kind:'message',timestamp:new Date(time).toISOString(),data:{role:'assistant',content:proof.marker}}],attachments:[],...extra});
  const hit=(extra={})=>({source:'sessions',id:'sessions:passage',text:proof.marker,provenance:{userId:owner.userId,installationId:selection.installationId,harness:'codex',sessionId:'native-session',eventId:'native-message'},...extra});
  return {setup,store,proof,batch,hit,get searches(){return searches;},setHits:v=>{hits=v;},setFetched:v=>{fetched=v;},advance:ms=>{time+=ms;}};
}

test('setup records independent choices and fails closed on scope, capture-only tokens and client-supplied evidence',async()=>{
  const f=await fixture();
  const state=await f.setup.read(owner);assert.equal(state.firstWin,null);assert.equal(state.installations[0].clients[1].proof.state,'pending');
  assert.deepEqual((await f.setup.read({...owner,tenantId:'other'})).installations,[]);
  assert.deepEqual((await f.setup.read({...owner,userId:'bob'})).installations,[]);
  await assert.rejects(f.setup.read({userId:'alice'}),/Authentication/);
  await assert.rejects(f.setup.read({...owner,captureAccess:'write'}),{status:403});
  await assert.rejects(f.setup.installation(owner,{...registration(),tenantId:'foreign'}),{status:400});
  await assert.rejects(f.setup.installation(owner,registration([{...observation(),mcp:{state:'authenticated'}}])),{status:400});
  await assert.rejects(f.setup.installation(owner,{...registration(),machine:{id:'different',label:'Changed'}}),{status:409});
  await assert.rejects(f.setup.verify({...owner,userId:'bob'},selection),{status:404});
  const restarted=createSetupStatus({store:f.store,search:{search:async()=>({results:[]}),fetch:async()=>null}});
  assert.equal((await restarted.read(owner)).installations[0].installationId,selection.installationId);
});

test('history, old events, unrelated clients, other installations, hooks and forged ownership never prove capture',async()=>{
  const f=await fixture();
  for(const changed of [
    {captureMode:'history'},{captureMode:undefined},{installationId:'other-installation'},{harness:'claude-code'},{origin:'subagent'},
    {events:[{...f.batch().events[0],timestamp:'2026-11-14T11:59:00Z'}]},
    {events:[{...f.batch().events[0],timestamp:null}]},
    {events:[{...f.batch().events[0],kind:'hook'}]},
    {events:[{...f.batch().events[0],data:{role:'system',content:f.proof.marker}}]},
    {events:[{...f.batch().events[0],data:{role:'user',content:[{type:'tool_result',tool_use_id:'terminal',content:f.proof.marker}]}}]},
  ])await f.setup.session(owner,f.batch(changed));
  await assert.rejects(f.setup.session({...owner,userId:'bob'},f.batch()),{status:403});
  assert.equal((await f.setup.verify(owner,selection)).proof.state,'waiting_capture');assert.equal(f.searches,0);
});

test('a new captured event waits for exact authorized search AND fetch; first win verifies only that client',async()=>{
  const f=await fixture();await f.setup.session(owner,f.batch());
  let checked=await f.setup.verify(owner,selection);assert.equal(checked.proof.state,'waiting_index');
  assert.ok(checked.captureObservedAt);assert.equal(checked.hookTrust,'pending');assert.equal(checked.humanTasks.some(t=>t.kind==='hook_trust'),false);
  for(const [key,value] of [['userId','bob'],['installationId','another'],['harness','claude-code'],['sessionId','another'],['eventId','other']]) {
    f.setHits([f.hit({provenance:{...f.hit().provenance,[key]:value}})]);
    assert.equal((await f.setup.verify(owner,selection)).proof.state,'waiting_index',key);
  }
  f.setHits([f.hit()]);f.setFetched(f.hit({text:'unrelated fetched text'}));
  assert.equal((await f.setup.verify(owner,selection)).proof.state,'waiting_index');
  f.setFetched(f.hit());checked=await f.setup.verify(owner,selection);
  assert.equal(checked.proof.state,'verified');assert.equal(checked.mcp.state,'pending');
  const state=await f.setup.read(owner);assert.equal(state.firstWin.client,'codex');assert.equal(state.installations[0].clients[1].proof.state,'pending');
  f.setHits([]);assert.equal((await f.setup.verify(owner,selection)).proof.state,'waiting_index','fresh verification cannot reuse a disappeared passage');
});

test('MCP needs its authenticated proof-specific call plus the selected native client tool result',async()=>{
  const f=await fixture();await f.setup.session(owner,f.batch());
  await assert.rejects(f.setup.mcp({...owner,userId:'bob'},{...selection,proofId:f.proof.id}),{status:404});
  await assert.rejects(f.setup.mcp(owner,{...selection,client:'claude-code',proofId:f.proof.id}),{status:409});
  const result=await f.setup.mcp(owner,{...selection,proofId:f.proof.id});
  let client=(await f.setup.read(owner)).installations[0].clients[0];assert.equal(client.mcp.state,'observed');
  assert.equal(JSON.stringify(await f.setup.read(owner)).includes(result.receipt),false,'MCP receipt is not available to CLI status');
  const event={id:'mcp-result',kind:'tool_result',timestamp:f.batch().events[0].timestamp,data:{call_id:'mcp-call',output:JSON.stringify(result)}};
  await f.setup.session(owner,f.batch({sessionId:'other-session',events:[event]}));
  assert.equal((await f.setup.read(owner)).installations[0].clients[0].mcp.state,'observed');
  await f.setup.session(owner,f.batch({captureMode:'history',events:[event]}));
  assert.equal((await f.setup.read(owner)).installations[0].clients[0].mcp.state,'observed');
  await f.setup.session(owner,f.batch({events:[event]}));
  assert.equal((await f.setup.read(owner)).installations[0].clients[0].mcp.state,'observed','a receipt in terminal output alone does not prove native MCP use');
  await f.setup.session(owner,f.batch({events:[{id:'terminal-call',kind:'tool_call',timestamp:f.batch().events[0].timestamp,data:{name:'exec_command',call_id:'mcp-call',arguments:JSON.stringify({...selection,proofId:f.proof.id})}}]}));
  assert.equal((await f.setup.read(owner)).installations[0].clients[0].mcp.state,'observed');
  await f.setup.session(owner,f.batch({events:[{id:'native-call',kind:'tool_call',timestamp:f.batch().events[0].timestamp,data:{name:'mcp__opencrawl__verify_installation',call_id:'mcp-call',arguments:JSON.stringify({...selection,proofId:f.proof.id})}}]}));
  client=(await f.setup.read(owner)).installations[0].clients[0];assert.equal(client.mcp.state,'authenticated');
  assert.equal(client.proof.state,'waiting_index','MCP auth never stands in for searchable capture');
});

test('Claude native tool_use and tool_result blocks bind MCP without treating terminal output as authentication',async()=>{
  const f=await fixture(),selected={...selection,client:'claude-code'},proof=(await f.setup.verify(owner,selected)).proof;
  f.advance(1000);const timestamp=f.batch().events[0].timestamp;
  await f.setup.session(owner,f.batch({harness:'claude-code',events:[{id:'claude-message',kind:'message',timestamp,data:{role:'assistant',content:[{type:'text',text:proof.marker}]}}]}));
  const result=await f.setup.mcp(owner,{...selected,proofId:proof.id});
  await f.setup.session(owner,f.batch({harness:'claude-code',events:[
    {id:'claude-call',kind:'message',timestamp,data:{role:'assistant',content:[{type:'tool_use',id:'claude-tool',name:'mcp__opencrawl__verify_installation',input:{...selected,proofId:proof.id}}]}},
    {id:'claude-result',kind:'message',timestamp,data:{role:'user',content:[{type:'tool_result',tool_use_id:'claude-tool',content:JSON.stringify(result)}]}},
  ]}));
  assert.equal((await f.setup.read(owner)).installations[0].clients[1].mcp.state,'authenticated');
});

test('search-only and history-only clients can observe MCP without enabling capture or claiming native proof',async()=>{
  const f=await fixture();
  for(const history of ['skip','import']) {
    await f.setup.installation(owner,registration([observation('codex',{forward:false,history})]));
    const checked=await f.setup.verify(owner,selection);assert.equal(checked.proof.state,'not_selected');assert.ok(checked.proof.id);assert.equal(checked.proof.marker,undefined);
    await f.setup.mcp(owner,{...selection,proofId:checked.proof.id});
    const client=(await f.setup.read(owner)).installations[0].clients[0];assert.equal(client.forward,false);assert.equal(client.history,history);assert.equal(client.mcp.state,'observed');
    assert.deepEqual(client.humanTasks,[]);assert.equal((await f.setup.read(owner)).firstWin,null);
  }
});

test('disabling and re-enabling forward capture resets its server boundary; expired proofs cannot be reused',async()=>{
  const f=await fixture();f.advance(61*60_000);
  await assert.rejects(f.setup.mcp(owner,{...selection,proofId:f.proof.id}),{status:409});
  const newProof=(await f.setup.verify(owner,selection)).proof;assert.notEqual(newProof.id,f.proof.id);
  await f.setup.installation(owner,registration([observation('codex',{forward:false})]));
  await f.setup.installation(owner,registration([observation()]));
  const current=await f.setup.verify(owner,selection);assert.notEqual(current.proof.id,newProof.id);
  await f.setup.session(owner,f.batch());assert.equal((await f.setup.verify(owner,selection)).proof.state,'waiting_capture');
});

test('concurrent local progress updates preserve independent server capture evidence',async()=>{
  const f=await fixture();
  await Promise.all([f.setup.session(owner,f.batch()),f.setup.installation(owner,registration([observation('codex',{history:'import',historyProgress:{state:'running',completed:7}})]))]);
  const client=(await f.setup.read(owner)).installations[0].clients[0];assert.equal(client.proof.state,'waiting_index');assert.equal(client.historyProgress.completed,7);
});

test('plugin choice is independent: unknown-origin native evidence still needs live mode, exact owner and fresh proof',async()=>{
  const f=await fixture();await f.setup.installation(owner,registration([observation('codex',{installed:false})]));
  await assert.rejects(f.setup.session({...owner,userId:'bob'},f.batch({origin:'unknown'})),{status:403});
  await f.setup.session(owner,f.batch({origin:'unknown',captureMode:'history'}));
  await f.setup.session(owner,f.batch({origin:'unknown',installationId:'another-installation'}));
  await f.setup.session(owner,f.batch({origin:'unknown',events:[{...f.batch().events[0],timestamp:'2026-11-14T11:00:00Z'}]}));
  assert.equal((await f.setup.verify(owner,selection)).proof.state,'waiting_capture');
  await f.setup.session(owner,f.batch({origin:'unknown'}));f.setHits([f.hit()]);
  const result=await f.setup.verify(owner,selection);assert.equal(result.installed,false);assert.equal(result.proof.state,'verified');assert.equal(result.mcp.state,'pending');
  await assert.rejects(f.setup.mcp({...owner,userId:'bob'},{...selection,proofId:result.proof.id}),{status:404});
  await f.setup.mcp(owner,{...selection,proofId:result.proof.id});
  assert.equal((await f.setup.read(owner)).installations[0].clients[0].mcp.state,'observed','the call still needs its native call/result correlation');
});

test('portable setup HTTP authenticates scope, rejects browser writes and does not echo credentials',async t=>{
  const f=await fixture();
  let calls=0,changeAt=Infinity;
  const handler=createSetupHandler({setup:f.setup,authenticate:async req=>{calls++;return calls>=changeAt?{...owner,tenantId:'foreign'}:req.headers.authorization==='Bearer test-secret'?owner:null;}});
  const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url='http://127.0.0.1:'+server.address().port,headers={authorization:'Bearer test-secret','content-type':'application/json'};
  assert.equal((await fetch(url+'/api/setup')).status,401);
  assert.equal((await fetch(url+'/api/setup?tenantId=other',{headers})).status,400);
  assert.equal((await fetch(url+'/api/setup/verify',{method:'POST',headers:{...headers,origin:url},body:JSON.stringify(selection)})).status,403);
  const read=await(await fetch(url+'/api/setup',{headers})).json();assert.equal(read.data.scope.userId,'alice');assert.equal(JSON.stringify(read).includes('test-secret'),false);
  const verified=await(await fetch(url+'/api/setup/verify',{method:'POST',headers,body:JSON.stringify(selection)})).json();assert.equal(verified.data.proof.state,'waiting_capture');
  changeAt=calls+2;
  assert.equal((await fetch(url+'/api/setup',{headers})).status,403,'a scope change during the read withholds private setup status');
});

test('self-contained native ingestion → SQLite search/fetch → authenticated MCP result capture proves one client',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opencrawl-setup-proof-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const endpoint=pathToFileURL(join(directory,'search.sqlite')).href.replace('file:','sqlite:'),store=memorySessionStore(),prefix='sessions/setup';
  const sessions=createSessionSearch({endpoint,store,prefix}),search=createWorkspaceSearch({sessions});
  const setup=createSetupStatus({store,prefix,search}),pipeline=createSessionPipeline({store,prefix,search:sessions,resolvePrincipal:async({batch})=>batch.owner});
  const ingest=createSessionIngest({store,prefix,onStored:setup.session,scheduleIndexing:async key=>{await pipeline.processObject({key});await sessions.refresh(owner);}});
  await setup.installation(owner,registration());const proof=(await setup.verify(owner,selection)).proof;
  const native={schemaVersion:1,installationId:selection.installationId,sessionId:'real-native-session',harness:'codex',origin:'cli',captureMode:'live',owner,events:[{id:'native-answer',kind:'message',timestamp:new Date().toISOString(),data:{role:'assistant',content:`The requested result is ready. ${proof.marker}`}}],attachments:[]};
  await ingest.putBatch(owner,native);
  assert.equal((await setup.verify(owner,selection)).proof.state,'verified');
  let mcp;const server=createServer((req,res)=>mcp(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  mcp=createOpenCrawlMcp({origin,setup,search,authenticate:async req=>req.headers.authorization==='Bearer local-test'?owner:null});
  const client=new Client({name:'codex',version:'test'});
  t.after(async()=>{await client.close();await mcp.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{authorization:'Bearer local-test'}}}));
  await client.callTool({name:'test_connection',arguments:{}});assert.equal((await setup.read(owner)).installations[0].clients[0].mcp.state,'pending');
  const result=await client.callTool({name:'verify_installation',arguments:{...selection,proofId:proof.id}});assert.ok(result.structuredContent.receipt);
  await ingest.putBatch(owner,{...native,events:[
    {id:'native-mcp-call',kind:'tool_call',timestamp:new Date().toISOString(),data:{name:'mcp__opencrawl__verify_installation',call_id:'native-call',arguments:JSON.stringify({...selection,proofId:proof.id})}},
    {id:'native-mcp-result',kind:'tool_result',timestamp:new Date().toISOString(),data:{call_id:'native-call',output:JSON.stringify(result.structuredContent)}},
  ]});
  const checked=await setup.verify(owner,selection);assert.equal(checked.proof.state,'verified');assert.equal(checked.mcp.state,'authenticated');
  assert.equal((await setup.read({...owner,tenantId:'foreign'})).firstWin,null);
});
