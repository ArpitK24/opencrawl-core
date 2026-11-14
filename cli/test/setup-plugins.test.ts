import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pluginCommand,pluginInventory,setupPluginFiles,installSetupPlugins,type PluginOptions} from '../src/setup/plugins.ts';

async function fixture(run:(home:string,options:PluginOptions,calls:string[][])=>Promise<void>) {
 const home=mkdtempSync(join(tmpdir(),'opencrawl-setup-plugin-')),prior=process.env.OPENCRAWL_CONFIG_HOME;
 process.env.OPENCRAWL_CONFIG_HOME=join(home,'config');
 const calls:string[][]=[],installed:Record<string,Record<string,unknown>>={},markets:Record<string,string>={};
 const options:PluginOptions={home,env:{OPENCRAWL_CONFIG_HOME:join(home,'config')},which:name=>'/client/'+name,runner:async(command,args)=>{
  calls.push([command,...args]);
  if(args[1]==='marketplace'&&args[2]==='add')markets[command]=args[3];
  if(args[1]==='add'||args[1]==='install'){
   const directory=join(markets[command],'opencrawl'),isCodex=command.endsWith('/codex'),mcp=JSON.parse(readFileSync(join(directory,isCodex?'mcp.json':'.mcp.json'),'utf8'));
   const cache=join(home,'cache',isCodex?'codex':'claude');mkdirSync(cache,{recursive:true});writeFileSync(join(cache,'mcp.json'),JSON.stringify(mcp));
   installed[command]={name:'opencrawl',pluginId:'opencrawl@opencrawl-cli',enabled:true,source:{source:'local',path:directory},readFromFolder:directory,mcpServers:mcp.mcpServers};
   return {code:0,stdout:JSON.stringify({installedPath:cache})};
  }
  return {code:0,stdout:JSON.stringify({installed:installed[command]?[installed[command]]:[]})};
 }};
 try{await run(home,options,calls);}finally{if(prior===undefined)delete process.env.OPENCRAWL_CONFIG_HOME;else process.env.OPENCRAWL_CONFIG_HOME=prior;rmSync(home,{recursive:true,force:true});}
}
test('inventory selects only detected supported clients without creating configuration',()=>{
 const home=mkdtempSync(join(tmpdir(),'opencrawl-plugin-inventory-'));
 try{
  expect(pluginInventory({home,env:{},which:()=>null}).every(row=>!row.detected)).toBe(true);
  mkdirSync(join(home,'.codex'));
  expect(pluginInventory({home,env:{},which:()=>null}).filter(row=>row.detected).map(row=>row.id)).toEqual(['codex']);
  expect(existsSync(join(home,'.config'))).toBe(false);
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('every client bundle is endpoint-bound and leaves capture/trust to the selected collector',()=>{
 for(const client of ['claude-code','codex','cursor','antigravity'] as const){
  const files=setupPluginFiles(client,'https://selfhost.example');
  const mcp=Object.entries(files).find(([name])=>['mcp.json','.mcp.json','mcp_config.json'].includes(name))!;
  expect(mcp[1]).toContain('https://selfhost.example/mcp');expect(mcp[1]).not.toContain('app.getopencrawl.com');
  expect(Object.keys(files).some(name=>name.includes('hooks.json'))).toBe(false);
  expect(files['skills/opencrawl-setup/SKILL.md']).toContain('Never switch to a separate "test MCP" prompt');
  expect(files['skills/opencrawl/references/search.md']).toContain('Lexical search recipe');
 }
});
test('selected native installs are idempotent and do not enroll unrelated clients',()=>fixture(async(home,options,calls)=>{
 const first=await installSetupPlugins('https://selfhost.example',['codex'],options);
 expect(first.results[0]?.status).toBe('installed');
 expect(calls.map(c=>c.slice(1,4))).toEqual([['plugin','list','--json'],['plugin','marketplace','add'],['plugin','add','opencrawl@opencrawl-cli'],['plugin','list','--json']]);
 const marketplace=JSON.parse(readFileSync(join(first.results[0]!.directory!,'../.agents/plugins/marketplace.json'),'utf8'));
 expect(marketplace.plugins[0].policy.authentication).toBe('ON_USE');
 calls.length=0;
 expect((await installSetupPlugins('https://selfhost.example',['codex'],options)).results[0]?.status).toBe('unchanged');
 expect(calls).toHaveLength(1);expect(calls[0]?.slice(1)).toEqual(['plugin','list','--json']);
 expect(existsSync(join(home,'.claude'))).toBe(false);expect(existsSync(join(home,'.cursor'))).toBe(false);
}));
test('disabled native plugin is preserved without reinstallation or implicit enabling',()=>fixture(async(home,options,calls)=>{
 options.runner=async(command,args)=>{calls.push([command,...args]);return {code:0,stdout:JSON.stringify({installed:[{name:'opencrawl',id:'opencrawl@opencrawl-cli',enabled:false}]})};};
 const result=await installSetupPlugins('https://selfhost.example',['claude-code'],options);
 expect(result.results[0]?.status).toBe('pending');expect(result.humanTasks[0]?.kind).toBe('plugin_install');
 expect(calls).toHaveLength(1);expect(existsSync(join(home,'config/opencrawl/setup-plugins'))).toBe(false);
}));
test('missing native executable and failed native install cannot become installed',()=>fixture(async(_home,options)=>{
 options.which=()=>null;
 expect((await installSetupPlugins('https://selfhost.example',['antigravity'],options)).results[0]?.status).toBe('pending');
 options.which=name=>'/client/'+name;options.runner=async()=>({code:1});
 expect((await installSetupPlugins('https://selfhost.example',['codex'],options)).results[0]?.status).toBe('pending');
}));
test('Cursor local bundle never overwrites an unmanaged directory or follows a link',()=>fixture(async(home,options)=>{
 const directory=join(home,'.cursor/plugins/local/opencrawl');mkdirSync(directory,{recursive:true});
 writeFileSync(join(directory,'keep.txt'),'user plugin');
 expect((await installSetupPlugins('https://selfhost.example',['cursor'],options)).results[0]?.status).toBe('error');
 expect(readFileSync(join(directory,'keep.txt'),'utf8')).toBe('user plugin');
 rmSync(directory,{recursive:true});const elsewhere=join(home,'elsewhere');mkdirSync(elsewhere);symlinkSync(elsewhere,directory,'dir');
 expect((await installSetupPlugins('https://selfhost.example',['cursor'],options)).results[0]?.status).toBe('error');
 expect(existsSync(join(elsewhere,'.cursor-plugin'))).toBe(false);
}));
test('Cursor writes only its supported local plugin with no duplicate capture hooks',()=>fixture(async(home,options,calls)=>{
 const result=await installSetupPlugins('https://selfhost.example',['cursor'],options);
 expect(result.results[0]?.status).toBe('installed');expect(calls).toHaveLength(0);
 expect(existsSync(join(home,'.cursor/plugins/local/opencrawl/.cursor-plugin/plugin.json'))).toBe(true);
 expect(existsSync(join(home,'.cursor/hooks.json'))).toBe(false);
 expect(result.humanTasks.map(task=>task.kind)).toEqual(['restart','mcp_auth']);
}));

test('Windows npm shims use literal argument boundaries without shell expansion',()=>{
 const command="C:\\User's Files\\codex.cmd",args=['plugin','add','literal$(command)&other'];
 const [program,actual]=pluginCommand(command,args,{SystemRoot:'C:\\Windows'},'win32');
 expect(program).toEndWith('powershell.exe');
 expect(actual.at(-1)).toBe("& 'C:\\User''s Files\\codex.cmd' 'plugin' 'add' 'literal$(command)&other'; exit $LASTEXITCODE");
 expect(pluginCommand('/bin/codex',args,{},'linux')).toEqual(['/bin/codex',args]);
});

test('foreign marketplace plugin remains intact without a duplicate install',()=>fixture(async(home,options,calls)=>{
 options.runner=async(command,args)=>{calls.push([command,...args]);return {code:0,stdout:JSON.stringify([{id:'opencrawl@other-marketplace',enabled:true}])};};
 const result=await installSetupPlugins('https://selfhost.example',['claude-code'],options);
 expect(result.results[0]?.status).toBe('pending');expect(calls).toHaveLength(1);
 expect(existsSync(join(home,'config/opencrawl/setup-plugins'))).toBe(false);
}));
test('zero install exit without native inventory confirmation remains pending',()=>fixture(async(_home,options)=>{
 options.runner=async()=>({code:0,stdout:JSON.stringify({installed:[]})});
 const result=await installSetupPlugins('https://selfhost.example',['codex'],options);
 expect(result.results[0]?.status).toBe('pending');
 expect(result.humanTasks.some(task=>task.kind==='plugin_install')).toBe(true);
 expect(result.humanTasks.some(task=>task.kind==='mcp_auth')).toBe(false);
}));


test('changing deployments reuses each managed native source and confirms the selected endpoint',()=>fixture(async(_home,options,calls)=>{
 const a=await installSetupPlugins('https://endpoint-a.example',['codex','claude-code'],options);
 const b=await installSetupPlugins('https://endpoint-b.example',['codex','claude-code'],options);
 expect(a.results.every(row=>row.status==='installed')).toBe(true);expect(b.results.every(row=>row.status==='installed')).toBe(true);
 expect(b.results.map(row=>row.directory)).toEqual(a.results.map(row=>row.directory));
 for(const client of ['codex','claude'])expect(new Set(calls.filter(call=>call[0]==='/client/'+client&&call[2]==='marketplace').map(call=>call[4])).size).toBe(1);
 expect((await installSetupPlugins('https://endpoint-b.example',['codex','claude-code'],options)).results.map(row=>row.status)).toEqual(['unchanged','unchanged']);
}));
test('native success with a stale endpoint or foreign source cannot be reported installed',()=>fixture(async(home,options)=>{
 const native=options.runner!;
 options.runner=async(command,args,env)=>{
  const result=await native(command,args,env);
  if(args[1]==='list'){
   const inventory=JSON.parse(result.stdout!);for(const row of inventory.installed){row.source.path=join(home,'foreign-source');row.mcpServers.opencrawl.url='https://stale.example/mcp';}
   return {...result,stdout:JSON.stringify(inventory)};
  }
  return result;
 };
 const result=await installSetupPlugins('https://selfhost.example',['codex','claude-code'],options);
 expect(result.results.map(row=>row.status)).toEqual(['pending','pending']);expect(result.humanTasks.some(task=>task.kind==='mcp_auth')).toBe(false);
}));
test('Codex native cache must match the endpoint even when its source points at the right bundle',()=>fixture(async(home,options)=>{
 const native=options.runner!;
 options.runner=async(command,args,env)=>{
  const result=await native(command,args,env);
  if(args[1]==='add')writeFileSync(join(home,'cache/codex/mcp.json'),JSON.stringify({mcpServers:{opencrawl:{url:'https://stale.example/mcp'}}}));
  return result;
 };
 const result=await installSetupPlugins('https://selfhost.example',['codex'],options);
 expect(result.results[0]?.status).toBe('pending');expect(result.humanTasks.some(task=>task.kind==='mcp_auth')).toBe(false);
 expect(existsSync(join(home,'config/opencrawl/setup-plugins/codex/installed.json'))).toBe(false);
}));
