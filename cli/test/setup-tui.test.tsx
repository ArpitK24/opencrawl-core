import {test,expect} from 'bun:test';
import {render} from 'ink-testing-library';
import {pressAndRead} from './setup-ink.ts';
import {HostingScreen,WorkspaceScreen,NoticeScreen,type Hosting,type WorkspaceAnswer} from '../src/setup/tui-view.tsx';

const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const down='\u001b[B',up='\u001b[A',right='\u001b[C',enter='\r';
test('setup hints span the bottom row and wrap as whole shortcuts on resize',async()=>{
 const app=render(<HostingScreen onComplete={()=>{}}/>);
 try{
  await tick();
  const resize=async(columns:number)=>{
   Object.defineProperties(app.stdout,{columns:{configurable:true,value:columns},rows:{configurable:true,value:24}});
   app.stdout.emit('resize');await tick();
   return app.lastFrame()!.split('\n');
  };
  const wide=await resize(90),line=wide[22]!;
  expect(line.slice(2,10)).toBe('↑ ↓ Move');
  expect(line.trimEnd().length).toBe(88);
  expect(line.indexOf('Enter Select')).toBeGreaterThan(30);
  expect(line.trimEnd().endsWith('Esc Cancel')).toBe(true);
  const narrow=await resize(28);
  expect(narrow[21]).toContain('↑ ↓ Move');
  expect(narrow[21]).toContain('Enter Select');
  expect(narrow[22]).toContain('Esc Cancel');
  app.rerender(<NoticeScreen title="Installing" description="Installing the plugin." onCancel={()=>{}}/>);
  await tick();expect(app.lastFrame()!.split('\n')[22]).toBe(' '.repeat(16)+'Esc Cancel');
 }finally{app.unmount();}
});
test('hosting is a single choice selected with arrows and Enter, with cancellation',async()=>{
 for(const choice of ['cloud','self-hosted',null] as const){
  let answer:Hosting|null|undefined;const app=render(<HostingScreen onComplete={value=>{answer=value;}}/>);
  try{
   await tick();app.stdin.write(' ');await tick();expect(answer).toBeUndefined();
   if(choice==='self-hosted'){app.stdin.write(down);await tick();}
   app.stdin.write(choice===null?'\u001b':enter);await tick();expect(answer).toBe(choice);
  }finally{app.unmount();}
 }
});
test('workspace entry pastes and edits an origin, validates in place, then submits',async()=>{
 let answer:WorkspaceAnswer|undefined;
 const app=render(<WorkspaceScreen onComplete={value=>{answer=value;}}/>);
 try{
  await tick();const address='https://example.test/setup';
  await pressAndRead(app,address,address);
  await pressAndRead(app,enter,'without a path');expect(answer).toBeUndefined();
  for(let length=address.length-1;length>='https://example.test'.length;length--){
   await pressAndRead(app,'\u007f',address.slice(0,length)+' ');
  }
  await pressAndRead(app,down,'› [ Continue ]');
  app.stdin.write(enter);await tick();expect(answer).toEqual({kind:'address',api:'https://example.test'});
 }finally{app.unmount();}
});
test('workspace Back and Escape return to hosting; Ctrl+C cancels without a destination',async()=>{
 for(const method of ['button','escape','interrupt']){
  let answer:WorkspaceAnswer|undefined;const app=render(<WorkspaceScreen onComplete={value=>{answer=value;}}/>);
  try{
   await tick();
   if(method==='button'){
    app.stdin.write(down);await tick();app.stdin.write(right);await tick();expect(app.lastFrame()).toContain('› [ Back ]');
    app.stdin.write(up);await tick();expect(app.lastFrame()).not.toContain('› [ Back ]');
    app.stdin.write(down);await tick();app.stdin.write(right);await tick();app.stdin.write(enter);
   }else app.stdin.write(method==='escape'?'\u001b':'\u0003');
   await tick();expect(answer).toEqual(method==='interrupt'?null:{kind:'back'});
  }finally{app.unmount();}
 }
});
test('waiting screen cancels and error actions use the same arrow and Enter behavior',async()=>{
 let cancelled=false,answer:string|null|undefined;
 const waiting=render(<NoticeScreen title="Sign in" description="Approve in your browser." onCancel={()=>{cancelled=true;}}/>);
 try{await tick();waiting.stdin.write('\u001b');await tick();expect(cancelled).toBe(true);}finally{waiting.unmount();}
 const error=render(<NoticeScreen title="Setup needs attention" description="Try again." actions={[{id:'retry',label:'Retry'},{id:'close',label:'Close'}]} onAction={value=>{answer=value;}}/>);
 try{await tick();error.stdin.write(right);await tick();error.stdin.write(enter);await tick();expect(answer).toBe('close');}finally{error.unmount();}
});
