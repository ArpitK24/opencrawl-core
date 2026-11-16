import {existsSync,readFileSync,readdirSync,mkdirSync,unlinkSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {spawn,spawnSync} from 'node:child_process';
import {atomicJson,syncDirectory,configDir,withSessionLock} from '../session.ts';
import {captureDir,readCaptureConfig,captureDaemonEnabled,captureDaemonHarnesses,recordError,type CaptureConfig} from './runtime.ts';
import {hash} from './parse.ts';

const directory=()=>join(captureDir(),'daemon');
const label=()=>`com.getopencrawl.capture.${hash(configDir()).slice(0,12)}`;
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function launchAgent(config:CaptureConfig) {
  const args=[...config.command,'collect','daemon'];
  const environment:Record<string,string>={OPENCRAWL_CONFIG_HOME:dirname(configDir()),OPENCRAWL_NO_UPDATE:'1'};
  for(const name of ['XDG_CACHE_HOME','XDG_DATA_HOME'])if(process.env[name])environment[name]=process.env[name]!;
  const keepAlive=!config.disabled&&captureDaemonHarnesses(config).length||config.backgroundStartup?'<true/>':'<dict><key>SuccessfulExit</key><false/></dict>';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label()}</string><key>ProgramArguments</key><array>${args.map(arg=>'<string>'+xml(arg)+'</string>').join('')}</array><key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key,value])=>'<key>'+xml(key)+'</key><string>'+xml(value)+'</string>').join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key>${keepAlive}<key>ThrottleInterval</key><integer>10</integer><key>ProcessType</key><string>Background</string></dict></plist>\n`;
}

/** Portable fallback for environments whose supervisor starts the worker or
 * keeps detached children alive. A kernel lock, not a PID file, owns singleton
 * exclusion. Hooks never wait for startup, authentication, or upload. */
export async function ensureCaptureDaemon(config=readCaptureConfig(),{platform=process.platform,launch=spawn}:{platform?:NodeJS.Platform;launch?:typeof spawn}={}) {
  if(!config||!captureDaemonEnabled(config)||config.disabled&&!config.backgroundStartup||!config.command.length)return;
  try{await withSessionLock('capture:daemon',async()=>{},0);}catch(error:any){if(error.code==='SESSION_BUSY')return;throw error;}
  const serviceFile=join(directory(),'service.json');
  if(platform==='darwin'&&existsSync(serviceFile)){
    const service=JSON.parse(readFileSync(serviceFile,'utf8'));
    if(service.kind==='launchd'&&service.label===label()){
      if(service.status==='failed')return;
      // Let the supervisor own crash recovery. A detached replacement can win
      // the singleton race and leave launchd repeatedly starting duplicates.
      const child=launch('launchctl',['kickstart','gui/'+process.getuid!()+'/'+label()],{detached:true,stdio:'ignore'});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);child.unref();});return;
    }
  }
  const child=launch(config.command[0]!,[...config.command.slice(1),'collect','daemon'],{detached:true,stdio:'ignore',env:{...process.env,OPENCRAWL_CONFIG_HOME:dirname(configDir()),OPENCRAWL_NO_UPDATE:'1'}});
  await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);child.unref();});
}

/** macOS is the first supervised proof. Other environments can run the same
 * foreground command under their own supervisor without an init dependency. */
export async function installCaptureDaemon(config:CaptureConfig,{home=homedir(),service=true,platform=process.platform,run=spawnSync,ensure=ensureCaptureDaemon}:{home?:string;service?:boolean;platform?:NodeJS.Platform;run?:typeof spawnSync;ensure?:typeof ensureCaptureDaemon}={}) {
  if(!isDeepStrictEqual(readCaptureConfig(),config))throw Error('Capture configuration changed before service installation');
  const queue=join(captureDir(),'queue'),pending=existsSync(queue)&&readdirSync(queue).some(name=>name.endsWith('.json'));
  if(!captureDaemonEnabled(config)||!config.backgroundStartup&&(config.disabled||!captureDaemonHarnesses(config).length&&!pending)){
    uninstallCaptureDaemon(home,{platform,run});return {kind:'not-required',supervised:false,queuedDataPreserved:true};
  }
  mkdirSync(directory(),{recursive:true,mode:0o700});
  atomicJson(join(directory(),'generation.json'),{generation:crypto.randomUUID()});
  if(platform==='darwin'&&service){
    const path=join(home,'Library','LaunchAgents',label()+'.plist');mkdirSync(dirname(path),{recursive:true});
    const domain='gui/'+process.getuid!();
    run('launchctl',['bootout',domain+'/'+label()],{stdio:'ignore',timeout:5000});
    // LaunchAgents belongs to the user, not to our config store. Preserve its
    // permissions while atomically replacing only our own service file.
    const temporary=path+'.'+crypto.randomUUID()+'.tmp';
    try{const fd=openSync(temporary,'wx',0o600);try{writeFileSync(fd,launchAgent(config));fsyncSync(fd);}finally{closeSync(fd);}renameSync(temporary,path);syncDirectory(dirname(path));}
    finally{try{unlinkSync(temporary);}catch{}}
    const service={kind:'launchd',status:'installed',supervised:true,label:label(),path},serviceFile=join(directory(),'service.json');
    atomicJson(serviceFile,service);
    const result=run('launchctl',['bootstrap',domain,path],{stdio:'pipe',timeout:5000});
    if(result.status!==0){const error=Error('Could not install the capture LaunchAgent; rerun setup to repair supervision');atomicJson(serviceFile,{...service,status:'failed',supervised:false});recordError(error);throw error;}
    return service;
  }
  await ensure(config,{platform});
  const state={kind:'process',status:'requested',supervised:false,command:[...config.command,'collect','daemon']};atomicJson(join(directory(),'service.json'),state);return state;
}

export function uninstallCaptureDaemon(home=homedir(),{platform=process.platform,run=spawnSync}:{platform?:NodeJS.Platform;run?:typeof spawnSync}={}) {
  // Reconfiguration wakes the worker without trusting a possibly reused PID.
  if(existsSync(directory()))atomicJson(join(directory(),'generation.json'),{generation:crypto.randomUUID()});
  if(platform!=='darwin')return;
  const path=join(home,'Library','LaunchAgents',label()+'.plist');
  if(!existsSync(path)||!readFileSync(path,'utf8').includes(xml(dirname(configDir()))))return;
  run('launchctl',['bootout','gui/'+process.getuid!()+'/'+label()],{stdio:'ignore',timeout:5000});
  unlinkSync(path);
  const serviceFile=join(directory(),'service.json');if(existsSync(serviceFile))unlinkSync(serviceFile);
}
