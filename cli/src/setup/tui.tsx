import {render,useApp,type Instance} from 'ink';
import {useEffect,type ReactElement} from 'react';
import {stripVTControlCharacters} from 'node:util';
import {HostingScreen,WorkspaceScreen,NoticeScreen,type Notice,type Hosting,type WorkspaceAnswer} from './tui-view.tsx';
import {SetupSelection} from './select-view.tsx';
import type {SelectionScreen,SelectionItem} from './select.ts';

const clean=(text:string)=>stripVTControlCharacters(text).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'');
function NativeHandoff<T,>({run,resolve,reject}:{run:()=>Promise<T>;resolve:(result:T)=>void;reject:(error:unknown)=>void}){
 const {suspendTerminal}=useApp();
 useEffect(()=>{void (async()=>{let result:T|undefined;await suspendTerminal(async()=>{process.stdin.pause();result=await run();});resolve(result as T);})().catch(reject);},[run,resolve,reject,suspendTerminal]);
 return null;
}
/** One alternate-screen owner for human onboarding. No global stdout interception. */
export function createSetupUi(){
 let app:Instance|undefined,serial=0;
 const controller=new AbortController();
 const show=(node:ReactElement)=>{
  const element=<>{node}</>;
  if(app)app.rerender(element);
  else app=render(element,{stdout:process.stderr,stdin:process.stdin,stderr:process.stderr,patchConsole:false,exitOnCtrlC:false,alternateScreen:true,interactive:Boolean(process.stdin.isTTY&&process.stderr.isTTY)});
 };
 const notice=(props:Notice)=>show(<NoticeScreen key={++serial} {...props} description={clean(props.description)} details={props.details?.map(clean)}/>);
 const progress=(title:string,description:string,details?:string[],animate=false)=>{
  controller.signal.throwIfAborted();
  notice({title,description,details,animate,onCancel:()=>{controller.abort();notice({title:'Stopping setup',description:'Finishing the current step. Your saved choices will be kept.'});}});
 };
 const close=()=>{app?.unmount();app?.cleanup();app=undefined;};
 return {
  signal:controller.signal,progress,close,
  hosting:()=>new Promise<Hosting|null>(resolve=>show(<HostingScreen key={++serial} onComplete={resolve}/>)),
  workspace:()=>new Promise<WorkspaceAnswer>(resolve=>show(<WorkspaceScreen key={++serial} onComplete={resolve}/>)),
  choose:async(screen:SelectionScreen):Promise<SelectionItem[]|null>=>{
   controller.signal.throwIfAborted();
   if(!screen.items.length)return [];
   return new Promise(resolve=>show(<SetupSelection key={++serial} screen={screen} standalone={false} onComplete={resolve}/>));
  },
  action:(props:Omit<Notice,'onAction'|'onCancel'>)=>new Promise<string|null>(resolve=>notice({...props,onAction:resolve})),
  native:async<T,>(run:()=>Promise<T>)=>{
   try{return await new Promise<T>((resolve,reject)=>show(<NativeHandoff key={++serial} run={run} resolve={resolve} reject={reject}/>));}
   finally{progress('Checking setup','Checking the saved installation and native verification.');}
  },
 };
}
export type SetupUi=ReturnType<typeof createSetupUi>;
