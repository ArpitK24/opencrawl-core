import {test,expect} from 'bun:test';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishSetup,type SetupServerStatus} from '../src/setup/api.ts';
import {type CodexHookReview} from '../src/capture/codex-hooks.ts';
import {setupCommand as realSetupCommand,formatSetupOutput,formatSetupCommand} from '../src/setup/command.ts';
import {readSetupState,historyBenefit,type SetupState} from '../src/setup/state.ts';
import {readCaptureConfig,captureDir} from '../src/capture/runtime.ts';
import {installCapture,uninstallCapture} from '../src/capture/install.ts';
import {hookRunner} from '../src/hook-runner.ts';
import {applySelectionKey,type SelectionCursor} from '../src/setup/select.ts';
import type {SelectionScreen} from '../src/setup/select.ts';
const setupCommand=(action:string,api:string,values:Parameters<typeof realSetupCommand>[2],dependencies:NonNullable<Parameters<typeof realSetupCommand>[3]>={})=>realSetupCommand(action,api,values,{installDaemon:async()=>({kind:'process',status:'requested',supervised:false,command:[]}),...dependencies});
type ClientStatus=SetupServerStatus['installations'][number]['clients'][number];
async function fixture(run:(api:string,dir:string,observations:unknown[],setCodex:(patch:Partial<ClientStatus>)=>void)=>Promise<void>,pluginStateSupported=false){
 const dir=mkdtempSync(join(tmpdir(),'opencrawl-setup-flow-')),saved={...process.env},observations:unknown[]=[];let installations:SetupServerStatus['installations']=[],codexPatch:Partial<ClientStatus>={};
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  let data:unknown;
  if(req.url==='/api/setup')data={schemaVersion:1,scope:{tenantId:'tenant',userId:'user'},...(pluginStateSupported?{pluginStateSupported:true}:{}),firstWin:null,installations:installations.map(row=>({...row,clients:row.clients.map(client=>client.client==='codex'?{...client,...codexPatch}:client)}))};
  else if(req.url==='/api/setup/installation'){observations.push(body);installations=[{...body,clients:body.clients.map((client:Record<string,unknown>)=>({...client,humanTasks:[]}))}];data=installations[0];}
  else if(req.url==='/api/sessions/identity')data={principal:{tenantId:'tenant',userId:'user'},capabilities:{harnesses:['claude-code','codex','cursor','antigravity']}};
  else {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({schemaVersion:1,data}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const api='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
  Object.assign(process.env,{HOME:dir,USERPROFILE:dir,PATH:dir,OPENCRAWL_CONFIG_HOME:join(dir,'config'),OPENCRAWL_API_URL:api,OPENCRAWL_TOKEN:'fixture-access-token-0123456789',OPENCRAWL_SESSIONS_TOKEN:'fixture-upload-token-0123456789',CLAUDE_DESKTOP_CONFIG_DIR:join(dir,'desktop'),CLAUDE_CONFIG_DIR:join(dir,'claude'),CODEX_HOME:join(dir,'codex'),CURSOR_CONFIG_DIR:join(dir,'cursor'),ANTIGRAVITY_HOME:join(dir,'agy')});
  const file=join(dir,'codex','sessions','one.jsonl');mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'one',source:'cli'}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:'approved historical content'}})+'\n');
  await run(api,dir,observations,patch=>{codexPatch=patch;});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);rmSync(dir,{recursive:true,force:true});}
}
test('keyboard selection keeps recording dependent on plugins and permits search-only plugins',()=>{
 let state:SelectionCursor={index:0,column:0,items:[{id:'codex',label:'Codex',selected:true,secondary:false},{id:'cursor',label:'Cursor',selected:true,secondary:true}]};
 state=applySelectionKey(state,'n');expect(state.items.map(item=>item.selected)).toEqual([false,false]);expect(state.items.map(item=>item.secondary)).toEqual([false,false]);
 state=applySelectionKey(state,'right');state=applySelectionKey(state,'space');expect(state.items[0]).toMatchObject({selected:true,secondary:true});
 state=applySelectionKey(state,'down');state=applySelectionKey(state,'space');expect(state.items[1]).toMatchObject({selected:true,secondary:true});
 state=applySelectionKey(state,'space');expect(state.items[1]).toMatchObject({selected:true,secondary:false});
 state=applySelectionKey(state,'left');state=applySelectionKey(state,'n');expect(state.items.every(item=>!item.selected&&!item.secondary)).toBe(true);
 state=applySelectionKey(state,'a');expect(state.items.every(item=>item.selected&&!item.secondary)).toBe(true);
});
test('structured plan has no enrollment effects; apply requires explicit consent and unchanged history snapshot',async()=>fixture(async(api,dir,observations)=>{
 const plan=await setupCommand('run',api,{json:true});expect(plan).toMatchObject({status:'confirmation_required',historyBenefit});expect(observations).toHaveLength(0);expect(readCaptureConfig()).toBeNull();expect(existsSync(join(dir,'config','setup'))).toBe(false);
 await expect(setupCommand('apply',api,{yes:true})).rejects.toMatchObject({code:'SETUP_CONFIRMATION_REQUIRED'});expect(readCaptureConfig()).toBeNull();
 await expect(setupCommand('apply',api,{yes:true,'plan-id':'changed'})).rejects.toMatchObject({code:'SETUP_PLAN_CHANGED'});expect(observations).toHaveLength(0);
}));
test('two interactive screens install plugins first and queue approved history only after the second confirmation',async()=>fixture(async(api,dir,observations)=>{
 const steps:string[]=[],screens:SelectionScreen[]=[],launched:SetupState[]=[];
 const result=await setupCommand('run',api,{}, {interactive:true,choose:async screen=>{
  screens.push(screen);steps.push('choose:'+screens.length);
  if(screens.length===1){expect(readSetupState({api,tenantId:'tenant',userId:'user'})).toBeNull();return screen.items.map(item=>({...item,selected:item.id==='codex',secondary:item.id==='codex'}));}
  expect(steps).toEqual(['choose:1','install','choose:2']);expect(launched).toHaveLength(0);expect(readSetupState({api,tenantId:'tenant',userId:'user'})?.historyJob).toBeUndefined();expect(screen.description.split('\n')[0]).toBe(historyBenefit);expect(screen.items.find(item=>item.id==='codex')?.selected).toBe(true);return screen.items;
 },installPlugins:async(_api,selected,options)=>{steps.push('install');expect(selected).toEqual(['codex']);expect(readCaptureConfig()).toMatchObject({hookOwnership:'plugin',harnesses:['codex']});expect(readCaptureConfig()?.command).toEqual(options?.command);return {results:[{client:'codex',status:'installed'}],humanTasks:[]};},launchHistory:state=>{steps.push('history');launched.push(state);return {state:'queued',jobId:state.historyJob?.id};}});
 expect(steps).toEqual(['choose:1','install','choose:2','history']);expect(observations).toHaveLength(2);expect(launched[0].historyJob?.files).toHaveLength(1);expect(launched[0].selections.forward.codex).toBe(true);expect(formatSetupOutput(result)).toContain('In your primary coding agent');
 for(const file of [join(dir,'codex','hooks.json'),join(dir,'codex','config.toml'),join(dir,'config','opencrawl','capture','runner.sh'),join(dir,'codex','skills','opencrawl','SKILL.md')])expect(existsSync(file)).toBe(false);
}));
test('cancelling history preserves the confirmed clients and never starts a new import',async()=>fixture(async(api)=>{
 let screens=0,launches=0;
 const result=await setupCommand('run',api,{}, {interactive:true,choose:async screen=>++screens===1?screen.items.map(item=>({...item,selected:item.id==='codex',secondary:false})):null,installPlugins:async()=>({results:[{client:'codex',status:'installed'}],humanTasks:[]}),launchHistory:()=>{launches++;return {state:'queued'};}});
 const state=readSetupState({api,tenantId:'tenant',userId:'user'});expect(screens).toBe(2);expect(launches).toBe(0);expect(state?.selections.plugins.codex).toBe(true);expect(state?.selections.history.codex).toBe(false);expect(state?.historyJob).toBeUndefined();expect(readCaptureConfig()?.harnesses).toEqual([]);expect(result).toMatchObject({historyDecision:'unchanged'});
}));

test('resume retries pending selected plugins without another selection screen or broader history consent',async()=>fixture(async api=>{
 let chooseCount=0,installs=0;
 const pending=await setupCommand('run',api,{}, {interactive:true,choose:async screen=>{chooseCount++;return screen.items.map(item=>({...item,selected:chooseCount===1&&item.id==='codex',secondary:false}));},installPlugins:async()=>({results:[{client:'codex',status:'pending'}],humanTasks:[{id:'codex-install',kind:'plugin_install',client:'codex',title:'Install Codex',instruction:'Install Codex, then run setup resume.'}]}),launchHistory:()=>({state:'not_started'})});
 expect(pending).toMatchObject({status:'needs_attention'});const before=readSetupState({api,tenantId:'tenant',userId:'user'});
 const resumed=await setupCommand('resume',api,{json:true},{choose:async()=>{throw new Error('Unexpected questionnaire');},installPlugins:async(_api,selected)=>{installs++;expect(selected).toEqual(['codex']);return {results:[{client:'codex',status:'installed'}],humanTasks:[]};},launchHistory:()=>({state:'not_started'})});
 expect(installs).toBe(1);expect(resumed).toMatchObject({status:'configured'});expect(readSetupState({api,tenantId:'tenant',userId:'user'})?.selections.history).toEqual(before?.selections.history);expect(readSetupState({api,tenantId:'tenant',userId:'user'})?.historyJob).toBeUndefined();
}));
test('a native reload task survives server observation until client evidence arrives',async()=>fixture(async api=>{
 const result=await setupCommand('apply',api,{yes:true,plugins:'cursor',forward:'none',history:'none'},{installPlugins:async()=>({results:[{client:'cursor',status:'installed'}],humanTasks:[{id:'cursor-reload',kind:'restart',client:'cursor',title:'Reload Cursor',instruction:'Reload Cursor to load the installed local plugin.'}]}),launchHistory:()=>({state:'not_started'})});
 expect(result).toMatchObject({humanTasks:[{id:'cursor-reload',kind:'restart'}]});
 const status=await setupCommand('status',api,{json:true});expect(status).toMatchObject({humanTasks:[{id:'cursor-reload'}]});
}));


test('setup observations request native hook trust only for clients with a trust gate',()=>fixture(async(api,_dir,observations)=>{
 const selected=Object.fromEntries(['claude-code','codex','cursor','antigravity'].map(client=>[client,true]));
 await publishSetup({schemaVersion:1,scope:{api,tenantId:'tenant',userId:'user'},installationId:'fixture-installation',machine:{id:'fixture-machine',label:'fixture'},acceptedAt:new Date().toISOString(),selections:{plugins:selected,forward:selected,history:{}}});
 const clients=(observations[0] as {clients:{client:string;hookTrust:string}[]}).clients;
 expect(Object.fromEntries(clients.map(client=>[client.client,client.hookTrust]))).toEqual({'claude-code':'not_required',codex:'pending',cursor:'not_required',antigravity:'not_required'});
}));

test('publishing preserves prepared and failed plugin states only when the server supports them',async()=>{
 for(const supported of [false,true])await fixture(async(api,_dir,observations)=>{
  const selected={'claude-code':true,codex:true,cursor:true,antigravity:true,'grok-bot':false};
  await publishSetup({schemaVersion:1,scope:{api,tenantId:'tenant',userId:'user'},installationId:'fixture-installation',machine:{id:'fixture-machine',label:'fixture'},acceptedAt:new Date().toISOString(),selections:{plugins:selected,forward:{},history:{}},pluginResults:[{client:'claude-code',status:'pending'},{client:'codex',status:'unchanged'},{client:'cursor',status:'prepared'},{client:'antigravity',status:'error'}]});
  const clients=(observations[0] as {clients:{client:string;installed:boolean;pluginState?:string}[]}).clients;
  expect(Object.fromEntries(clients.map(client=>[client.client,client.installed]))).toEqual({'claude-code':false,codex:true,cursor:false,antigravity:false,'grok-bot':false});
  if(supported)expect(Object.fromEntries(clients.map(client=>[client.client,client.pluginState]))).toEqual({'claude-code':'pending',codex:'installed',cursor:'prepared',antigravity:'error','grok-bot':'not_selected'});
  else expect(clients.every(client=>!Object.hasOwn(client,'pluginState'))).toBe(true);
 },supported);
});

const nativeUnknown=async():Promise<CodexHookReview>=>({state:'unknown',total:8,pending:null,disabled:null});
const nativeDisabled=async():Promise<CodexHookReview>=>({state:'observed',total:8,pending:0,disabled:8});
const nativeChanged=async():Promise<CodexHookReview>=>({state:'observed',total:8,pending:2,disabled:1});
const setupCodex:NonNullable<Parameters<typeof setupCommand>[3]>={installPlugins:async()=>({results:[{client:'codex',status:'installed'}],humanTasks:[]}),launchHistory:()=>({state:'not_started'}),inspectHooks:nativeUnknown};

test('captured or verified Codex setup stays quiet when native inspection is unavailable or hooks are intentionally disabled',async()=>fixture(async(api,_dir,_observations,setCodex)=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},setupCodex);
 for(const evidence of [{captureObservedAt:new Date().toISOString()}, {proof:{state:'verified'}}]){
  setCodex({...evidence,humanTasks:[]});
  for(const inspectHooks of [nativeUnknown,nativeDisabled])for(const action of ['status','resume']){
   const result=await setupCommand(action,api,{json:true},{...setupCodex,inspectHooks});
   expect(result).toMatchObject({humanTasks:[]});
  }
 }
}));

test('a search-only Codex plugin never adds capture trust, including stale server tasks and unrelated startup hooks',async()=>fixture(async(api,dir,_observations,setCodex)=>{
 writeFileSync(join(dir,'codex','hooks.json'),JSON.stringify({hooks:{SessionStart:[{hooks:[{type:'command',command:'echo unused fixture',statusMessage:'OpenCrawl session startup'}]}]}}));
 let inspections=0;const inspectHooks=async():Promise<CodexHookReview>=>{inspections++;return {state:'observed',total:1,pending:1,disabled:0};};
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'none',history:'none'},{...setupCodex,inspectHooks});
 setCodex({humanTasks:[{id:'stale-capture-trust',kind:'hook_trust',client:'codex',title:'Old recording choice',instruction:'Stale task'}, {id:'mcp-auth',kind:'mcp_auth',client:'codex',title:'Connect MCP',instruction:'Complete native sign-in'}]});
 for(const action of ['status','resume']){
  const result=await setupCommand(action,api,{json:true},{...setupCodex,inspectHooks});
  expect(result).toMatchObject({humanTasks:[{id:'mcp-auth'}],selections:{forward:{codex:false}}});
 }
 expect(inspections).toBe(0);
}));

test('a local recording opt-out suppresses capture trust before saved setup choices are refreshed',async()=>fixture(async(api,_dir,_observations,setCodex)=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},setupCodex);
 const path=join(captureDir(),'config.json'),config=JSON.parse(readFileSync(path,'utf8'));writeFileSync(path,JSON.stringify({...config,disabled:true}));
 setCodex({humanTasks:[{id:'stale-capture-trust',kind:'hook_trust',client:'codex',title:'Old recording choice',instruction:'Stale task'}]});
 const inspectHooks=async():Promise<CodexHookReview>=>{throw new Error('Recording opt-out must not inspect native hooks');};
 expect(await setupCommand('status',api,{json:true},{...setupCodex,inspectHooks})).toMatchObject({humanTasks:[]});
 expect(await setupCommand('resume',api,{json:true},{...setupCodex,inspectHooks})).toMatchObject({humanTasks:[],selections:{forward:{codex:false}}});
}));

test('positively observed changed hooks still require review after a previous capture proof',async()=>fixture(async(api,_dir,_observations,setCodex)=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},setupCodex);
 setCodex({captureObservedAt:new Date().toISOString(),proof:{state:'verified'},humanTasks:[]});
 for(const action of ['status','resume']){
  const result=await setupCommand(action,api,{json:true},{...setupCodex,inspectHooks:nativeChanged});
  expect(result).toMatchObject({humanTasks:[{id:'codex-hook-review',kind:'hook_trust',client:'codex'}]});
  const instruction=(result as {humanTasks:{instruction:string}[]}).humanTasks[0].instruction;
  expect(instruction).toContain('Codex will not run 2 OpenCrawl hooks');
  expect(instruction).toContain('keep intentional opt-outs');
 }
}));

test('an older installation proof cannot suppress review for a replacement local installation',async()=>fixture(async(api,_dir,_observations,setCodex)=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},setupCodex);
 setCodex({captureObservedAt:new Date().toISOString(),proof:{state:'verified'},humanTasks:[]});
 const path=join(captureDir(),'config.json'),config=JSON.parse(readFileSync(path,'utf8'));writeFileSync(path,JSON.stringify({...config,installationId:'replacement-installation'}));
 const result=await setupCommand('status',api,{json:true},setupCodex);
 expect(result).toMatchObject({humanTasks:[{id:'codex-hook-review',kind:'hook_trust',client:'codex'}]});
}));


test('setup plans, handoffs and sign-in keep the selected launcher and saved search-only choices',async()=>fixture(async(api,dir)=>{
 const command=[join(dir,"private install's bin",process.platform==='win32'?'opencrawl.cmd':'opencrawl')];
 const dependencies={...setupCodex,command};
 const plan=await setupCommand('plan',api,{plugins:'codex',forward:'none',history:'none'},dependencies) as {applyCommand:string;planId:string};
 expect(plan.applyCommand).toBe(formatSetupCommand(['setup','apply','--api',api,'--plugins','codex','--forward','none','--history','none','--plan-id',plan.planId,'--yes','--json'],command));
 const applied=await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'none',history:'none'},dependencies);
 for(const result of [applied,await setupCommand('resume',api,{json:true},dependencies)]){
  const handoff=result as {agentPrompt:string;nextStep:string};
  expect(handoff.agentPrompt).toContain('in this conversation');
  expect(handoff.agentPrompt).toContain('Use `'+formatSetupCommand([],command)+'` for every OpenCrawl command');
  expect(handoff.agentPrompt).toContain('Start with `'+formatSetupCommand(['setup','status','--local','--api',api,'--json'],command)+'`');
  expect(handoff.agentPrompt).toContain('recording off (forward=false)');
  expect(handoff.agentPrompt).toContain('without requiring a new session capture');
  expect(handoff.nextStep).toContain(formatSetupCommand(['setup','status','--local','--api',api,'--json'],command));
 }
 delete process.env.OPENCRAWL_TOKEN;
 const login=await setupCommand('run',api,{json:true},{command,interactive:false}) as {humanTasks:{instruction:string}[]};
 expect(login.humanTasks[0].instruction).toContain(formatSetupCommand(['login','--api',api],command));
 expect(login.humanTasks[0].instruction).toContain(formatSetupCommand(['setup','--api',api,'--json'],command));
}));

test('explicit recording without its plugin fails before any setup mutation',()=>fixture(async(api,dir,observations)=>{
 let installed=false;
 await expect(setupCommand('apply',api,{yes:true,plugins:'none',forward:'codex',history:'codex'},{installPlugins:async()=>{installed=true;return {results:[],humanTasks:[]};}})).rejects.toMatchObject({code:'SETUP_PLUGIN_REQUIRED'});
 expect(installed).toBe(false);expect(readCaptureConfig()).toBeNull();expect(readSetupState({api,tenantId:'tenant',userId:'user'})).toBeNull();expect(observations).toHaveLength(0);
}));

test('legacy ownership survives pending plugins, switches only after preparation, and retires definitions after activation',()=>fixture(async(api,dir)=>{
 await installCapture(api,{home:dir,harnesses:['codex'],command:['legacy-cli']});
 const original=readCaptureConfig()!,file=join(dir,'codex','hooks.json'),hooks=readFileSync(file,'utf8'),runner=hookRunner('capture',['legacy-cli']);
 let phase:'pending'|'prepared'|'installed'='pending',installs=0;
 const dependencies={...setupCodex,installPlugins:async()=>{installs++;expect(readCaptureConfig()?.hookOwnership).toBe(phase==='installed'?'plugin':'global');return {results:[{client:'codex' as const,status:phase}],humanTasks:[]};}};
 expect(await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},dependencies)).toMatchObject({status:'needs_attention'});
 expect(readCaptureConfig()).toMatchObject({hookOwnership:'global',installationId:original.installationId});expect(readFileSync(runner.file,'utf8')).toBe(runner.script);expect(readFileSync(file,'utf8')).toBe(hooks);
 phase='prepared';expect(await setupCommand('resume',api,{json:true},dependencies)).toMatchObject({status:'needs_attention'});
 expect(readCaptureConfig()).toMatchObject({hookOwnership:'plugin',installationId:original.installationId});expect(readFileSync(file,'utf8')).toBe(hooks);expect(readFileSync(runner.file,'utf8')).toBe(hookRunner('capture',readCaptureConfig()!.command).script);
 phase='installed';expect(await setupCommand('resume',api,{json:true},dependencies)).toMatchObject({status:'configured'});
 expect(installs).toBe(3);expect(JSON.parse(readFileSync(file,'utf8')).hooks).toEqual({});
}));

test('an unknown legacy runner blocks setup before recording choices or plugin state mutate',()=>fixture(async(api,dir)=>{
 await installCapture(api,{home:dir,harnesses:['codex'],command:['legacy-cli']});
 const before=readFileSync(join(captureDir(),'config.json'),'utf8'),runner=hookRunner('capture',['legacy-cli']);writeFileSync(runner.file,'unrecognized existing runner');
 let installs=0;await expect(setupCommand('apply',api,{yes:true,plugins:'codex',forward:'none',history:'none'},{...setupCodex,installPlugins:async()=>{installs++;return {results:[],humanTasks:[]};}})).rejects.toMatchObject({code:'PLUGIN_HOOK_MIGRATION_INVALID'});
 expect(installs).toBe(0);expect(readSetupState({api,tenantId:'tenant',userId:'user'})).toBeNull();expect(readFileSync(join(captureDir(),'config.json'),'utf8')).toBe(before);expect(readFileSync(runner.file,'utf8')).toBe('unrecognized existing runner');
}));

test('prepared native load guidance survives independent MCP or capture proof',()=>fixture(async(api,_dir,_observations,setCodex)=>{
 const dependencies={...setupCodex,installPlugins:async()=>({results:[{client:'codex' as const,status:'prepared' as const}],humanTasks:[{id:'codex-load',kind:'restart' as const,client:'codex' as const,title:'Load native plugin',instruction:'Review native plugin trust and reload.'}]})};
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'none',history:'none'},dependencies);
 setCodex({mcp:{state:'authenticated'},proof:{state:'verified'},captureObservedAt:new Date().toISOString()});
 for(const action of ['status','resume'])expect(await setupCommand(action,api,{json:true},dependencies)).toMatchObject({humanTasks:[{id:'codex-load',kind:'restart'}],selections:{forward:{codex:false}}});
}));

test('resume rechecks previously installed native plugins and a new launcher without expanding saved choices or history',()=>fixture(async(api,dir)=>{
 const first=[join(dir,'first-cli')],next=[join(dir,'new-cli')];
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'none',history:'codex'},{...setupCodex,command:first});const before=readSetupState({api,tenantId:'tenant',userId:'user'})!;
 let calls=0;
 const result=await setupCommand('resume',api,{json:true},{...setupCodex,command:next,choose:async()=>{throw new Error('No new questionnaire');},installPlugins:async(_api,selected,options)=>{calls++;expect(selected).toEqual(['codex']);expect(options?.command).toEqual(next);return {results:[{client:'codex',status:'prepared'}],humanTasks:[{id:'new-bundle-load',kind:'restart',client:'codex',title:'Load the current plugin',instruction:'Reload the native client.'}]};}});
 expect(calls).toBe(1);expect(result).toMatchObject({status:'needs_attention',humanTasks:[{id:'new-bundle-load'}]});
 const after=readSetupState({api,tenantId:'tenant',userId:'user'})!;expect(after.selections).toEqual(before.selections);expect(after.historyJob).toEqual(before.historyJob);expect(readCaptureConfig()?.command).toEqual(next);
}));


test('native hook status respects effective recording opt-outs without inspecting or authenticating',()=>fixture(async api=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'none',history:'none'},setupCodex);
 const savedFetch=globalThis.fetch;globalThis.fetch=Object.assign(()=>{throw new Error('Hook status must not access the server');},{preconnect:()=>{throw new Error('Hook status must not preconnect');}});
 try{
  expect(await setupCommand('hooks',api,{json:true},{inspectHooks:async()=>{throw new Error('Do not inspect opted-out capture');}})).toMatchObject({status:'hook_status',recordingSelected:false,review:{state:'not_applicable',pending:0}});
 }finally{globalThis.fetch=savedFetch;}
}));

test('native hook status fails closed when installation or selections change during inspection',()=>fixture(async api=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},setupCodex);
 const config=readCaptureConfig()!,file=join(process.env.OPENCRAWL_CONFIG_HOME!,'opencrawl','capture','config.json');
 const savedFetch=globalThis.fetch;globalThis.fetch=Object.assign(()=>{throw new Error('Hook status must not access the server');},{preconnect:()=>{throw new Error('Hook status must not preconnect');}});
 try{
  await expect(setupCommand('hooks',api,{json:true},{inspectHooks:async root=>{
   expect(root).toBe(config.roots.codex);writeFileSync(file,JSON.stringify({...config,installationId:'changed-during-inspection'}));
   return {state:'observed',total:8,pending:0,disabled:0};
  }})).rejects.toMatchObject({code:'SETUP_SCOPE_CHANGED'});
 }finally{globalThis.fetch=savedFetch;}
}));


test('native setup inspection cannot inherit trusted legacy global hooks for a plugin enrollment',()=>fixture(async api=>{
 await setupCommand('apply',api,{yes:true,plugins:'codex',forward:'codex',history:'none'},setupCodex);
 const config=readCaptureConfig()!,file=join(process.env.OPENCRAWL_CONFIG_HOME!,'opencrawl','capture','config.json');
 writeFileSync(file,JSON.stringify({...config,hookOwnership:'global'}));
 expect(await setupCommand('hooks',api,{json:true},{inspectHooks:async()=>{throw new Error('Legacy global trust is not plugin trust');}})).toMatchObject({recordingSelected:true,review:{state:'unknown',total:0,pending:null,disabled:null}});
}));


test('setup starts only the implemented worker after plugin files are ready and reports its real supervision',async()=>fixture(async(api,_dir,observations)=>{
 const order:string[]=[];
 const result=await setupCommand('apply',api,{yes:true,plugins:'claude-code,codex',forward:'claude-code,codex',history:'none'},{
  inspectHooks:nativeUnknown,launchHistory:()=>({state:'not_started'}),
  installPlugins:async()=>{order.push('plugins');expect(readCaptureConfig()).toMatchObject({captureWorker:'daemon-v1',hookOwnership:'plugin',harnesses:['claude-code','codex']});return {results:[{client:'claude-code',status:'prepared'},{client:'codex',status:'prepared'}],humanTasks:[]};},
  installDaemon:async config=>{order.push('daemon');expect(config.harnesses).toEqual(['claude-code','codex']);return {kind:'process',status:'requested',supervised:false,command:[]};}
 });
 expect(order).toEqual(['plugins','daemon']);expect(result).toMatchObject({worker:{kind:'process',supervised:false,harnesses:['claude-code']}});
 expect(observations).toHaveLength(2);expect(readCaptureConfig()?.historyHarnesses).toEqual([]);
}));

test('pending plugins defer the service while selected search plugins enable only their supported lanes',async()=>fixture(async api=>{
 let launches=0;
 const dependencies={inspectHooks:nativeUnknown,launchHistory:()=>({state:'not_started'}),installDaemon:async()=>{launches++;return {kind:'process',status:'requested',supervised:false,command:[]};}};
 await setupCommand('apply',api,{yes:true,plugins:'claude-code',forward:'claude-code',history:'none'},{...dependencies,installPlugins:async()=>({results:[{client:'claude-code',status:'pending'}],humanTasks:[]})});
 expect(launches).toBe(0);
 for(const choice of [{plugins:'codex',forward:'codex'}, {plugins:'claude-code',forward:'none'}] as const){
  const result=await setupCommand('apply',api,{yes:true,plugins:choice.plugins,forward:choice.forward,history:'none'},{...dependencies,installPlugins:async()=>({results:[{client:choice.plugins,status:'prepared'}],humanTasks:[]})});
  expect(result).toMatchObject({worker:{startup:true,harnesses:[]}});
 }
 expect(launches).toBe(2);
}));

test('explicit uninstall stops both lanes and resume restores only selected startup while preserving queues',async()=>fixture(async(api,dir)=>{
 const dependencies={inspectHooks:nativeUnknown,installPlugins:async()=>({results:[{client:'claude-code' as const,status:'prepared' as const}],humanTasks:[]}),launchHistory:()=>({state:'not_started'})};
 await setupCommand('apply',api,{yes:true,plugins:'claude-code',forward:'claude-code',history:'none'},dependencies);
 const scope={api,tenantId:'tenant',userId:'user'},before=readSetupState(scope)!;
 const queue=join(captureDir(),'queue','retained.json'),task=join(captureDir(),'daemon','inbox','startup-retained.json');mkdirSync(join(task,'..'),{recursive:true});writeFileSync(queue,'retained queue');writeFileSync(task,'retained task');
 const stopped=await uninstallCapture(dir);expect(stopped).toMatchObject({backgroundStartupStopped:true,queuedDataPreserved:true});
 expect(readCaptureConfig()).toMatchObject({disabled:true,backgroundStartup:false});expect(readSetupState(scope)?.selections).toEqual(before.selections);
 let launches=0;const result=await setupCommand('resume',api,{json:true},{...dependencies,installDaemon:async config=>{launches++;expect(config).toMatchObject({disabled:true,backgroundStartup:true,harnesses:[]});return {kind:'process',status:'requested',supervised:false,command:[]};}});
 expect(launches).toBe(1);expect(result).toMatchObject({worker:{startup:true,harnesses:[]}});
 expect(readSetupState(scope)?.selections.plugins).toEqual(before.selections.plugins);expect(readSetupState(scope)?.selections.history).toEqual(before.selections.history);
 expect(readFileSync(queue,'utf8')).toBe('retained queue');expect(readFileSync(task,'utf8')).toBe('retained task');
}));

test('service installation failure does not publish successful setup or broaden saved choices',async()=>fixture(async(api,_dir,observations)=>{
 await expect(setupCommand('apply',api,{yes:true,plugins:'claude-code',forward:'claude-code',history:'none'},{
  installPlugins:async()=>({results:[{client:'claude-code',status:'prepared'}],humanTasks:[]}),
  installDaemon:async()=>{throw Error('synthetic supervisor refusal');},launchHistory:()=>{throw Error('must not launch history');}
 })).rejects.toThrow('synthetic supervisor refusal');
 expect(observations).toHaveLength(0);expect(readCaptureConfig()).toMatchObject({harnesses:['claude-code'],historyHarnesses:[],captureWorker:'daemon-v1'});
 const saved=readSetupState({api,tenantId:'tenant',userId:'user'});expect(saved?.selections.history.codex).toBe(false);expect(saved?.worker).toBeUndefined();
}));
