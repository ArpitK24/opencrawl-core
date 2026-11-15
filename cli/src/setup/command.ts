import {readFileSync} from 'node:fs';
import {hostname,homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {CliError,apiOrigin} from '../oauth.ts';
import {atomicJson,withSessionLock} from '../session.ts';
import {readCaptureConfig,captureDir} from '../capture/runtime.ts';
import {installCapture} from '../capture/install.ts';
import {inspectCodexHooks,codexHookReviewMessage} from '../capture/codex-hooks.ts';
import {inventory,type HistoryFile} from '../capture/backfill.ts';
import {defaultClaudeDesktopSessionsRoot} from '../capture/desktop-history.ts';
import type {Harness,TranscriptHarness} from '../capture/parse.ts';
import {setupInventory} from './inventory.ts';
import {installSetupPlugins} from './plugins.ts';
import {retireLegacySetupHooks,prepareLegacyPluginMigration,activatePluginOwnership} from './legacy-hooks.ts';
import {chosen,defaultSelections,historyBenefit,readSetupState,readStateKey,scopeKey,selectGroup,selectionDigest,updateSetupState,type SetupScope,type SetupState,type SetupHumanTask,type SetupSelections} from './state.ts';
import {readServerSetup,serverScope,publishSetup,type SetupServerStatus} from './api.ts';
import {historyJob,startHistoryWorker,runHistoryWorker} from './history-worker.ts';
import {chooseSetupItems} from './select.ts';
import {verifyInstallation} from '../verify-installation.ts';
import {formatSetupCommand,setupCommandForSelf} from './invocation.ts';
export {formatSetupCommand} from './invocation.ts';
type Values=Record<string,unknown>;
type Dependencies={command?:string[];login?:()=>Promise<unknown>;installPlugins?:typeof installSetupPlugins;launchHistory?:typeof startHistoryWorker;choose?:typeof chooseSetupItems;interactive?:boolean;inspectHooks?:typeof inspectCodexHooks};
function historyFiles(api:string):HistoryFile[]{const previous=readCaptureConfig();return inventory(previous?.api===api?previous:{roots:{'claude-code':process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),codex:process.env.CODEX_HOME||join(homedir(),'.codex'),antigravity:process.env.ANTIGRAVITY_HOME||join(homedir(),'.gemini')},claudeDesktopSessionsRoot:defaultClaudeDesktopSessionsRoot()},'all').files;}
const list=(values:string[])=>values.length?values.join(','):'none';

function preserveRecordingOff(selections:SetupSelections,scope:SetupScope,config=readCaptureConfig()):SetupSelections{
 if(!config||config.api!==scope.api||config.owner.tenantId!==scope.tenantId||config.owner.userId!==scope.userId)return selections;
 const forward={...selections.forward};
 if(config.disabled)for(const client of Object.keys(forward))forward[client]=false;
 else {
  for(const client of Object.keys(forward))if(!(config.harnesses??['claude-code','codex']).includes(client as Harness))forward[client]=false;
  try{const value=Bun.TOML.parse(readFileSync(join(config.roots.codex,'config.toml'),'utf8')) as {features?:{hooks?:boolean}};if(value.features?.hooks===false)forward.codex=false;}catch{}
  if(config.roots.antigravity)try{const hooks=JSON.parse(readFileSync(join(config.roots.antigravity,'config','hooks.json'),'utf8'));if(hooks['opencrawl-capture']?.enabled===false)forward.antigravity=false;}catch{}
 }
 return {...selections,forward};
}

/** A local binding is not a freshly authenticated principal or server proof. */
function readLocalCaptureConfig(){
 try{return readCaptureConfig();}catch{throw new CliError('SETUP_STATE_INVALID','Local capture configuration could not be read. Preserve it and repair the local file before continuing; no sign-in or setup was started.',2);}
}
export function localSetupStatus(requestedApi?:string){
 const config=readLocalCaptureConfig();
 if(!config)throw new CliError('SETUP_NOT_STARTED','No local capture installation is saved. Local status cannot verify setup; no choices or sign-in were changed.',2);
 if(config.schemaVersion!==1||typeof config.api!=='string'||typeof config.owner?.tenantId!=='string'||!config.owner.tenantId||typeof config.owner?.userId!=='string'||!config.owner.userId||typeof config.installationId!=='string'||!config.installationId||config.installationId==='pending'||config.authPending)throw new CliError('SETUP_STATE_INVALID','Local capture has no complete saved installation binding. Preserve its configuration and finish the existing sign-in before continuing.',2);
 const api=apiOrigin(requestedApi??config.api);
 if(config.api!==api)throw new CliError('SETUP_SCOPE_CHANGED','The requested API differs from this local installation. No saved choices or credentials were changed.',2);
 const scope={api:config.api,tenantId:config.owner.tenantId,userId:config.owner.userId};
 let state:SetupState|null;
 try{state=readSetupState(scope);}catch(error){if(error instanceof CliError)throw error;throw new CliError('SETUP_STATE_INVALID','Saved local setup choices are malformed. Preserve the file and repair it before continuing; no sign-in or setup was started.',2);}
 if(!state)throw new CliError('SETUP_NOT_STARTED','No saved setup choices match this local installation owner and API. Preserve the current installation; local status did not start setup.',2);
 if(state.scope.api!==scope.api||state.scope.tenantId!==scope.tenantId||state.scope.userId!==scope.userId||state.installationId!==config.installationId)throw new CliError('SETUP_SCOPE_CHANGED','Saved setup choices do not match the current installation, API and owner. No state was changed.',2);
 const selections=preserveRecordingOff(state.selections,scope,config);
 if(JSON.stringify(readLocalCaptureConfig())!==JSON.stringify(config))throw new CliError('SETUP_SCOPE_CHANGED','The local installation changed while reading status. Retry local status; no state was changed.',2);
 return {status:'local_status',freshness:'local-only',serverChecked:false,scopeSource:'saved-capture-config',scope,installationId:config.installationId,savedSelections:state.selections,selections};
}

const planDigest=(scope:SetupScope,selections:SetupSelections,files:HistoryFile[])=>createHash('sha256').update(selectionDigest(scope,selections)+JSON.stringify(files)).digest('hex');
async function tasks(server:SetupServerStatus,state:SetupState|null,inspectHooks:typeof inspectCodexHooks):Promise<SetupHumanTask[]>{
 const row=server.installations.find(row=>row.installationId===state?.installationId);
 const found=row?[...(state?.humanTasks??[]).filter(task=>{const client=row.clients.find(client=>client.client===task.client);if(task.kind==='plugin_install')return !client?.installed;if(task.kind==='restart')return Boolean(task.client&&state?.selections.plugins[task.client]&&(state.pluginResults?.some(result=>result.client===task.client&&result.status==='prepared')||!client?.captureObservedAt&&client?.mcp?.state!=='authenticated'&&client?.proof?.state!=='verified'));return false;}),...row.clients.flatMap(client=>client.humanTasks)]:state?.humanTasks??[];
 const others=found.filter(task=>task.client!=='codex'||task.kind!=='hook_trust');
 if(!state)return found;
 // Plugin installation does not consent to recording. Respect saved and local opt-outs.
 if(!preserveRecordingOff(state.selections,state.scope).forward.codex)return others;
 const config=readCaptureConfig();
 if(!config||config.api!==state.scope.api||config.owner.tenantId!==state.scope.tenantId||config.owner.userId!==state.scope.userId)return found;
 const review=await inspectHooks(config.roots.codex);
 if(review.state==='not_applicable')return found;
 const client=row?.clients.find(client=>client.client==='codex');
 const captureProven=config.installationId===state.installationId&&Boolean(client?.captureObservedAt||client?.proof?.state==='verified');
 // Missing inspection and disabled opt-outs cannot undo server-owned capture proof.
 // A positively observed new or changed definition still needs the person's review.
 if(captureProven&&!(review.state==='observed'&&(review.pending??0)>0))return others;
 const instruction=codexHookReviewMessage(review);
 return instruction?[{id:'codex-hook-review',kind:'hook_trust',client:'codex',title:'Review OpenCrawl hooks in Codex',instruction},...others]:others;
}
function assertPluginSelection(selections:SetupSelections){const missing=chosen(selections,'forward').filter(client=>!selections.plugins[client]);if(missing.length)throw new CliError('SETUP_PLUGIN_REQUIRED','Future recording requires its native plugin. Select '+missing.join(', ')+' in --plugins, or turn its --forward choice off. History choices remain independent.',64);}
async function confirmScope(scope:SetupScope){if(scopeKey(serverScope(scope.api,await readServerSetup(scope.api)))!==scopeKey(scope))throw new CliError('SETUP_SCOPE_CHANGED','The signed-in workspace changed. Review setup again.');}
async function applyClients(scope:SetupScope,selections:SetupSelections,installPlugins:typeof installSetupPlugins,command:string[]){
 assertPluginSelection(selections);
 await confirmScope(scope);
 const previous=readSetupState(scope),existing=readCaptureConfig();
 const migration=prepareLegacyPluginMigration(scope,existing,command);
 // Saving the first confirmation independently makes interruption before the
 // history screen safe: it cannot create consent or a job for new history.
 await updateSetupState(scope,old=>({...old,schemaVersion:1,scope,selections,acceptedAt:new Date().toISOString(),pluginResults:[...(old?.pluginResults??[]).filter(row=>!selections.plugins[row.client]),...chosen(selections,'plugins').map(client=>({client,status:'pending'}))]}));
 const forward=chosen(selections,'forward');
 const capture=await installCapture(scope.api,{harnesses:forward as Harness[],historyHarnesses:chosen(selections,'history') as TranscriptHarness[],selectionMode:'replace',expectedOwner:scope,expectedConfig:existing,hookOwnership:'plugin',deferPluginOwnership:Boolean(migration),command});
 const plugins=await installPlugins(scope.api,chosen(selections,'plugins'),{command});
 await confirmScope(scope);
 const ready=chosen(selections,'plugins').every(client=>plugins.results.some(row=>row.client===client&&['installed','unchanged','prepared'].includes(row.status)));
 if(ready)await activatePluginOwnership(scope,migration);
 const migrated=[...plugins.results.filter(row=>['installed','unchanged'].includes(row.status)).map(row=>row.client),...Object.keys(selections.plugins).filter(client=>!selections.plugins[client])];
 if(readCaptureConfig()?.hookOwnership==='plugin')await retireLegacySetupHooks(scope,existing,migrated);
 const pluginResults=[...(previous?.pluginResults??[]).filter(row=>!selections.plugins[row.client]&&['installed','unchanged'].includes(row.status)),...plugins.results];
 const humanTasks:SetupHumanTask[]=[...plugins.humanTasks];
 const state=await updateSetupState(scope,current=>({...current!,installationId:capture.installationId,machine:current?.machine??{id:capture.installationId,label:hostname()},pluginResults,humanTasks}));
 await publishSetup(state);return state;
}
async function applyHistory(scope:SetupScope,selections:SetupSelections,files:HistoryFile[]){
 await confirmScope(scope);
 await withSessionLock('capture:configuration',async()=>{const current=readCaptureConfig();if(!current||current.api!==scope.api||current.owner.tenantId!==scope.tenantId||current.owner.userId!==scope.userId)throw new CliError('SETUP_SCOPE_CHANGED','The recording destination changed before history approval.');atomicJson(join(captureDir(),'config.json'),{...current,historyHarnesses:chosen(selections,'history'),...(chosen(selections,'history').length?{disabled:false}:{})});});
 const state=await updateSetupState(scope,current=>{if(!current?.installationId)throw new CliError('SETUP_NOT_STARTED','Confirm client setup before history.');return {...current,selections,historyJob:historyJob(current,chosen(selections,'history'),files)};});
 await publishSetup(state);return state;
}
async function result(state:SetupState,launchHistory:typeof startHistoryWorker,inspectHooks:typeof inspectCodexHooks,command:string[],start=true){
 const history=start?launchHistory(state):{state:state.historyJob?.state??'not_started'};
 const server=await readServerSetup(state.scope.api),statusCommand=formatSetupCommand(['setup','status','--local','--api',state.scope.api,'--json'],command);
 return {status:state.pluginResults?.some(row=>['error','pending','prepared'].includes(row.status))?'needs_attention':'configured',scope:state.scope,installationId:state.installationId,selections:state.selections,plugins:state.pluginResults,history,humanTasks:await tasks(server,state,inspectHooks),historyBenefit,agentPrompt:`Continue OpenCrawl setup in this conversation. Use \`${formatSetupCommand([],command)}\` for every OpenCrawl command${process.platform==='win32'?' in PowerShell':''}. Start with \`${statusCommand}\` to read this machine's saved choices without network access. Then use the installed plugin's native installation_status tool for each selected client and follow its returned human tasks. Use its verify_installation tool for the returned proof. Reuse my saved choices. For clients with recording off (forward=false), complete the MCP connection without requiring a new session capture.`,nextStep:`Use \`${statusCommand}\` for saved local choices; server status comes from the native plugin. Installation is not proof that a session is searchable.`};
}
export async function setupCommand(action:string,api:string,values:Values,{command=setupCommandForSelf(),login,installPlugins=installSetupPlugins,launchHistory=startHistoryWorker,choose=chooseSetupItems,inspectHooks=inspectCodexHooks,interactive=Boolean(process.stdin.isTTY&&process.stderr.isTTY&&!values.json)}:Dependencies={}){
 if(values.local!==undefined){if(values.local!==true||action!=='status')throw new CliError('INVALID_USAGE','Use --local only with setup status.',64);return localSetupStatus(api);}
 if(action==='worker'){if(typeof values['scope-key']!=='string')throw new CliError('INVALID_USAGE','Missing history scope.',64);const state=readStateKey(values['scope-key']);if(state?.scope.api!==api)throw new CliError('SETUP_SCOPE_CHANGED','History worker API does not match its approved scope.');await runHistoryWorker(values['scope-key']);return null;}
 if(!['run','plan','status','apply','resume','verify'].includes(action))throw new CliError('INVALID_USAGE','Use setup, setup --json, setup apply, setup status, setup resume, or setup verify.',64);
 let server;
 try{server=await readServerSetup(api);}catch(error){
  if(error instanceof CliError&&error.code==='AUTH_REQUIRED'){
   if(action==='run'&&interactive&&login){await login();server=await readServerSetup(api);}
   else return {status:'action_required',humanTasks:[{id:'cli-login',kind:'login',title:'Sign in to OpenCrawl',instruction:`Run \`${formatSetupCommand(['login','--api',api],command)}\`${process.platform==='win32'?' in PowerShell':''}, complete browser sign-in, then run \`${formatSetupCommand(['setup','--api',api,'--json'],command)}\`.`}],historyBenefit};
  }else throw error;
 }
 const scope=serverScope(api,server),previous=readSetupState(scope);
 if(action==='status')return {status:'status',scope,selections:previous?.selections??null,history:previous?.historyJob??null,server,humanTasks:await tasks(server,previous,inspectHooks)};
 if(action==='verify'){
  const client=Array.isArray(values.client)?values.client[0]:values.client;
  if(!previous?.installationId||typeof client!=='string')throw new CliError('INVALID_USAGE',`Run \`${formatSetupCommand(['setup','--api',api],command)}\` first, then \`${formatSetupCommand(['setup','verify','--api',api,'--client','CLIENT'],command)}\`.`,64);
  return verifyInstallation(api,{installationId:previous.installationId,client});
 }
 if(action==='resume'){
  if(!previous)throw new CliError('SETUP_NOT_STARTED',`Run \`${formatSetupCommand(['setup','--api',api],command)}\` to review choices first.`);
  const selected=preserveRecordingOff(previous.selections,scope);
  // Native registration and bundle contents may change after any saved result.
  // Reconcile idempotently using the accepted choices, without another screen
  // or any expansion of the approved historical snapshot.
  const repaired=await applyClients(scope,selected,installPlugins,command);
  return result(repaired,launchHistory,inspectHooks,command);
 }
 const clients=setupInventory({api}),existing=readCaptureConfig(),legacyForward=existing?.api===api&&existing.owner.tenantId===scope.tenantId&&existing.owner.userId===scope.userId?(existing.disabled?[]:existing.harnesses??['claude-code','codex']):undefined;
 let selections=preserveRecordingOff(defaultSelections(clients,previous?.selections,legacyForward),scope);
 for(const group of ['plugins','forward','history'] as const)selections[group]=selectGroup(values[group]===undefined?undefined:String(values[group]),group,clients,selections);
 if(!interactive||action!=='run')assertPluginSelection(selections);
 const files=historyFiles(api).filter(file=>selections.history[file.harness]),planId=planDigest(scope,selections,files);
 const plan={status:'confirmation_required',scope,clients,selections,historyBenefit,history:{files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0)},planId,humanTasks:await tasks(server,previous,inspectHooks),applyCommand:formatSetupCommand(['setup','apply','--api',api,'--plugins',list(chosen(selections,'plugins')),'--forward',list(chosen(selections,'forward')),'--history',list(chosen(selections,'history')),'--plan-id',planId,'--yes','--json'],command)};
 if(action==='run'&&interactive){
  const selected=await choose({title:'Choose your agent plugins',description:'Selected clients record new sessions as shown. Messages, tool results and attachments are shared with your signed-in workspace. Use ←/→ to choose plugins and recording. Recording needs its plugin; a plugin can stay search-only.',secondaryLabel:'Record new',items:clients.filter(client=>client.plugin||client.forward).map(client=>({id:client.id,label:client.label+(client.detected?'':' (not detected)'),selected:selections.plugins[client.id]===true,...(client.forward?{secondary:selections.forward[client.id]===true}:{})}))});
  if(selected===null)return {status:'cancelled',humanTasks:[]};
  for(const row of selected){selections.plugins[row.id]=row.selected;if(row.secondary!==undefined)selections.forward[row.id]=row.secondary;}
  const prospectiveHistory={...selections.history};
  selections.history=previous?.selections.history??Object.fromEntries(clients.map(client=>[client.id,false]));
  let state=await applyClients(scope,selections,installPlugins,command);
  const available=historyFiles(api),historyClients=clients.filter(client=>client.history&&available.some(file=>file.harness===client.id));
  const selectedHistory=await choose({title:'Choose past sessions to import',description:historyBenefit+'\nSelected history is shared with your signed-in workspace. Import continues in the background.',emptyMessage:'No local history found. Continuing without an import.',items:historyClients.map(client=>({id:client.id,label:client.label+` (${available.filter(file=>file.harness===client.id).length} files)`,selected:prospectiveHistory[client.id]===true}))});
  if(selectedHistory===null)return {...await result(state,launchHistory,inspectHooks,command,false),historyDecision:'unchanged'};
  selections={...selections,history:Object.fromEntries(clients.map(client=>[client.id,selectedHistory.some(row=>row.id===client.id&&row.selected)]))};
  state=await applyHistory(scope,selections,available.filter(file=>selections.history[file.harness]));return result(state,launchHistory,inspectHooks,command);
 }
 if(action!=='apply')return plan;
 if(values.yes!==true)return plan;
 if(values['plan-id']!==undefined&&values['plan-id']!==planId)throw new CliError('SETUP_PLAN_CHANGED',`The workspace, choices or available history changed. Review \`${formatSetupCommand(['setup','--api',api,'--json'],command)}\` again before applying.`,2);
 if(values['plan-id']===undefined&&!['plugins','forward','history'].every(group=>typeof values[group]==='string'))throw new CliError('SETUP_CONFIRMATION_REQUIRED','Use the applyCommand after the user confirms its choices, or specify all three selections with --yes.',64);
 await applyClients(scope,selections,installPlugins,command);
 return result(await applyHistory(scope,selections,files),launchHistory,inspectHooks,command);
}
export function formatSetupOutput(data:unknown):string{
 const value=data as {status?:string;humanTasks?:SetupHumanTask[];applyCommand?:string;agentPrompt?:string;history?:{state?:string}};
 if(value.status==='local_status')return 'Setup: local-only saved state. The server and current authentication were not checked.\nUse --json for the installation binding and saved/effective choices.';
 if(value.agentPrompt)return `OpenCrawl setup saved.${value.history?.state==='queued'||value.history?.state==='running'?' History is importing in the background.':''}\nIn your primary coding agent, send:\n${value.agentPrompt}`;
 if(value.applyCommand)return 'Review the JSON setup plan, then run its applyCommand after confirming the choices.';
 if(value.status==='action_required')return value.humanTasks?.[0]?.instruction??'Complete CLI sign-in before continuing setup.';
 return `Setup: ${value.status??'status'}${value.history?.state?'\nHistory: '+value.history.state:''}\nUse --json for the agent-readable details.`;
}
