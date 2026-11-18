import {spawn} from 'node:child_process';
import {setupPluginIdentity} from './plugins.ts';

type Run = (command:string,args:string[])=>Promise<number>;
const run:Run=(command,args)=>new Promise((resolve,reject)=>{
 const child=spawn(command,args,{stdio:'inherit',env:process.env});
 child.once('error',reject);child.once('exit',code=>resolve(code??1));
});

/** Native Claude owns its OAuth tokens. The CLI waits for its browser callback. */
export async function launchClaudeSetup(claude:string,{api,prompt,needsLogin}:{api:string;prompt:string;needsLogin:boolean},execute:Run=run,notify:(message:string)=>void=message=>console.error(message)){
 if(needsLogin){
  notify('Connect Claude Code: approve access in the browser. Setup continues automatically.');
  const code=await execute(claude,['mcp','login',`plugin:${setupPluginIdentity(api).name}:opencrawl`]);
  if(code!==0)return code;
 }
 notify('Opening Claude Code to verify setup. Your choices are saved.');
 return execute(claude,[prompt]);
}
