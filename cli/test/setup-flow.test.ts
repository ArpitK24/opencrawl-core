import {test,expect} from 'bun:test';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishSetup} from '../src/setup/api.ts';
import {setupCommand,formatSetupOutput} from '../src/setup/command.ts';
import {readSetupState,historyBenefit,type SetupState} from '../src/setup/state.ts';
import {readCaptureConfig} from '../src/capture/runtime.ts';
import {applySelectionKey,type SelectionCursor} from '../src/setup/select.ts';
import type {SelectionScreen} from '../src/setup/select.ts';
async function fixture(run:(api:string,dir:string,observations:unknown[])=>Promise<void>){
 const dir=mkdtempSync(join(tmpdir(),'opencrawl-setup-flow-')),saved={...process.env},observations:unknown[]=[];let installations:unknown[]=[];
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  let data:unknown;
  if(req.url==='/api/setup')data={schemaVersion:1,scope:{tenantId:'tenant',userId:'user'},firstWin:null,installations};
  else if(req.url==='/api/setup/installation'){observations.push(body);installations=[{...body,clients:body.clients.map((client:Record<string,unknown>)=>({...client,humanTasks:[]}))}];data=installations[0];}
  else if(req.url==='/api/sessions/identity')data={principal:{tenantId:'tenant',userId:'user'},capabilities:{harnesses:['claude-code','codex','cursor','antigravity']}};
  else {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({schemaVersion:1,data}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const api='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
  Object.assign(process.env,{HOME:dir,USERPROFILE:dir,PATH:dir,OPENCRAWL_CONFIG_HOME:join(dir,'config'),OPENCRAWL_API_URL:api,OPENCRAWL_TOKEN:'fixture-access-token-0123456789',OPENCRAWL_SESSIONS_TOKEN:'fixture-upload-token-0123456789',CLAUDE_DESKTOP_CONFIG_DIR:join(dir,'desktop'),CLAUDE_CONFIG_DIR:join(dir,'claude'),CODEX_HOME:join(dir,'codex'),CURSOR_CONFIG_DIR:join(dir,'cursor'),ANTIGRAVITY_HOME:join(dir,'agy')});
  const file=join(dir,'codex','sessions','one.jsonl');mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'one',source:'cli'}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:'approved historical content'}})+'\n');
  await run(api,dir,observations);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);rmSync(dir,{recursive:true,force:true});}
}
test('keyboard multiselect toggles plugins and recording independently with all/none shortcuts',()=>{
 let state:SelectionCursor={index:0,column:0,items:[{id:'codex',label:'Codex',selected:true,secondary:false},{id:'cursor',label:'Cursor',selected:true,secondary:true}]};
 state=applySelectionKey(state,'n');expect(state.items.map(item=>item.selected)).toEqual([false,false]);expect(state.items.map(item=>item.secondary)).toEqual([false,true]);
 state=applySelectionKey(state,'right');state=applySelectionKey(state,'space');expect(state.items[0]).toMatchObject({selected:false,secondary:true});
 state=applySelectionKey(state,'down');state=applySelectionKey(state,'space');expect(state.items[1].secondary).toBe(false);
 state=applySelectionKey(state,'left');state=applySelectionKey(state,'a');expect(state.items.every(item=>item.selected)).toBe(true);
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
 },installPlugins:async(_api,selected)=>{steps.push('install');expect(selected).toEqual(['codex']);return {results:[{client:'codex',status:'installed'}],humanTasks:[]};},launchHistory:state=>{steps.push('history');launched.push(state);return {state:'queued',jobId:state.historyJob?.id};}});
 expect(steps).toEqual(['choose:1','install','choose:2','history']);expect(observations).toHaveLength(2);expect(launched[0].historyJob?.files).toHaveLength(1);expect(launched[0].selections.forward.codex).toBe(true);expect(formatSetupOutput(result)).toContain('In your primary coding agent');
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
