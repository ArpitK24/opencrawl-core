import {setTimeout as delay} from 'node:timers/promises';
import {CliError,apiOrigin,DEFAULT_API_ORIGIN} from '../oauth.ts';
import {filesystemError} from '../filesystem.ts';
import {setupCommand} from './command.ts';
import {launchClaudeSetup} from './claude-launch.ts';
import {launchCodexSetup} from './codex-launch.ts';
import {launchAntigravitySetup} from './antigravity-launch.ts';
import type {SetupUi} from './tui.tsx';
import {nativeLogin} from './native-login.ts';
import {nativeTerminal} from './native-terminal.ts';
import {inspectCodexHooks,type CodexHookReview} from '../capture/codex-hooks.ts';
import {readCaptureConfig} from '../capture/runtime.ts';

type Options={values:Record<string,unknown>;readDestination:()=>{api?:string;explicit?:string};withOrigin:(api:string|undefined,run:()=>Promise<number>)=>Promise<number>;login:(api:string,ui:SetupUi)=>Promise<unknown>};
type Dependencies={createUi?:()=>SetupUi;setup?:typeof setupCommand;which?:(name:string)=>string|null;native?:(command:string,args:string[],ui:SetupUi,title?:string)=>Promise<number>;inspectCodex?:()=>Promise<CodexHookReview>;pause?:(signal:AbortSignal)=>Promise<void>};

async function currentCodexReview():Promise<CodexHookReview>{
 const root=readCaptureConfig()?.roots.codex;
 return root?inspectCodexHooks(root):{state:'unknown',total:0,pending:null,disabled:null};
}

async function nativeCommand(command:string,args:string[],ui:SetupUi,title?:string):Promise<number>{
 if(args[0]!=='mcp')return ui.native(()=>nativeTerminal(command,args));
 return nativeLogin(command,args,ui,title);
}

/** This entry point is exclusive to bare, interactive setup. Machine commands keep their contracts. */
export async function runInteractiveSetup(options:Options,{createUi,setup=setupCommand,which=Bun.which,native=nativeCommand,inspectCodex=currentCodexReview,pause=async signal=>{await delay(3000,undefined,{signal});}}:Dependencies={}){
 const ui=createUi?createUi():(await import('./tui.tsx')).createSetupUi();
 let destination:ReturnType<Options['readDestination']>|undefined;
 try{
  if(!await ui.welcome())return 0;
  for(;;){
   try{
    destination??=options.readDestination();
    while(!destination.api){
     const hosting=await ui.hosting();
     if(hosting===null)return 0;
     if(hosting==='cloud'){destination={api:DEFAULT_API_ORIGIN,explicit:DEFAULT_API_ORIGIN};break;}
     const answer=await ui.workspace();
     if(answer===null)return 0;
     if(answer.kind==='back')continue;
     destination={api:answer.api,explicit:answer.api};
    }
    const api=apiOrigin(destination.api??''),explicit=destination.explicit;
    destination={api,explicit};
    ui.progress('Connecting to your workspace','Checking your sign-in and available agents.',[api]);
    return await options.withOrigin(explicit,async()=>{
     let result=await setup('run',api,options.values,{interactive:true,choose:ui.choose,onProgress:(title,description,phase)=>ui.progress(title,description,undefined,phase==='installing'),login:()=>options.login(api,ui)});
     if(ui.signal.aborted)return 130;
     if(!result||'status' in result&&result.status==='cancelled')return 0;
     if('status' in result&&result.status==='recording_off'){
      await ui.action({title:'Setup saved',description:'No sessions will be recorded on this machine. No history import was started.',actions:[{id:'done',label:'Done'}]});return 0;
     }
     if('nextAction' in result&&result.nextAction?.kind==='plugin_unavailable'){await ui.action({title:'Capture is not available yet',description:'This plugin version cannot record sessions yet. Your choices are saved.',actions:[{id:'close',label:'Close'}]});return 2;}
     const handoff='client' in result&&['claude-code','codex','antigravity'].includes(result.client)&&'agentPrompt' in result&&typeof result.agentPrompt==='string'?{client:result.client,prompt:result.agentPrompt,needsLogin:'nativeMcpLoginRequired' in result&&result.nativeMcpLoginRequired===true}:undefined;
     const history='history' in result?result.history:undefined;
     let reconciled=false,launched=false;
     for(;;){
      const kind='nextAction' in result?result.nextAction?.kind:undefined;
      if(!launched&&handoff&&kind!=='repair_worker'&&(handoff.client!=='antigravity'||kind==='native_tool')){
       launched=true;
       if(handoff.client==='antigravity'){
        const agy=which('agy');
        if(!agy){
         await ui.action({title:'Open Antigravity',description:'Setup saved your choices. Install the agy command and run setup again to open Antigravity here.',actions:[{id:'close',label:'Close'}]});
         return 2;
        }
        const code=await launchAntigravitySetup(agy,api,handoff.prompt,handoff.needsLogin,ui,(command,args)=>native(command,args,ui));
        if(code!==0||ui.signal.aborted)return code||130;
       }else{
        const codex=handoff.client==='codex',label=codex?'Codex':'Claude Code',executable=which(codex?'codex':'claude');
        if(executable){
         if(codex)for(;;){
          const review=await inspectCodex();
          if(review.state==='observed'&&review.total>0&&review.pending===0&&review.disabled===0)break;
          const choice=await ui.action({title:'Review Codex hooks',description:review.disabled?'Some OpenCrawl hooks are disabled. Keep intentional opt-outs, or review the hooks needed for recording.':'Codex needs your approval before OpenCrawl can record sessions.',details:['Review the OpenCrawl hooks in Codex. Then enter /quit to return here.','Setup will reopen Codex with your saved task after approval.'],actions:[{id:'review',label:'Open Codex'},{id:'close',label:'Close'}]});
          if(choice!=='review')return 2;
          if(await native(executable,[],ui)!==0)return 2;
          if(ui.signal.aborted)return 130;
         }
         const launch=codex?launchCodexSetup:launchClaudeSetup;
         const code=await launch(executable,{api,prompt:handoff.prompt,needsLogin:handoff.needsLogin},(command,args)=>native(command,args,ui,'Connect '+label),message=>ui.progress('Continue in '+label,message));
         if(ui.signal.aborted)return 130;
         if(code!==0)throw new CliError('NATIVE_SETUP_PENDING',label+' did not finish its connection. Your choices are saved. Retry when ready.',code);
        }
       }
      }
      ui.progress('Checking setup','Waiting for native connection and session verification.');
      let next=await setup('wait',api,{json:true},{interactive:false});
      if(ui.signal.aborted)return 130;
      if(next&&'nextAction' in next&&next.nextAction?.kind==='repair_worker'){
       const status=await setup('status',api,{json:true},{interactive:false});
       const worker=status&&'worker' in status?status.worker:undefined;
       const action=await ui.action({title:'Background capture needs attention',description:worker?.reason??next.nextAction.instruction,error:true,actions:[{id:'direct',label:'Record without a background service'},{id:'retry',label:'Retry service'},{id:'close',label:'Close'}]});
       if(action!=='retry'&&action!=='direct')return 2;
       ui.progress(action==='direct'?'Keeping session recording':'Starting background capture',action==='direct'?'Removing the background service. Your recording choices and queued uploads are kept.':'Retrying the service with your saved choices.',undefined,true);
       const resumed=await setup('resume',api,{json:true,...(action==='direct'?{'capture-mode':'hook'}:{})},{interactive:false,...(action==='direct'?{confirmedCaptureMode:'hook' as const}:{})});
       if(!resumed)return 2;
       result=resumed;
       continue;
      }
      if(!reconciled&&next&&'nextAction' in next&&next.nextAction?.kind==='reconcile_activation'){
       reconciled=true;
       ui.progress('Finishing setup','Saving the verified native installation.');
       await setup('resume',api,{json:true},{interactive:false});
       next=await setup('wait',api,{json:true},{interactive:false});
      }
      if(ui.signal.aborted)return 130;
      if(next&&'nextAction' in next&&next.nextAction?.kind==='complete'){
       await ui.action({title:'Setup complete',description:'Your selected agents are connected and verified.',details:['New-session recording is ready.',...(history&&typeof history==='object'&&'state' in history&&['queued','running'].includes(history.state)?['Past sessions are importing in the background.']:[])],actions:[{id:'done',label:'Done'}]});return 0;
      }
      if(next&&'nextAction' in next&&next.nextAction?.kind==='plugin_unavailable'){await ui.action({title:'Capture is not available yet',description:'This plugin version cannot record sessions yet. Your choices are saved.',actions:[{id:'close',label:'Close'}]});return 2;}
      if(handoff?.client==='antigravity'&&next&&'nextAction' in next&&next.nextAction?.kind==='native_tool'){
       const choice=await ui.action({title:'Antigravity verification is pending',description:'Return to Antigravity to finish the saved task, or review its workspace connection.',actions:[{id:'verify',label:'Resume task'},{id:'connect',label:'Review connection'},{id:'close',label:'Close'}]});
       if(choice!=='verify'&&choice!=='connect')return 2;
       handoff.needsLogin=choice==='connect';
       result=next;
       launched=false;
       continue;
      }
      const status=await setup('status',api,{json:true},{interactive:false});
      const tasks=status&&'humanTasks' in status?status.humanTasks:[];
      const task=tasks?.[0];
      ui.progress('Finish connecting your agents','Your choices are saved. Setup will continue automatically.',task?[task.title,task.instruction]:['Open your selected agents to load OpenCrawl and finish their native connection.']);
      await pause(ui.signal);
     }
    });
   }catch(error){
    if(ui.signal.aborted)return 130;
    const failure=filesystemError(error),known=failure instanceof CliError;
    const action=await ui.action({title:'Setup needs attention',description:known?failure.message:'Setup could not finish. Your saved choices are kept. Retry when ready.',error:true,actions:[{id:'retry',label:'Retry'},{id:'address',label:'Change workspace'},{id:'close',label:'Close'}]});
    if(action==='address'){destination={};continue;}
    if(action!=='retry')return known?failure.exitCode:1;
   }
  }
 }finally{ui.close();}
}
