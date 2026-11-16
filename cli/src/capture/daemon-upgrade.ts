import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {atomicJson,withSessionLock} from '../session.ts';
import {captureDir,readCaptureConfig,captureDaemonEnabled,type CaptureConfig} from './runtime.ts';
import {installCaptureDaemon} from './daemon-service.ts';

type Installer=(config:CaptureConfig)=>Promise<{supervised:boolean}>;
export type DaemonUpgradeResult={state:'not-selected'|'already-enabled'|'legacy-pending'|'busy'|'activated'|'supervision-required'};

/** Upgrade existing consent, never create it. The caller runs this outside
 * native hooks. Existing legacy work must finish before ingress changes; no
 * historical catalogue or transcript is opened by this migration. */
export async function upgradeCaptureDaemon({install=installCaptureDaemon}: {install?:Installer}={}):Promise<DaemonUpgradeResult> {
  const before=readCaptureConfig();
  if(!before||before.disabled||before.authPending||!before.harnesses?.length)return {state:'not-selected'};
  // Setup owns plugin activation and its consent boundaries. This migration is
  // only the existing global-hook installation's execution-mode transition.
  if(before.hookOwnership==='plugin')return {state:'not-selected'};
  try{return await withSessionLock('capture:worker',async()=>{
    const completed=join(captureDir(),'daemon','upgrade.json');
    const prepared=await withSessionLock('capture:configuration',async():Promise<DaemonUpgradeResult|CaptureConfig>=>{
      if(!isDeepStrictEqual(readCaptureConfig(),before))return {state:'busy'};
      if(captureDaemonEnabled(before)&&existsSync(completed)){
        const receipt=JSON.parse(readFileSync(completed,'utf8'));
        if(isDeepStrictEqual(receipt.config,before)&&receipt.supervised===true)return {state:'already-enabled'};
      }
      const pending=join(captureDir(),'notices');
      if(existsSync(pending)&&readdirSync(pending).some(name=>name.endsWith('.json')))return {state:'legacy-pending'};
      const next:CaptureConfig={...before,captureWorker:'daemon-v1'};
      atomicJson(join(captureDir(),'config.json'),next);
      return next;
    },0);
    if('state' in prepared)return prepared;
    // Never hold the configuration lock during slow OS service operations.
    // If installation fails, keep daemon mode: a hook may already have
    // accepted an inbox notice. No completion receipt means the next attempt
    // retries supervision without discarding that notice or reverting ingress.
    const service=await install(prepared);
    if(!isDeepStrictEqual(readCaptureConfig(),prepared))return {state:'busy'};
    if(service.supervised)atomicJson(completed,{config:prepared,supervised:true});
    return {state:service.supervised?'activated':'supervision-required'};
  },0);}catch(error){
    if(error&&typeof error==='object'&&'code' in error&&error.code==='SESSION_BUSY')return {state:'busy'};
    throw error;
  }
}
