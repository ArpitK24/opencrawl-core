import {test,expect,setDefaultTimeout} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,appendFileSync,existsSync,readdirSync,rmSync,realpathSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {installCapture,uninstallCapture} from '../src/capture/install.ts';
import {recordDaemonHook,runCaptureDaemon,daemonDir} from '../src/capture/daemon.ts';
import {captureDir,readCaptureConfig,captureTranscript} from '../src/capture/runtime.ts';
import {purgeLocalCapture} from '../src/capture/controls.ts';
import {hash} from '../src/capture/parse.ts';
import {randomUUID} from 'node:crypto';
import {atomicJson} from '../src/session.ts';
import {statePath,scopeKey} from '../src/setup/state.ts';
import {processSessionStartTask,startupObservation} from '../src/session-start-task.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
setDefaultTimeout(15_000);
// Every case gets its own process and an empty fallback profile before imports
// or test cleanup run. A timeout cannot restore another case's environment.
function isolatedTest(name:string,run:()=>Promise<void>,timeout=15_000){
  test(name,async()=>{
    if(process.env.OPENCRAWL_DAEMON_CASE===name){await run();return;}
    const fallback=mkdtempSync(join(tmpdir(),'opencrawl-daemon-case-'));
    const child=Bun.spawn([process.execPath,'test',import.meta.path,'-t',name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')],{env:{...process.env,HOME:fallback,USERPROFILE:fallback,OPENCRAWL_AUTH:'',OPENCRAWL_TOKEN:'',OPENCRAWL_SESSIONS_TOKEN:'',OPENCRAWL_DAEMON_CASE:name,OPENCRAWL_CONFIG_HOME:join(fallback,'config'),CLAUDE_CONFIG_DIR:join(fallback,'claude'),CODEX_HOME:join(fallback,'codex'),CURSOR_CONFIG_DIR:join(fallback,'cursor'),ANTIGRAVITY_HOME:join(fallback,'agy')},stdout:'pipe',stderr:'pipe'});
    try{const [code,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(code!==0)throw Error(stdout+stderr);}
    finally{child.kill();await child.exited;rmSync(fallback,{recursive:true,force:true});}
  },timeout);
}
async function until(check:()=>boolean,ms=5000){const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw Error('Condition timed out');await sleep(10);}}
async function fixture(run:(f:any)=>Promise<void>){
  const dir=mkdtempSync(join(tmpdir(),'opencrawl-daemon-')),env={...process.env},batches:any[]=[],raws:string[]=[];
  let fail=false,loseAck=false,hold=false,requests=0;const held:Array<()=>void>=[];
  const server=createServer(async(req,res)=>{
    requests++;
    if(req.url==='/api/sessions/identity'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:{principal:{tenantId:'fixture',userId:'fixture'}}}));return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks).toString();
    if(req.url==='/api/sessions/batches'){
      raws.push(raw);
      if(hold)await new Promise<void>(done=>held.push(done));
      if(fail){res.writeHead(500,{'content-type':'application/json'});res.end('{}');return;}
      batches.push(JSON.parse(raw));
      if(loseAck){loseAck=false;res.writeHead(500,{'content-type':'application/json'});res.end('{}');return;}
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:{stored:true,batchId:hash(raw)}}));return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const api='http://127.0.0.1:'+(server.address() as any).port;
  let controller:AbortController|undefined,worker:Promise<void|undefined>|undefined;
  try{
    Object.assign(process.env,{OPENCRAWL_CONFIG_HOME:join(dir,'config'),OPENCRAWL_API_URL:api,OPENCRAWL_SESSIONS_TOKEN:'synthetic-daemon-token',CLAUDE_CONFIG_DIR:join(dir,'claude'),CODEX_HOME:join(dir,'codex'),OPENCRAWL_NO_UPDATE:'1'});
    delete process.env.CLAUDE_CODE_REMOTE;
    await installCapture(api,{home:dir,command:[],harnesses:['claude-code'],daemon:true,daemonService:false});
    const path=join(dir,'claude','projects','fixture','session.jsonl');mkdirSync(dirname(path),{recursive:true});
    const record=(id:string,child?:string)=>JSON.stringify({type:'user',uuid:id,sessionId:'session',...(child?{agentId:child}:{}),message:{role:'user',content:'synthetic '+id}})+'\n';
    writeFileSync(path,record('one'));
    const start=async(options={})=>{controller=new AbortController();let ready=false;worker=runCaptureDaemon({signal:controller.signal,flushMs:20,reconcileMs:100,settleMs:40,retryMs:60,onReady:()=>{ready=true;},...options});await until(()=>ready);};
    const stop=async()=>{controller?.abort();await worker;};
    const event=(name='SessionStart',pid=process.pid)=>recordDaemonHook({session_id:'session',transcript_path:path,hook_event_name:name,cwd:dir},pid);
    await run({dir,api,path,record,batches,raws,start,stop,event,get requests(){return requests;},set fail(v:boolean){fail=v;},set loseAck(v:boolean){loseAck=v;},set hold(v:boolean){hold=v;if(!v)for(const done of held.splice(0))done();}});
  }finally{
    hold=false;for(const done of held.splice(0))done();controller?.abort();await worker;
    // Service fixtures write only here; remove fake plists before ordinary teardown
    // so even a failed assertion cannot invoke the real launchctl boundary.
    const fakeAgents=join(dir,'Library','LaunchAgents');if(existsSync(fakeAgents))rmSync(fakeAgents,{recursive:true,force:true});
    if(process.env.OPENCRAWL_CONFIG_HOME===join(dir,'config'))await uninstallCapture(dir);
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);rmSync(dir,{recursive:true,force:true});
  }
}
import {dirname} from 'node:path';

isolatedTest('Claude installs two async capture hooks and preserves unrelated hooks',async()=>fixture(async f=>{
  const hooks=JSON.parse(readFileSync(join(f.dir,'claude','settings.json'),'utf8')).hooks;
  expect(Object.keys(hooks).sort()).toEqual(['SessionEnd','SessionStart']);
  for(const group of Object.values(hooks) as any[])expect(group[0].hooks[0]).toMatchObject({async:true,timeout:10});
  hooks.SessionStart.push({hooks:[{type:'command',command:'echo unrelated',timeout:10}]});
  writeFileSync(join(f.dir,'claude','settings.json'),JSON.stringify({hooks}));
  await installCapture(f.api,{home:f.dir,command:[],harnesses:['claude-code'],daemon:true,daemonService:false});
  expect(JSON.parse(readFileSync(join(f.dir,'claude','settings.json'),'utf8')).hooks.SessionStart.some((group:any)=>group.hooks.some((hook:any)=>hook.command==='echo unrelated'))).toBe(true);
}));

isolatedTest('actual CLI hook records locally and exits without waiting for upload',async()=>fixture(async f=>{
  f.hold=true;f.event();await f.start();await until(()=>f.raws.length>0);
  appendFileSync(f.path,f.record('while-request-blocked'));
  const start=performance.now();
  const child=Bun.spawn([process.execPath,resolve(import.meta.dir,'../src/cli.ts'),'collect','hook','--harness','claude-code'],{env:process.env,stdin:new Blob([JSON.stringify({session_id:'session',transcript_path:f.path,hook_event_name:'SessionStart'})]),stdout:'pipe',stderr:'pipe'});
  const [exit,stderr]=await Promise.all([child.exited,new Response(child.stderr).text()]);
  expect(stderr).toBe('');expect(exit).toBe(0);expect(performance.now()-start).toBeLessThan(1000);
  const state=join(captureDir(),'state',hash('claude-code'+realpathSync(f.path))+'.json');
  await until(()=>JSON.parse(readFileSync(state,'utf8')).offset===Buffer.byteLength(readFileSync(f.path)));
  expect(f.batches).toHaveLength(0);f.hold=false;
}));

isolatedTest('an unfinished final record remains registered until its newline arrives',async()=>fixture(async f=>{
  f.event();await f.start();await until(()=>f.batches.length>0);
  const line=f.record('late-complete');appendFileSync(f.path,line.slice(0,-1));f.event('SessionEnd');
  await sleep(250);expect(readdirSync(join(daemonDir(),'sessions'))).toHaveLength(1);
  appendFileSync(f.path,'\n');await until(()=>f.batches.some((batch:any)=>batch.events.some((event:any)=>event.nativeId==='late-complete')));
  await until(()=>readdirSync(join(daemonDir(),'sessions')).length===0);
}));

isolatedTest('a destination change stops the daemon and preserves the original queued author',async()=>fixture(async f=>{
  f.fail=true;f.event();await f.start();await until(()=>f.raws.length>0);
  const config=readCaptureConfig()!,file=join(captureDir(),'config.json');
  writeFileSync(file,JSON.stringify({...config,owner:{...config.owner,tenantId:'different'}}));
  await until(()=>JSON.parse(readFileSync(join(daemonDir(),'status.json'),'utf8')).state==='stopped');
  expect(readdirSync(join(captureDir(),'queue')).length).toBeGreaterThan(0);
  for(const name of readdirSync(join(captureDir(),'queue')))expect(JSON.parse(readFileSync(join(captureDir(),'queue',name),'utf8')).owner.tenantId).toBe('fixture');
}));

isolatedTest('worker captures only registered session and its subagents, including files created later',async()=>fixture(async f=>{
  // The old 2,345-entry registry and unrelated native history must never be visited.
  mkdirSync(join(captureDir(),'sources'),{recursive:true});
  for(let n=0;n<2345;n++)writeFileSync(join(captureDir(),'sources',n+'.json'),'not even valid JSON');
  writeFileSync(join(dirname(f.path),'unregistered.jsonl'),'not valid JSON either');
  f.event();await f.start();await until(()=>f.batches.some((b:any)=>b.events.some((e:any)=>e.nativeId==='one')));
  const child=join(f.path.slice(0,-6),'subagents','agent-child.jsonl');mkdirSync(dirname(child),{recursive:true});writeFileSync(child,f.record('child-one','child'));
  appendFileSync(f.path,f.record('two'));
  await until(()=>f.batches.some((b:any)=>b.sessionId==='session:child'));
  f.event('SessionEnd');appendFileSync(f.path,f.record('last'));
  await until(()=>readdirSync(join(daemonDir(),'sessions')).length===0);
  await until(()=>readdirSync(join(captureDir(),'queue')).length===0);
  expect(new Set(f.batches.flatMap((b:any)=>b.events).map((e:any)=>e.nativeId))).toEqual(new Set(['one','two','last','child-one']));
  const requests=f.requests;await sleep(200);expect(f.requests).toBe(requests);
}));

isolatedTest('offline upload does not stop recording; restart preserves retry bytes and original destination',async()=>fixture(async f=>{
  f.fail=true;f.event();await f.start();await until(()=>f.raws.length>0);
  const first=f.raws[0];appendFileSync(f.path,f.record('while-offline'));
  const state=join(captureDir(),'state',hash('claude-code'+realpathSync(f.path))+'.json');
  await until(()=>existsSync(state)&&JSON.parse(readFileSync(state,'utf8')).offset===Buffer.byteLength(readFileSync(f.path)));
  await f.stop();expect(readdirSync(join(captureDir(),'queue')).length).toBeGreaterThan(0);
  f.fail=false;await f.start();await until(()=>readdirSync(join(captureDir(),'queue')).length===0);
  expect(f.raws.filter((raw:string)=>raw===first).length).toBeGreaterThanOrEqual(2);
  expect(new Set(f.batches.flatMap((b:any)=>b.events).map((e:any)=>e.nativeId))).toEqual(new Set(['one','while-offline']));
}));

isolatedTest('a saved registration cannot cross destinations before the first upload',async()=>fixture(async f=>{
  f.event();
  const file=join(captureDir(),'config.json'),original=readCaptureConfig()!;
  writeFileSync(file,JSON.stringify({...original,owner:{tenantId:'different',userId:'different'}}));
  await expect(installCapture(f.api,{home:f.dir,command:[],harnesses:['claude-code'],daemon:true,daemonService:false})).rejects.toMatchObject({code:'CAPTURE_PENDING_DESTINATION'});
  await f.start();await sleep(200);await f.stop();
  expect(f.raws).toHaveLength(0);expect(readdirSync(join(daemonDir(),'inbox')).some(name=>name.endsWith('.held'))).toBe(true);
  await uninstallCapture(f.dir);await purgeLocalCapture(true);expect(existsSync(daemonDir())).toBe(false);
}));

isolatedTest('removing forward consent stops an enrolled session without importing later bytes',async()=>fixture(async f=>{
  f.event();await f.start();await until(()=>f.batches.length>0);
  const config=readCaptureConfig()!;expect(config.captureWorker).toBe('daemon-v1');
  writeFileSync(join(captureDir(),'config.json'),JSON.stringify({...config,harnesses:[]}));
  await until(()=>readdirSync(join(daemonDir(),'sessions')).length===0);
  appendFileSync(f.path,f.record('after-consent-removed'));await sleep(200);
  expect(f.batches.flatMap((batch:any)=>batch.events).some((event:any)=>event.nativeId==='after-consent-removed')).toBe(false);
}));

isolatedTest('a damaged registration cannot stop a healthy session',async()=>fixture(async f=>{
  f.event();writeFileSync(join(daemonDir(),'inbox','damaged.json'),'{');
  await f.start();await until(()=>f.batches.length>0);
  expect(existsSync(join(daemonDir(),'inbox','damaged.json.held'))).toBe(true);
}));

isolatedTest('a symlinked subagent directory is never traversed',async()=>fixture(async f=>{
  const outside=join(f.dir,'unrelated');mkdirSync(join(outside,'subagents'),{recursive:true});
  writeFileSync(join(outside,'subagents','agent-foreign.jsonl'),f.record('must-not-read','foreign'));
  symlinkSync(outside,f.path.slice(0,-6),process.platform==='win32'?'junction':'dir');
  f.event('SessionStart',2_147_483_647);await f.start();await until(()=>f.batches.length>0);
  await until(()=>readdirSync(join(daemonDir(),'sessions')).length===0);
  expect(f.batches.flatMap((batch:any)=>batch.events).map((event:any)=>event.nativeId)).toEqual(['one']);
}));

isolatedTest('lost acknowledgement retries identical payload and process-exit recovery needs no SessionEnd',async()=>fixture(async f=>{
  f.loseAck=true;f.event('SessionStart',2_147_483_647);await f.start();
  await until(()=>f.raws.length>=2);
  expect(f.raws[1]).toBe(f.raws[0]);
  await until(()=>readdirSync(join(daemonDir(),'sessions')).length===0);
  await until(()=>readdirSync(join(captureDir(),'queue')).length===0);
}));

isolatedTest('idle daemon makes no network calls or repeated historical scans',async()=>fixture(async f=>{
  const before=f.requests;await f.start();await sleep(350);expect(f.requests).toBe(before);
  await f.stop();const status=JSON.parse(readFileSync(join(daemonDir(),'status.json'),'utf8'));
  expect(status).toMatchObject({captures:0,sessionChecks:0,uploads:0});
}));

isolatedTest('kernel singleton and SIGKILL preserve registration and upload recovery',async()=>fixture(async f=>{
  f.event();f.fail=true;
  const module=resolve(import.meta.dir,'../src/capture/daemon.ts');
  const child=Bun.spawn([process.execPath,'-e',`import {runCaptureDaemon} from ${JSON.stringify(module)};await runCaptureDaemon({flushMs:10,reconcileMs:100,retryMs:100});`],{env:process.env,stdout:'ignore',stderr:'pipe'});
  try{
    await until(()=>f.raws.length>0);let duplicateReady=false;
    await runCaptureDaemon({onReady:()=>{duplicateReady=true;}});expect(duplicateReady).toBe(false);
    child.kill('SIGKILL');await child.exited;
    appendFileSync(f.path,f.record('after-crash'));f.fail=false;
    await f.start();await until(()=>f.batches.some((b:any)=>b.events.some((e:any)=>e.nativeId==='after-crash')));
    await until(()=>readdirSync(join(captureDir(),'queue')).length===0);
    expect(f.batches.flatMap((b:any)=>b.events).some((e:any)=>e.nativeId==='one')).toBe(true);
  }finally{child.kill();await child.exited;}
}),10_000);


isolatedTest('same-owner wrong-install and unbound notices are held without reading a transcript',async()=>fixture(async f=>{
  for(const installationId of ['other-installation',undefined]){
    f.event();const name=readdirSync(join(daemonDir(),'inbox')).find(name=>name.endsWith('.json'))!;
    const path=join(daemonDir(),'inbox',name),notice=JSON.parse(readFileSync(path,'utf8'));
    if(installationId)notice.installationId=installationId;else delete notice.installationId;
    writeFileSync(path,JSON.stringify(notice));
    await f.start();await sleep(80);await f.stop();
    expect(existsSync(path+'.held')).toBe(true);expect(f.raws).toHaveLength(0);
  }
}));

isolatedTest('paused unbound and unselected profiles produce no new daemon notice',async()=>fixture(async f=>{
  const original=readCaptureConfig()!,path=join(captureDir(),'config.json');
  for(const patch of [{disabled:true},{authPending:true},{harnesses:['codex']}]){
    writeFileSync(path,JSON.stringify({...original,...patch}));expect(f.event()).toBe(false);
    expect(!existsSync(daemonDir())||!existsSync(join(daemonDir(),'inbox'))||readdirSync(join(daemonDir(),'inbox')).length===0).toBe(true);
  }
  writeFileSync(path,JSON.stringify(original));
}));

isolatedTest('generation replacement stops before the first transcript pass',async()=>fixture(async f=>{
  f.event();
  const controller=new AbortController();
  await runCaptureDaemon({signal:controller.signal,onReady:()=>writeFileSync(join(daemonDir(),'generation.json'),JSON.stringify({generation:'replacement'}))});
  expect(JSON.parse(readFileSync(join(daemonDir(),'status.json'),'utf8')).state).toBe('stopped');
}));

isolatedTest('supervisor result is factual and bootstrap failure propagates with enrollment retained',async()=>fixture(async f=>{
  const {installCaptureDaemon,launchAgent}=await import('../src/capture/daemon-service.ts');
  const config=readCaptureConfig()!,before=readFileSync(join(captureDir(),'config.json'),'utf8'),calls:string[][]=[];
  await expect(installCaptureDaemon({...config,installationId:'stale-installation'},{home:f.dir,platform:'darwin',run:(()=>{throw Error('must not run');}) as any})).rejects.toThrow('configuration changed');
  const run=((command:string,args:string[])=>{expect(command).toBe('launchctl');calls.push(args);return {status:args[0]==='bootstrap'?17:0};}) as any;
  await expect(installCaptureDaemon(config,{home:f.dir,platform:'darwin',run})).rejects.toThrow('Could not install');
  expect(readFileSync(join(captureDir(),'config.json'),'utf8')).toBe(before);
  expect(JSON.parse(readFileSync(join(daemonDir(),'service.json'),'utf8'))).toMatchObject({status:'failed',supervised:false});
  expect(calls.map(args=>args[0])).toEqual(['bootout','bootstrap']);
  // The fake's file is intentionally retained as the same failed installation would be.
  const service=await installCaptureDaemon(config,{home:f.dir,platform:'linux',ensure:async()=>{}});
  expect(service).toMatchObject({kind:'process',supervised:false});
  const plist=launchAgent({...config,command:['/selected CLI/opencrawl']});
  expect(plist).toContain('/selected CLI/opencrawl');expect(plist).toContain('collect');expect(plist).toContain('daemon');
  expect(plist).not.toContain('synthetic-daemon-token');
  // Avoid any real LaunchAgent removal in fixture cleanup after our fake installation.
  const {unlinkSync}=await import('node:fs');
  const agentDir=join(f.dir,'Library','LaunchAgents');for(const name of readdirSync(agentDir))unlinkSync(join(agentDir,name));
}));

isolatedTest('first forward opt-in excludes the existing transcript prefix while the daemon captures later appends',async()=>fixture(async f=>{
  const installed=readCaptureConfig()!,expectedOwner=installed.owner;
  await installCapture(f.api,{home:f.dir,command:[],harnesses:[],historyHarnesses:[],selectionMode:'replace',hookOwnership:'plugin',daemon:true,daemonService:false,expectedOwner,expectedConfig:installed});
  const before=readCaptureConfig()!,prefixBytes=Buffer.byteLength(readFileSync(f.path));
  await installCapture(f.api,{home:f.dir,command:[],harnesses:['claude-code'],historyHarnesses:[],selectionMode:'replace',hookOwnership:'plugin',daemon:true,daemonService:false,expectedOwner,expectedConfig:before});
  const state=join(captureDir(),'state',hash('claude-code'+realpathSync(f.path))+'.json');
  expect(JSON.parse(readFileSync(state,'utf8'))).toMatchObject({forwardBoundary:true,offset:prefixBytes});
  expect(readCaptureConfig()).toMatchObject({installationId:installed.installationId,owner:expectedOwner,historyHarnesses:[]});
  f.event();await f.start();await sleep(100);expect(f.batches).toHaveLength(0);
  appendFileSync(f.path,f.record('after-first-opt-in'));
  await until(()=>f.batches.some((batch:any)=>batch.events.some((event:any)=>event.nativeId==='after-first-opt-in')));
  expect(f.batches.flatMap((batch:any)=>batch.events).map((event:any)=>event.nativeId)).toEqual(['after-first-opt-in']);
}));

isolatedTest('daemon enrollment preserves guards, legacy alias, paused state and retained queue bytes',async()=>fixture(async f=>{
  const configFile=join(captureDir(),'config.json'),original=readCaptureConfig()!;
  const {captureWorker:_,...withoutWorker}=original;
  const legacy={...withoutWorker,claudeCapture:'daemon-v1' as const,disabled:true};writeFileSync(configFile,JSON.stringify(legacy));
  const queue=join(captureDir(),'queue','retained.json');writeFileSync(queue,'retained test bytes');
  await expect(installCapture(f.api,{home:f.dir,command:[],harnesses:[],selectionMode:'replace',daemon:true,daemonService:false,expectedOwner:{tenantId:'wrong',userId:'fixture'}})).rejects.toMatchObject({code:'SETUP_SCOPE_CHANGED'});
  await expect(installCapture(f.api,{home:f.dir,command:[],harnesses:[],selectionMode:'replace',daemon:true,daemonService:false,expectedConfig:original})).rejects.toMatchObject({code:'CAPTURE_CONFIG_CHANGED'});
  expect(JSON.parse(readFileSync(configFile,'utf8'))).toEqual(legacy);
  await installCapture(f.api,{home:f.dir,command:[],harnesses:[],historyHarnesses:[],selectionMode:'replace',hookOwnership:'plugin',daemonService:false,expectedConfig:legacy,expectedOwner:original.owner});
  expect(readCaptureConfig()).toMatchObject({installationId:original.installationId,owner:original.owner,disabled:true,harnesses:[],historyHarnesses:[],captureWorker:'daemon-v1'});
  expect(readFileSync(queue,'utf8')).toBe('retained test bytes');
}));


function startupTask(config:NonNullable<ReturnType<typeof readCaptureConfig>>,patch:Record<string,unknown>={}){
  const task={kind:'session-start',id:randomUUID(),at:Date.now(),api:config.api,installationId:config.installationId,owner:{tenantId:config.owner.tenantId,userId:config.owner.userId},harness:'claude-code',sessionId:'session',payload:{hook_event_name:'SessionStart',source:'startup'},...patch};
  const path=join(daemonDir(),'inbox','startup-'+task.id+'.json');atomicJson(path,task);return {path,task,bytes:readFileSync(path,'utf8')};
}

isolatedTest('disabled capture runs real bound startup registration without reading or uploading capture data',async()=>fixture(async f=>{
  const config={...readCaptureConfig()!,disabled:true,harnesses:[],backgroundStartup:true};
  atomicJson(join(captureDir(),'config.json'),config);
  const scope={api:f.api,...config.owner},setup={schemaVersion:1,scope,installationId:config.installationId,selections:{plugins:{'claude-code':true},forward:{'claude-code':false},history:{'claude-code':false}}};
  const setupFile=statePath(scopeKey(scope));atomicJson(setupFile,setup);
  const queue=join(captureDir(),'queue','retained.json');writeFileSync(queue,'previously queued bytes');
  const sourceBefore=readFileSync(f.path,'utf8'),configBefore=readFileSync(join(captureDir(),'config.json'),'utf8'),setupBefore=readFileSync(setupFile,'utf8');
  const queued=startupTask(config),requestsBefore=f.requests,paths:string[]=[];
  process.env.OPENCRAWL_TOKEN='synthetic-startup-token';
  const receiver=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname;paths.push(path);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-startup-token');
    if(path==='/api/cli/me')return Response.json({schemaVersion:1,data:{user:{id:config.owner.userId},workspace:{id:config.owner.tenantId}}});
    expect(path).toBe('/api/board/bootstrap');const body=JSON.parse(String(init?.body));
    return Response.json({schemaVersion:1,data:{workspace:config.owner.tenantId,session:body.session,agent:'a'.repeat(64),name:null,task:null}});
  }) as typeof fetch;
  await f.start({processStartupTask:(current:any,task:unknown)=>processSessionStartTask(current,task,receiver)});
  await until(()=>!existsSync(queued.path));await f.stop();
  expect(paths).toEqual(['/api/cli/me','/api/board/bootstrap']);expect(startupObservation(f.api,'claude-code','session')?.registration.workspace).toBe('fixture');
  expect(f.requests).toBe(requestsBefore);expect(f.raws).toHaveLength(0);expect(readFileSync(queue,'utf8')).toBe('previously queued bytes');
  expect(readFileSync(f.path,'utf8')).toBe(sourceBefore);expect(readdirSync(join(captureDir(),'state'))).toEqual([]);
  expect(readFileSync(join(captureDir(),'config.json'),'utf8')).toBe(configBefore);expect(readFileSync(setupFile,'utf8')).toBe(setupBefore);
  expect(JSON.parse(readFileSync(join(daemonDir(),'status.json'),'utf8'))).toMatchObject({captures:0,sessionChecks:0,uploads:0,startups:1});
}));

isolatedTest('slow startup work never blocks capture or upload and foreign task bindings are retained',async()=>fixture(async f=>{
  const config={...readCaptureConfig()!,backgroundStartup:true};atomicJson(join(captureDir(),'config.json'),config);
  const wrong=startupTask(config,{owner:{tenantId:'other',userId:'fixture'}}),task=startupTask(config);
  const mismatch=startupTask(config);const renamed=join(dirname(mismatch.path),'startup-'+randomUUID()+'.json');
  const {renameSync}=await import('node:fs');renameSync(mismatch.path,renamed);
  let started=false,release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
  try{
    f.event();await f.start({processStartupTask:async()=>{started=true;await blocked;}});
    await until(()=>started&&f.batches.length>0);expect(existsSync(task.path)).toBe(true);
    appendFileSync(f.path,f.record('during-startup'));await until(()=>f.batches.some((batch:any)=>batch.events.some((event:any)=>event.nativeId==='during-startup')));
  }finally{release();}
  await until(()=>!existsSync(task.path)&&existsSync(wrong.path+'.held')&&existsSync(renamed+'.held'));await f.stop();
  expect(readFileSync(wrong.path+'.held','utf8')).toBe(wrong.bytes);expect(readFileSync(renamed+'.held','utf8')).toBe(mismatch.bytes);
}));

isolatedTest('startup failure and restart retain exact input until the bound callback succeeds',async()=>fixture(async f=>{
  const config={...readCaptureConfig()!,disabled:true,harnesses:[],backgroundStartup:true};atomicJson(join(captureDir(),'config.json'),config);
  const task=startupTask(config);let calls=0;
  await f.start({retryMs:1000,processStartupTask:async()=>{calls++;throw Error('synthetic unavailable');}});
  await until(()=>existsSync(join(daemonDir(),'startup-retry.json')));await f.stop();
  expect(calls).toBe(1);expect(readFileSync(task.path,'utf8')).toBe(task.bytes);
  await f.start({processStartupTask:async()=>{calls++;}});await until(()=>!existsSync(task.path));await f.stop();
  expect(calls).toBe(2);expect(f.raws).toHaveLength(0);
}));

isolatedTest('forward opt-out drains approved queue then exits without reading later transcript bytes',async()=>fixture(async f=>{
  f.fail=true;f.event();await f.start();await until(()=>f.raws.length>0);await f.stop();
  const config={...readCaptureConfig()!,harnesses:[],backgroundStartup:false};atomicJson(join(captureDir(),'config.json'),config);
  appendFileSync(f.path,f.record('after-opt-out'));f.fail=false;await f.start();
  await until(()=>JSON.parse(readFileSync(join(daemonDir(),'status.json'),'utf8')).state==='stopped');await f.stop();
  expect(readdirSync(join(captureDir(),'queue'))).toEqual([]);
  expect(f.batches.flatMap((batch:any)=>batch.events).map((event:any)=>event.nativeId)).toEqual(['one']);
}));

isolatedTest('removing enrollment during awaited capture cannot enqueue later bytes',async()=>fixture(async f=>{
  const config=readCaptureConfig()!,configFile=join(captureDir(),'config.json');
  writeFileSync(f.path,Array.from({length:201},(_,i)=>f.record('event-'+i)).join(''));
  let spooled=0;
  await expect(captureTranscript(config,'claude-code',f.path,{},false,async()=>{spooled++;rmSync(configFile);await Promise.resolve();})).rejects.toMatchObject({code:'CAPTURE_CONFIG_CHANGED'});
  expect(spooled).toBe(1);const batches=readdirSync(join(captureDir(),'queue')).map(name=>JSON.parse(readFileSync(join(captureDir(),'queue',name),'utf8')));
  expect(batches.flatMap(batch=>batch.events)).toHaveLength(200);expect(batches.flatMap(batch=>batch.events).some(event=>event.nativeId==='event-200')).toBe(false);
  atomicJson(configFile,config);
}));

isolatedTest('not-required supervisor preserves a paused queue and stops only its owned service',async()=>fixture(async f=>{
  const {installCaptureDaemon}=await import('../src/capture/daemon-service.ts');
  const config={...readCaptureConfig()!,disabled:true,harnesses:[],backgroundStartup:false};atomicJson(join(captureDir(),'config.json'),config);
  const queue=join(captureDir(),'queue','retained.json');writeFileSync(queue,'retained');
  const result=await installCaptureDaemon(config,{home:f.dir,platform:'linux',ensure:async()=>{throw Error('must not launch');}});
  expect(result).toMatchObject({kind:'not-required',supervised:false,queuedDataPreserved:true});expect(readFileSync(queue,'utf8')).toBe('retained');
}));


isolatedTest('revoked startup tasks are held so a later selected client can register',async()=>fixture(async f=>{
  const config={...readCaptureConfig()!,disabled:true,harnesses:[],backgroundStartup:true};atomicJson(join(captureDir(),'config.json'),config);
  const scope={api:f.api,...config.owner};atomicJson(statePath(scopeKey(scope)),{schemaVersion:1,scope,installationId:config.installationId,selections:{plugins:{'claude-code':true,codex:false},forward:{},history:{}}});
  // Sorted UUIDs force an entire first page of revoked tasks before the valid task.
  const revoked=Array.from({length:16},(_,i)=>startupTask(config,{id:'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),harness:'codex',payload:{hook_event_name:'SessionStart',source:'startup'}}));
  const valid=startupTask(config,{id:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),paths:string[]=[];
  process.env.OPENCRAWL_TOKEN='synthetic-startup-token';
  const receiver=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname;paths.push(path);
    if(path==='/api/cli/me')return Response.json({schemaVersion:1,data:{user:{id:'fixture'},workspace:{id:'fixture'}}});
    expect(path).toBe('/api/board/bootstrap');const body=JSON.parse(String(init?.body));
    return Response.json({schemaVersion:1,data:{workspace:'fixture',session:body.session,agent:'a'.repeat(64),name:null,task:null}});
  }) as typeof fetch;
  await f.start({processStartupTask:(current:any,task:unknown)=>processSessionStartTask(current,task,receiver)});
  await until(()=>!existsSync(valid.path));await f.stop();
  for(const task of revoked)expect(readFileSync(task.path+'.held','utf8')).toBe(task.bytes);
  expect(paths).toEqual(['/api/cli/me','/api/board/bootstrap']);expect(f.raws).toHaveLength(0);
}));
