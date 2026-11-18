import {expect} from 'bun:test';
import {stripVTControlCharacters} from 'node:util';
import type {render} from 'ink-testing-library';

type Screen = ReturnType<typeof render>;

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
