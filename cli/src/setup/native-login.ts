import {spawn} from 'node:child_process';
import type {SetupUi} from './tui.tsx';

/** Native OAuth clients require a real terminal even when browser approval needs no input. */
export async function nativeLogin(command:string,args:string[],ui:Pick<SetupUi,'signal'|'progress'|'native'>,title='Connect Claude Code'){
 ui.signal.throwIfAborted();
 // This Bun runtime's PTY is POSIX-only. Preserve the native terminal on Windows.
 if(process.platform==='win32')return ui.native(()=>new Promise<number>((resolve,reject)=>{
  const child=spawn(command,args,{stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',code=>resolve(code??1));
 }));
 let output='';const decoder=new TextDecoder();
 const child=Bun.spawn([command,...args],{env:process.env,terminal:{cols:process.stderr.columns||80,rows:process.stderr.rows||24,data(_terminal,data){
  output=(output+decoder.decode(data,{stream:true})).slice(-8000);
  if(!ui.signal.aborted)ui.progress(title,'Approve access in your browser. Setup continues automatically.',output.trim().split('\n').slice(-10));
 }}});
 const cancel=()=>child.kill('SIGTERM');
 ui.signal.addEventListener('abort',cancel,{once:true});
 try{if(ui.signal.aborted)cancel();return await child.exited;}
 finally{ui.signal.removeEventListener('abort',cancel);child.terminal?.close();}
}
