import {test,expect} from 'bun:test';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {reconcileCursorNativeHooks} from '../src/setup/cursor-native-hooks.ts';
import {profileSetupCommand} from '../src/setup/invocation.ts';
const definition=JSON.stringify({version:1,hooks:{sessionStart:[{command:'/bin/sh "$CURSOR_PLUGIN_ROOT/scripts/opencrawl-hook.sh" session start --harness cursor',timeout:7}],afterAgentResponse:[{command:'/bin/sh "$CURSOR_PLUGIN_ROOT/scripts/opencrawl-hook.sh" collect hook --harness cursor',timeout:30}]}});
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
async function fixture(run:(root:string)=>Promise<void>){const root=mkdtempSync(join(tmpdir(),'cursor-native-'));try{await run(root);}finally{rmSync(root,{recursive:true,force:true});}}
test.skipIf(process.platform==='win32')('native hooks reconcile retries, two deployments and removal without changing foreign configuration',()=>fixture(async root=>{
 const file=join(root,'hooks.json'),receipt=join(root,'a.json'),directory=join(root,"plugins/a's plugin");
 const foreign={command:'other-tool',timeout:42};writeFileSync(file,JSON.stringify({version:1,custom:'keep',hooks:{sessionStart:[foreign]}}));
 await reconcileCursorNativeHooks(root,directory,receipt,definition);
 const first=read(file);expect(first.custom).toBe('keep');expect(first.hooks.sessionStart[0]).toEqual(foreign);expect(first.hooks.sessionStart[1].command).toContain("a'\\''s plugin");
 await reconcileCursorNativeHooks(root,directory,receipt,definition);expect(read(file)).toEqual(first);
 const other=join(root,'b.json');await reconcileCursorNativeHooks(root,join(root,'plugins/b'),other,definition);
 expect(read(file).hooks.sessionStart).toHaveLength(3);
 await reconcileCursorNativeHooks(root,directory,receipt);
 expect(read(file).hooks.sessionStart).toHaveLength(2);expect(read(file).hooks.sessionStart[0]).toEqual(foreign);
 await reconcileCursorNativeHooks(root,join(root,'plugins/b'),other);
 expect(read(file)).toEqual({version:1,custom:'keep',hooks:{sessionStart:[foreign]}});
}));
test.skipIf(process.platform==='win32')('disabled hooks and malformed or symlink files are preserved',()=>fixture(async root=>{
 const file=join(root,'hooks.json'),receipt=join(root,'owned.json'),directory=join(root,'plugin');
 await reconcileCursorNativeHooks(root,directory,receipt,definition);
 const state=read(file);state.hooks.sessionStart[0].enabled=false;writeFileSync(file,JSON.stringify(state));
 const before=readFileSync(file,'utf8');await expect(reconcileCursorNativeHooks(root,directory,receipt,definition)).rejects.toThrow('explicitly disabled');expect(readFileSync(file,'utf8')).toBe(before);
 writeFileSync(file,'not json');await expect(reconcileCursorNativeHooks(root,directory,receipt,definition)).rejects.toThrow();expect(readFileSync(file,'utf8')).toBe('not json');
 rmSync(file);symlinkSync(receipt,file);await expect(reconcileCursorNativeHooks(root,directory,receipt,definition)).rejects.toThrow('ordinary file');
}));
test.skipIf(process.platform==='win32')('profile launcher survives different ambient config, data and cache without copying secrets',()=>fixture(async root=>{
 const executable=join(root,'print.sh');writeFileSync(executable,'#!/bin/sh\nprintf "%s\\n" "$OPENCRAWL_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$1"\n');
 const config=join(root,"profile ' $ space"),env={XDG_DATA_HOME:join(root,'data'),XDG_CACHE_HOME:join(root,'cache'),OPENCRAWL_TOKEN:'not-for-files'};
 const command=profileSetupCommand(['/bin/sh',executable],config,env,true);
 const result=spawnSync(command[0]!,[...command.slice(1),'hello'],{encoding:'utf8',env:{PATH:process.env.PATH,OPENCRAWL_CONFIG_HOME:'/wrong',XDG_DATA_HOME:'/wrong',XDG_CACHE_HOME:'/wrong'}});
 expect(result.status).toBe(0);expect(result.stdout.trim().split('\n')).toEqual([config,env.XDG_DATA_HOME,env.XDG_CACHE_HOME,'hello']);
 expect(readFileSync(command[1]!,'utf8')).not.toContain('not-for-files');
 writeFileSync(command[1]!,'custom');expect(()=>profileSetupCommand(['/bin/sh',executable],config,env,true)).toThrow('modified');expect(readFileSync(command[1]!,'utf8')).toBe('custom');
}));
