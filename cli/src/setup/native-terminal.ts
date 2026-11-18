import {spawn} from 'node:child_process';

/** Forward native interactive input after Ink has suspended its terminal ownership. */
export async function nativeTerminal(command:string,args:string[]){
 if(process.platform==='win32')return new Promise<number>((resolve,reject)=>{
  const child=spawn(command,args,{stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',code=>resolve(code??1));
 });
 const child=Bun.spawn([command,...args],{env:process.env,terminal:{cols:process.stderr.columns||80,rows:process.stderr.rows||24,data(_terminal,data){process.stderr.write(data);}}});
 const raw=process.stdin.isRaw;
 const input=(data:Buffer|string)=>child.terminal?.write(data);
 const resize=()=>child.terminal?.resize(process.stderr.columns||80,process.stderr.rows||24);
 process.stdin.setRawMode(true);process.stdin.on('data',input);process.stdin.resume();process.stderr.on('resize',resize);
 try{return await child.exited;}
 finally{process.stdin.off('data',input);process.stdin.pause();process.stdin.setRawMode(raw);process.stderr.off('resize',resize);child.terminal?.close();}
}
