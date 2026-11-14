import {test,expect} from 'bun:test';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';
import type {SetupState} from '../src/setup/state.ts';
test('setup returns before a durable background history import finishes, without enabling future capture',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'opencrawl-setup-background-')),batches:unknown[]=[];let installations:unknown[]=[],releaseUpload!:()=>void;
 const uploadGate=new Promise<void>(resolve=>{releaseUpload=resolve;});
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),body=bytes.length?JSON.parse(bytes.toString()):{};let data:unknown;
  if(req.url==='/api/setup')data={schemaVersion:1,scope:{tenantId:'fixture-team',userId:'fixture-user'},firstWin:null,installations};
  else if(req.url==='/api/setup/installation'){installations=[{...body,clients:body.clients.map((client:Record<string,unknown>)=>({...client,humanTasks:[]}))}];data=installations[0];}
  else if(req.url==='/api/sessions/identity')data={principal:{tenantId:'fixture-team',userId:'fixture-user'},capabilities:{harnesses:['codex']}};
  else if(req.url==='/api/sessions/batches'){batches.push(body);await uploadGate;data={stored:true,batchId:createHash('sha256').update(bytes).digest('hex')};}
  else {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({schemaVersion:1,data}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const api='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const config=join(dir,'config'),state=():SetupState|undefined=>{const root=join(config,'opencrawl','setup');if(!existsSync(root))return;const name=readdirSync(root).find(name=>name.endsWith('.json'));return name?JSON.parse(readFileSync(join(root,name),'utf8')):undefined;};
 try{
  const codex=join(dir,'codex'),file=join(codex,'sessions','history.jsonl');mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'fixture-history',source:'cli'}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:'CONSENTED HISTORY'}})+'\n');
  const child=Bun.spawn([process.execPath,resolve(import.meta.dir,'../src/cli.ts'),'setup','apply','--plugins','none','--forward','none','--history','codex','--yes','--json','--api',api],{env:{...process.env,HOME:dir,USERPROFILE:dir,OPENCRAWL_CONFIG_HOME:config,OPENCRAWL_API_URL:api,OPENCRAWL_NO_UPDATE:'1',OPENCRAWL_TOKEN:'fixture-read-token-01234567890',OPENCRAWL_SESSIONS_TOKEN:'fixture-write-token-01234567890',CLAUDE_CONFIG_DIR:join(dir,'claude'),CLAUDE_DESKTOP_CONFIG_DIR:join(dir,'desktop'),CODEX_HOME:codex,CURSOR_CONFIG_DIR:join(dir,'cursor'),ANTIGRAVITY_HOME:join(dir,'agy')},stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  expect(stderr).toBe('');expect(exitCode).toBe(0);expect(JSON.parse(stdout).data.history.state).toBe('queued');expect(state()?.historyJob?.state).not.toBe('complete');
  const capture=JSON.parse(readFileSync(join(config,'opencrawl','capture','config.json'),'utf8'));expect(capture.harnesses).toEqual([]);
  appendFileSync(file,JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:'UNAPPROVED LATER MESSAGE'}})+'\n');
  releaseUpload();
  const deadline=Date.now()+10000;while(state()?.historyJob?.state!=='complete'&&Date.now()<deadline)await pause(20);
  expect(state()?.historyJob?.state).toBe('complete');expect(JSON.stringify(batches)).toContain('CONSENTED HISTORY');expect(JSON.stringify(batches)).not.toContain('UNAPPROVED LATER MESSAGE');
 }finally{
  releaseUpload();const deadline=Date.now()+2000;while(state()?.historyJob?.state==='running'&&Date.now()<deadline)await pause(20);const pending=state()?.historyJob;if(pending?.state==='running'&&pending.pid)try{process.kill(pending.pid,'SIGTERM');}catch{}
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});
 }
},15000);
