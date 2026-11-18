import {expect,test} from 'bun:test';
import {nativeLogin} from '../src/setup/native-login.ts';
import {fileURLToPath} from 'node:url';

test.skipIf(process.platform==='win32')('native login receives a real terminal while output remains in the TUI',async()=>{
 const frames:string[]=[];
 const code=await nativeLogin(process.execPath,['-e',"console.log(JSON.stringify([process.stdin.isTTY,process.stdout.isTTY,process.stderr.isTTY]));process.exit(process.stdin.isTTY&&process.stdout.isTTY&&process.stderr.isTTY?0:1)"],{signal:new AbortController().signal,progress:(_title,_description,details)=>frames.push((details??[]).join('\n')),native:async()=>{throw Error('Unexpected terminal handoff');}});
 expect(code).toBe(0);expect(frames.join('\n')).toContain('[true,true,true]');
});

test.skipIf(process.platform==='win32')('cancelling native login terminates its child and stops progress updates',async()=>{
 const controller=new AbortController();let frames=0;
 const code=await nativeLogin(process.execPath,['-e',"console.log('waiting');setInterval(()=>console.log('still waiting'),50)"],{signal:controller.signal,progress:()=>{frames++;controller.abort();},native:async()=>{throw Error('Unexpected terminal handoff');}});
 expect(code).not.toBe(0);expect(frames).toBe(1);
});

test.skipIf(process.platform==='win32')('native handoff receives keystrokes and restores the setup TUI',async()=>{
 const module=fileURLToPath(new URL('../src/setup/tui.tsx',import.meta.url));
 const terminalModule=fileURLToPath(new URL('../src/setup/native-terminal.ts',import.meta.url));
 const nativeScript="process.stdin.setRawMode(true);process.stdin.resume();console.log('NATIVE_READY');process.stdin.once('data',data=>{console.log('NATIVE_KEY:'+data.toString());process.exit(data.toString()==='x'?0:1);});";
 const script=`import {createSetupUi} from ${JSON.stringify(module)};import {nativeTerminal} from ${JSON.stringify(terminalModule)};const ui=createSetupUi();try{ui.progress('Before native','Starting');await Bun.sleep(50);const code=await ui.native(()=>nativeTerminal(process.execPath,['-e',${JSON.stringify(nativeScript)}]));if(code!==0)throw Error('Native input failed');await ui.action({title:'Returned to setup',description:'Native input worked',actions:[{id:'done',label:'Done'}]});}finally{ui.close();}`;
 let output='',sent=false,finished=false;
 const child=Bun.spawn([process.execPath,'-e',script],{terminal:{cols:80,rows:24,data(terminal,data){output+=new TextDecoder().decode(data);if(!sent&&output.includes('NATIVE_READY')){sent=true;terminal.write('x');}if(!finished&&output.includes('Returned to setup')){finished=true;setTimeout(()=>terminal.write('\r'),50);}}}});
 const timeout=setTimeout(()=>child.kill('SIGKILL'),4000);
 try{const code=await child.exited;if(code!==0)console.error(output);expect(code).toBe(0);expect(output).toContain('NATIVE_KEY:x');expect(finished).toBe(true);}
 finally{clearTimeout(timeout);child.terminal?.close();}
},5000);
