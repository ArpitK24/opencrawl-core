import {existsSync,readFileSync,readdirSync,mkdirSync,unlinkSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {spawn,spawnSync} from 'node:child_process';
import {atomicJson,syncDirectory,configDir,withSessionLock} from '../session.ts';
import {captureDir,readCaptureConfig,captureDaemonEnabled,captureDaemonHarnesses,recordError,type CaptureConfig} from './runtime.ts';
import {hash} from './parse.ts';
import {compiled,nativeBin,selectedBinary} from '../distribution.ts';

const directory=()=>join(captureDir(),'daemon');
const label=()=>`com.getopencrawl.capture.${hash(configDir()).slice(0,12)}`;
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function serviceEnvironment(){
  const environment:Record<string,string>={OPENCRAWL_CONFIG_HOME:dirname(configDir()),OPENCRAWL_NO_UPDATE:'1'};
  for(const name of ['XDG_CACHE_HOME','XDG_DATA_HOME'])if(process.env[name])environment[name]=process.env[name]!;
  return environment;
}
const continuous=(config:CaptureConfig)=>Boolean(!config.disabled&&captureDaemonHarnesses(config).length||config.backgroundStartup);
const workerCommand=(config:CaptureConfig)=>[...config.command,'collect','daemon','--worker-environment',JSON.stringify(serviceEnvironment())];
/** systemd has its own quoting, environment and percent-specifier rules; it
 * does not run ExecStart through a shell. Disable dollar expansion explicitly. */
const unitQuote=(value:string)=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r').replaceAll('%','%%')+'"';
export function systemdUnit(config:CaptureConfig){
  return `[Unit]\nDescription=OpenCrawl session capture\nStartLimitIntervalSec=0\n\n[Service]\nType=exec\nExecStart=:${[...config.command,'collect','daemon'].map(unitQuote).join(' ')}\n${Object.entries(serviceEnvironment()).map(([key,value])=>'Environment='+unitQuote(key+'='+value)).join('\n')}\nRestart=${continuous(config)?'always':'on-failure'}\nRestartSec=10\nTimeoutStopSec=30\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`;
}
function writeServiceFile(path:string,content:string){
  mkdirSync(dirname(path),{recursive:true});
  const temporary=path+'.'+crypto.randomUUID()+'.tmp';
  try{const fd=openSync(temporary,'wx',0o600);try{writeFileSync(fd,content);fsyncSync(fd);}finally{closeSync(fd);}renameSync(temporary,path);syncDirectory(dirname(path));}
  finally{try{unlinkSync(temporary);}catch{}}
}
const powershellQuote=(value:string)=>"'"+value.replaceAll("'","''")+"'";
const windowsArgument=(value:string)=>'"'+value.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';
export function windowsTaskScript(config:CaptureConfig){
  if(!config.command.length)throw Error('Capture supervision requires an executable command');
  let executable=config.command[0]!;
  // Task Scheduler starts the native process directly, not a long-lived
  // PowerShell wrapper or the installer's .cmd shim.
  if(config.command.length===1&&executable===nativeBin()&&compiled())executable=selectedBinary().file;
  if(/\.(cmd|bat)$/i.test(executable))throw Error('Capture supervision requires the native executable, not a custom batch launcher');
  const args=[...config.command.slice(1),'collect','daemon','--worker-environment',JSON.stringify(serviceEnvironment())].map(windowsArgument).join(' ');
  const task=powershellQuote(label()),description=powershellQuote('OpenCrawl capture profile '+hash(configDir()));
  return `$ErrorActionPreference='Stop'\n$task=${task}\n$description=${description}\n$previous=Get-ScheduledTask -TaskPath '\\' -ErrorAction Stop | Where-Object {$_.TaskName -eq $task}\nif($previous -and $previous.Description -ne $description){throw 'Capture task name is already owned by another program'}\nif($previous){Stop-ScheduledTask -TaskName $task}\n$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value\n$action=New-ScheduledTaskAction -Execute ${powershellQuote(executable)} -Argument ${powershellQuote(args)}\n$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited\n$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user\n$settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Priority 7\nRegister-ScheduledTask -TaskName $task -Description $description -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Force | Out-Null\nStart-ScheduledTask -TaskName $task\n`;
}
const powershell=(script:string,run:typeof spawnSync=spawnSync)=>run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:'pipe',timeout:15_000,windowsHide:true});
export function launchAgent(config:CaptureConfig) {
  const args=[...config.command,'collect','daemon'];
  const environment=serviceEnvironment();
  const keepAlive=continuous(config)?'<true/>':'<dict><key>SuccessfulExit</key><false/></dict>';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label()}</string><key>ProgramArguments</key><array>${args.map(arg=>'<string>'+xml(arg)+'</string>').join('')}</array><key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key,value])=>'<key>'+xml(key)+'</key><string>'+xml(value)+'</string>').join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key>${keepAlive}<key>ThrottleInterval</key><integer>10</integer><key>ProcessType</key><string>Background</string></dict></plist>\n`;
}

/** Portable fallback for environments whose supervisor starts the worker or
 * keeps detached children alive. A kernel lock, not a PID file, owns singleton
 * exclusion. Hooks never wait for startup, authentication, or upload. */
export async function ensureCaptureDaemon(config=readCaptureConfig(),{platform=process.platform,launch=spawn}:{platform?:NodeJS.Platform;launch?:typeof spawn}={}) {
  if(!config||config.disabled&&!config.backgroundStartup||!captureDaemonEnabled(config)||!config.command.length)return;
  try{await withSessionLock('capture:daemon',async()=>{},0);}catch(error:any){if(error.code==='SESSION_BUSY')return;throw error;}
  const serviceFile=join(directory(),'service.json');
  if(existsSync(serviceFile)){
    const service=JSON.parse(readFileSync(serviceFile,'utf8'));
    if(service.kind==='external'||service.status==='failed'||service.status==='stop-failed')return;
    if(platform==='darwin'&&service.kind==='launchd'&&service.label===label()){
      // Let the supervisor own crash recovery. A detached replacement can win
      // the singleton race and leave launchd repeatedly starting duplicates.
      const child=launch('launchctl',['kickstart','gui/'+process.getuid!()+'/'+label()],{detached:true,stdio:'ignore'});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);child.unref();});return;
    }
    if(platform==='linux'&&service.kind==='systemd'&&service.label===label()){
      const child=launch('systemctl',['--user','start','--no-block',label()+'.service'],{detached:true,stdio:'ignore'});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);child.unref();});return;
    }
    if(platform==='win32'&&service.kind==='task-scheduler'&&service.label===label()){
      const child=launch('schtasks.exe',['/Run','/TN',label()],{detached:true,stdio:'ignore',windowsHide:true});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);child.unref();});return;
    }
  }
  const child=launch(config.command[0]!,[...config.command.slice(1),'collect','daemon'],{detached:true,stdio:'ignore',env:{...process.env,OPENCRAWL_CONFIG_HOME:dirname(configDir()),OPENCRAWL_NO_UPDATE:'1'}});
  await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);child.unref();});
}

/** User-scoped OS supervision; hosts without a user manager receive an explicit
 * profile-bound foreground command for their own supervisor. */
export async function installCaptureDaemon(config:CaptureConfig,{home=homedir(),service=true,platform=process.platform,run=spawnSync,ensure=ensureCaptureDaemon}:{home?:string;service?:boolean;platform?:NodeJS.Platform;run?:typeof spawnSync;ensure?:typeof ensureCaptureDaemon}={}) {
  if(!isDeepStrictEqual(readCaptureConfig(),config))throw Error('Capture configuration changed before service installation');
  const queue=join(captureDir(),'queue'),pending=existsSync(queue)&&readdirSync(queue).some(name=>name.endsWith('.json'));
  if(!captureDaemonEnabled(config)||!config.backgroundStartup&&(config.disabled||!captureDaemonHarnesses(config).length&&!pending)){
    uninstallCaptureDaemon(home,{platform,run});return {kind:'not-required',supervised:false,queuedDataPreserved:true};
  }
  if(service){
    const path=platform==='linux'?join(process.env.XDG_CONFIG_HOME||join(home,'.config'),'systemd','user',label()+'.service'):platform==='darwin'?join(home,'Library','LaunchAgents',label()+'.plist'):null;
    const binding=platform==='linux'?'Environment='+unitQuote('OPENCRAWL_CONFIG_HOME='+dirname(configDir())):'<key>OPENCRAWL_CONFIG_HOME</key><string>'+xml(dirname(configDir()))+'</string>';
    if(path&&existsSync(path)&&!readFileSync(path,'utf8').includes(binding))throw Error('Capture service file belongs to another profile or program; it was preserved');
  }
  mkdirSync(directory(),{recursive:true,mode:0o700});
  atomicJson(join(directory(),'generation.json'),{generation:crypto.randomUUID()});
  if(platform==='darwin'&&service){
    const path=join(home,'Library','LaunchAgents',label()+'.plist');mkdirSync(dirname(path),{recursive:true});
    const domain='gui/'+process.getuid!();
    run('launchctl',['bootout',domain+'/'+label()],{stdio:'ignore',timeout:5000});
    // LaunchAgents belongs to the user, not to our config store. Preserve its
    // permissions while atomically replacing only our own service file.
    writeServiceFile(path,launchAgent(config));
    const service={kind:'launchd',status:'installed',supervised:true,label:label(),path},serviceFile=join(directory(),'service.json');
    atomicJson(serviceFile,service);
    const result=run('launchctl',['bootstrap',domain,path],{stdio:'pipe',timeout:5000});
    if(result.status!==0){const error=Error('Could not install the capture LaunchAgent; rerun setup to repair supervision');atomicJson(serviceFile,{...service,status:'failed',supervised:false});recordError(error);throw error;}
    return service;
  }
  if(platform==='linux'&&service){
    const path=join(process.env.XDG_CONFIG_HOME||join(home,'.config'),'systemd','user',label()+'.service');
    writeServiceFile(path,systemdUnit(config));
    const invoke=(args:string[])=>run('systemctl',['--user',...args],{stdio:'pipe',timeout:5000});
    const available=invoke(['show-environment']);
    if(available.status!==0){
      const state={kind:'external',status:'required',supervised:false,path,command:workerCommand(config),reason:'No systemd user manager; the host supervisor must run this foreground command'};
      atomicJson(join(directory(),'service.json'),state);return state;
    }
    invoke(['stop',label()+'.service']);
    const state={kind:'systemd',status:'installed',supervised:true,label:label(),path};
    atomicJson(join(directory(),'service.json'),state);
    if(invoke(['daemon-reload']).status!==0||invoke(['enable','--now',label()+'.service']).status!==0){
      const error=Error('Could not install the capture user service; rerun setup to repair supervision');
      atomicJson(join(directory(),'service.json'),{...state,status:'failed',supervised:false});recordError(error);throw error;
    }
    return state;
  }
  if(platform==='win32'&&service){
    const state={kind:'task-scheduler',status:'installed',supervised:true,label:label(),restartIntervalSeconds:60};
    atomicJson(join(directory(),'service.json'),state);
    try{if(powershell(windowsTaskScript(config),run).status!==0)throw Error('Could not install the capture scheduled task; rerun setup to repair supervision');}
    catch(error){atomicJson(join(directory(),'service.json'),{...state,status:'failed',supervised:false});recordError(error);throw error;}
    return state;
  }
  await ensure(config,{platform});
  const state={kind:'process',status:'requested',supervised:false,command:workerCommand(config)};atomicJson(join(directory(),'service.json'),state);return state;
}

export function uninstallCaptureDaemon(home=homedir(),{platform=process.platform,run=spawnSync}:{platform?:NodeJS.Platform;run?:typeof spawnSync}={}) {
  const receipt=join(directory(),'service.json');
  const failed=(message:string)=>{
    const error=Error(message);let previous={};try{previous=JSON.parse(readFileSync(receipt,'utf8'));}catch{}
    atomicJson(receipt,{...previous,status:'stop-failed',supervised:false});recordError(error);throw error;
  };
  // Reconfiguration wakes the worker without trusting a possibly reused PID.
  if(existsSync(directory()))atomicJson(join(directory(),'generation.json'),{generation:crypto.randomUUID()});
  if(platform==='win32'){
    const service=join(directory(),'service.json');
    if(!existsSync(service))return;
    const state=JSON.parse(readFileSync(service,'utf8'));if(state.kind!=='task-scheduler'||state.label!==label())return;
    const result=powershell(`$ErrorActionPreference='Stop';$task=Get-ScheduledTask -TaskPath '\\' -ErrorAction Stop | Where-Object {$_.TaskName -eq ${powershellQuote(label())}};if($task){if($task.Description -ne ${powershellQuote('OpenCrawl capture profile '+hash(configDir()))}){throw 'Capture task ownership changed'};Stop-ScheduledTask -TaskName ${powershellQuote(label())};Unregister-ScheduledTask -TaskName ${powershellQuote(label())} -Confirm:$false}`,run);
    if(result.status!==0)failed('Could not remove the capture scheduled task; queued data is preserved');
    unlinkSync(service);return;
  }
  if(platform==='linux'){
    const path=join(process.env.XDG_CONFIG_HOME||join(home,'.config'),'systemd','user',label()+'.service');
    const previous=existsSync(receipt)?JSON.parse(readFileSync(receipt,'utf8')):null;
    if(existsSync(path)&&!readFileSync(path,'utf8').includes('Environment='+unitQuote('OPENCRAWL_CONFIG_HOME='+dirname(configDir()))))failed('Capture service ownership changed; its file and receipt are preserved');
    if(!existsSync(path)&&previous?.kind!=='systemd')return;
    // A missing user manager installed only a suggested unit, never a service.
    if(previous?.kind==='external'&&previous.status==='required'){unlinkSync(path);unlinkSync(receipt);return;}
    const stop=run('systemctl',['--user','disable','--now',label()+'.service'],{stdio:'pipe',timeout:5000});
    if(stop.status!==0)failed('Could not stop the capture user service; its unit, receipt and queued data are preserved');
    const active=run('systemctl',['--user','show',label()+'.service','--property=ActiveState','--value'],{stdio:'pipe',timeout:5000});
    if(active.status!==0||!['inactive','failed'].includes(active.stdout.toString().trim()))failed('Capture user service stop is unconfirmed; local state is preserved');
    const content=existsSync(path)?readFileSync(path,'utf8'):null;if(content!==null)unlinkSync(path);
    if(run('systemctl',['--user','daemon-reload'],{stdio:'pipe',timeout:5000}).status!==0){if(content!==null)writeServiceFile(path,content);failed('Could not reload the user service manager; capture unit and receipt are preserved');}
    const service=join(directory(),'service.json');if(existsSync(service))unlinkSync(service);return;
  }
  if(platform!=='darwin')return;
  const path=join(home,'Library','LaunchAgents',label()+'.plist');
  const previous=existsSync(receipt)?JSON.parse(readFileSync(receipt,'utf8')):null;
  if(existsSync(path)&&!readFileSync(path,'utf8').includes('<key>OPENCRAWL_CONFIG_HOME</key><string>'+xml(dirname(configDir()))+'</string>'))failed('Capture LaunchAgent ownership changed; its file and receipt are preserved');
  if(!existsSync(path)&&previous?.kind!=='launchd')return;
  const domain='gui/'+process.getuid!()+'/'+label();
  const stopped=run('launchctl',['bootout',domain],{stdio:'pipe',timeout:5000});
  if(stopped.status!==0){
    const checked=run('launchctl',['print',domain],{stdio:'pipe',timeout:5000});
    if(checked.status!==113||!checked.stderr.toString().includes('Could not find service'))failed('Could not confirm the capture LaunchAgent stopped; its file, receipt and queued data are preserved');
  }
  if(existsSync(path))unlinkSync(path);
  const serviceFile=join(directory(),'service.json');if(existsSync(serviceFile))unlinkSync(serviceFile);
}
