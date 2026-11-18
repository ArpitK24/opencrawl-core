import {expect} from 'bun:test';
import {stripVTControlCharacters} from 'node:util';
import {render} from 'ink-testing-library';
import {act,type ReactElement} from 'react';

type Screen = ReturnType<typeof render>;

// Focus registration and the text input's subscription both run in React effects.
// Flush the initial commit before the fake terminal sends its first key.
export async function renderReady(element:ReactElement):Promise<Screen> {
 const environment=globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean};
 const previous=environment.IS_REACT_ACT_ENVIRONMENT;
 let screen!:Screen;
 try{
  environment.IS_REACT_ACT_ENVIRONMENT=true;
  await act(async()=>{screen=render(element);});
  return screen;
 }finally{
  if(previous===undefined)delete environment.IS_REACT_ACT_ENVIRONMENT;
  else environment.IS_REACT_ACT_ENVIRONMENT=previous;
 }
}

export async function waitForFrame(screen:Screen, text:string) {
 const frame=()=>stripVTControlCharacters(screen.lastFrame()??'');
 const deadline=Date.now()+2000;
 while(!frame().includes(text)&&Date.now()<deadline) await Bun.sleep(10);
 expect(frame()).toContain(text);
}

export async function pressAndRead(screen:Screen, key:string, text:string) {
 screen.stdin.write(key);
 await waitForFrame(screen,text);
}
