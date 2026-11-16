/** Explicit acceptance probe: installs only a disposable, profile-bound OS
 * service. No native client settings, credentials, or production endpoint. */
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync,createReadStream} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {installCaptureDaemon,uninstallCaptureDaemon} from '../src/capture/daemon-service.ts';
import {captureDir,type CaptureConfig} from '../src/capture/runtime.ts';
import {atomicJson,withSessionLock} from '../src/session.ts';

const evidence=process.argv[2];if(!evidence)throw Error('Supply an evidence directory');mkdirSync(evidence,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'opencrawl-supervisor-proof-')),before={...process.env},native=process.argv[3];
const receipt:any={platform:process.platform,execution:native?'compiled-native':'source',startedAt:new Date().toISOString(),passed:false};
let pid:number|undefined,installed=false,serviceRemoved=false,workerStopped=false;
const alive=(id:number)=>{try{process.kill(id,0);return true;}catch{return false;}};
const wait=async(check:()=>boolean,ms:number)=>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw Error('Supervisor did not reach the expected state before the deadline');await Bun.sleep(100);}};
const home=process.platform==='darwin'?directory:homedir();
try{
  Object.assign(process.env,{OPENCRAWL_CONFIG_HOME:join(directory,'config'),XDG_CACHE_HOME:join(directory,'cache'),XDG_DATA_HOME:join(directory,'data'),OPENCRAWL_NO_UPDATE:'1',OPENCRAWL_TOKEN:'',OPENCRAWL_SESSIONS_TOKEN:'',OPENCRAWL_AUTH:'',OPENCRAWL_API_URL:'http://127.0.0.1:1'});
  const config:CaptureConfig={schemaVersion:1,captureWorker:'daemon-v1',api:'http://127.0.0.1:1',installationId:'supervisor-proof',owner:{tenantId:'fixture',userId:'fixture'},installedAt:new Date().toISOString(),harnesses:['claude-code'],roots:{'claude-code':join(directory,'claude'),codex:join(directory,'codex')},
    command:native?[resolve(native)]:[process.execPath,resolve(import.meta.dir,'../src/cli.ts')]};
  mkdirSync(captureDir(),{recursive:true});atomicJson(join(captureDir(),'config.json'),config);
  installed=true;const service=await installCaptureDaemon(config,{home});receipt.service=service;
  if(!service.supervised)throw Error('No native supervisor available; external lifecycle proof is required');
  const status=()=>{try{return JSON.parse(readFileSync(join(captureDir(),'daemon','status.json'),'utf8'));}catch{return null;}};
  await wait(()=>status()?.state==='running'&&alive(status().pid),20_000);pid=status().pid;receipt.initialPid=pid;
  receipt.worker={executable:status().executable,version:status().version,compiled:status().compiled};
  if(realpathSync(status().executable)!==realpathSync(native?resolve(native):process.execPath))throw Error('Supervisor ran a different executable');
  if(native){
    if(!status().compiled)throw Error('Expected a compiled native worker');
    const manifest=JSON.parse(readFileSync(join(dirname(dirname(resolve(native))),'package.json'),'utf8'));
    if(!/^[a-f0-9]{40}$/.test(manifest.opencrawlRevision??'')||manifest.version!==status().version)throw Error('Packaged worker provenance does not match its running version');
    const digest=createHash('sha256');for await(const chunk of createReadStream(native))digest.update(chunk);
    receipt.worker.sourceRevision=manifest.opencrawlRevision;receipt.worker.sha256=digest.digest('hex');
  }
  const killedAt=performance.now();process.kill(pid!,'SIGKILL');
  await wait(()=>status()?.state==='running'&&status().pid!==pid&&alive(status().pid),90_000);
  pid=status().pid;receipt.restartedPid=pid;receipt.restartMs=performance.now()-killedAt;
  uninstallCaptureDaemon(home);installed=false;serviceRemoved=true;await wait(()=>!alive(pid!),10_000);
  await withSessionLock('capture:daemon',async()=>{},0);workerStopped=true;
  receipt.uninstallStoppedWorker=true;receipt.passed=true;
}catch(error){receipt.error=error instanceof Error?error.message:'Supervisor proof failed';process.exitCode=1;}
finally{
  if(installed)try{uninstallCaptureDaemon(home);serviceRemoved=true;}catch(error){receipt.cleanupError=String(error);process.exitCode=1;}
  if(serviceRemoved)try{
    if(pid)await wait(()=>!alive(pid!),10_000);
    await withSessionLock('capture:daemon',async()=>{},0);workerStopped=true;
  }catch{workerStopped=false;receipt.cleanupWorkerUnconfirmed=true;process.exitCode=1;}
  // No PID is not proof of no process. The supervisor must be removed and the
  // kernel singleton released before this profile can be safely discarded.
  if(serviceRemoved&&workerStopped)rmSync(directory,{recursive:true,force:true});else receipt.retainedProfile=directory;
  for(const name of Object.keys(process.env))if(!(name in before))delete process.env[name];Object.assign(process.env,before);
  if(!serviceRemoved||!workerStopped||receipt.cleanupError||receipt.cleanupWorkerUnconfirmed)receipt.passed=false;
  receipt.finishedAt=new Date().toISOString();writeFileSync(join(evidence,'supervisor-'+process.platform+'.json'),JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify(receipt)+'\n');
}
