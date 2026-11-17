import {join,dirname} from 'node:path';
import {atomicFile,configDir} from './session.ts';

export const quote=(s:string)=>process.platform==='win32'?'"'+s.replace(/%/g,'%%').replace(/"/g,'""')+'"':"'"+s.replace(/'/g,"'\\''")+"'";
export function hookRunner(area:string,command:string[],environment?:Record<string,string>,configHome=dirname(configDir())){
  const file=join(configHome,'opencrawl',area,process.platform==='win32'?'runner.cmd':'runner.sh');
  const env=environment??{OPENCRAWL_CONFIG_HOME:configHome};
  const script=process.platform==='win32'
    ?'@echo off\r\n'+Object.entries(env).map(([key,value])=>'set "'+key+'='+value.replace(/%/g,'%%')+'"\r\n').join('')+command.map(quote).join(' ')+' %*\r\n'
    :'#!/bin/sh\n'+Object.entries(env).map(([key,value])=>'export '+key+'='+quote(value)+'\n').join('')+'exec '+command.map(quote).join(' ')+' "$@"\n';
  const shellCommand=(process.platform==='win32'?'':'exec /bin/sh ')+quote(file);
  // Claude defaults to Git Bash or PowerShell on Windows; select PowerShell
  // explicitly for .cmd runners. Codex's Windows hook shell is COMSPEC/cmd.exe.
  const invocation=(client:string)=>process.platform==='win32'&&client==='claude-code'
    ?{command:"& '"+file.replace(/'/g,"''")+"'",shell:'powershell' as const}:{command:shellCommand};
  return {file,script,command:shellCommand,invocation,write:()=>atomicFile(file,script)};
}
