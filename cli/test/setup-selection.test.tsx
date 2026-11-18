import {test,expect} from 'bun:test';
import {render} from 'ink-testing-library';
import {SetupSelection} from '../src/setup/select-view.tsx';
import {chooseSetupItems,type SelectionItem,type SelectionScreen} from '../src/setup/select.ts';
const screen:SelectionScreen={phase:1,title:'Record new sessions',description:'Connect and record selected agents.',noneLabel:'Do not record any sessions on this machine',items:[{id:'claude-code',label:'Claude Code',detail:'Detected',selected:true},{id:'codex',label:'Codex',detail:'Detected',selected:true},{id:'antigravity',label:'Antigravity',detail:'Not detected',disabled:true,selected:false},{id:'cursor',label:'Cursor',detail:'Detected',selected:false}]};
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const down='\u001b[B',up='\u001b[A',right='\u001b[C',enter='\r';
test('arrow navigation, Space checkboxes, exclusive opt-out and Enter on the focused button',async()=>{
 let answer:SelectionItem[]|null|undefined;const app=render(<SetupSelection screen={screen} onComplete={value=>{answer=value;}}/>);
 try{
  await tick();expect(app.lastFrame()).toContain('› [x] Claude Code');
  app.stdin.write(' ');await tick();expect(app.lastFrame()).toContain('› [ ] Claude Code');expect(answer).toBeUndefined();
  app.stdin.write(down);await tick();expect(app.lastFrame()).toContain('› [x] Codex');
  app.stdin.write(down);await tick();expect(app.lastFrame()).toContain('› [ ] Cursor'); // Undetected rows stay visible but cannot be checked.
  app.stdin.write(down);await tick();app.stdin.write(' ');await tick();expect(app.lastFrame()).toContain('› [x] Do not record');
  expect(app.lastFrame()).toContain('[ ] Codex');
  app.stdin.write(down);await tick();expect(app.lastFrame()).toContain('› [ Continue ]');expect(answer).toBeUndefined();
  app.stdin.write(right);await tick();expect(app.lastFrame()).toContain('› [ Cancel ]');
  app.stdin.write(up);await tick();expect(app.lastFrame()).toContain('› [x] Do not record');
  app.stdin.write(down);await tick();app.stdin.write(enter);await tick();
  expect(answer?.every(item=>!item.selected)).toBe(true);
 }finally{app.unmount();}
});
test('history starts unchecked and only Enter on its button commits',async()=>{
 let answer:SelectionItem[]|null|undefined;const history:SelectionScreen={...screen,phase:2,title:'Import past sessions',noneLabel:'Skip history import',items:[{id:'codex',label:'Codex',selected:false,detail:'3 files'}]};
 const app=render(<SetupSelection screen={history} onComplete={value=>{answer=value;}}/>);
 try{
  await tick();app.stdin.write(enter);await tick();expect(answer).toBeUndefined();
  app.stdin.write(' ');await tick();expect(app.lastFrame()).toContain('› [x] Codex');
  app.stdin.write(down);await tick();app.stdin.write(down);await tick();expect(app.lastFrame()).toContain('› [ Import history ]');
  app.stdin.write(enter);await tick();expect(answer?.[0].selected).toBe(true);
 }finally{app.unmount();}
});
test('Cancel and Ctrl+C return no approval',async()=>{
 for(const cancel of ['button','interrupt']){
  let answer:SelectionItem[]|null|undefined;const app=render(<SetupSelection screen={screen} onComplete={value=>{answer=value;}}/>);
  try{await tick();if(cancel==='button'){for(let i=0;i<4;i++){app.stdin.write(down);await tick();}app.stdin.write(right);await tick();app.stdin.write(enter);}else app.stdin.write('\u0003');await tick();expect(answer).toBeNull();}finally{app.unmount();}
 }
});
test('empty history does not open another interactive screen',async()=>{
 expect(await chooseSetupItems({...screen,phase:2,items:[],emptyMessage:'No history found.'})).toEqual([]);
});
