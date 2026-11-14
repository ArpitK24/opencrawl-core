import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {formatSetupCommand} from '../src/setup/command.ts';
import {commandForSelf} from '../src/capture/runtime.ts';

test('ordinary and source invocation use the current CLI with readable simple arguments',()=>{
 expect(formatSetupCommand(['setup','status'],['/home/person/.local/bin/opencrawl'],'linux')).toBe('/home/person/.local/bin/opencrawl setup status');
 expect(formatSetupCommand(['setup','status'])).toBe(formatSetupCommand(['setup','status'],commandForSelf()));
 expect(formatSetupCommand(['setup'],['/opt/bun','/repo with spaces/cli/main.ts'],'linux')).toBe("/opt/bun '/repo with spaces/cli/main.ts' setup");
});

test('Windows handoff uses PowerShell literals for paths and shell-sensitive arguments',()=>{
 expect(formatSetupCommand(['setup','apply','--plugins','codex,cursor','--api',"https://example.test/a?$x='value'"],["C:\\Private install's\\opencrawl.cmd"],'win32'))
  .toBe("& 'C:\\Private install''s\\opencrawl.cmd' setup apply --plugins 'codex,cursor' --api 'https://example.test/a?$x=''value'''");
});

test('displayed command runs its launcher with exact arguments despite another opencrawl on PATH',()=>{
 const dir=mkdtempSync(join(tmpdir(),'opencrawl-handoff-'));
 try{
  const privateDir=join(dir,"private install's bin"),otherDir=join(dir,'other');mkdirSync(privateDir);mkdirSync(otherDir);
  const windows=process.platform==='win32',launcher=join(privateDir,windows?'opencrawl.ps1':'opencrawl');
  writeFileSync(launcher,windows?'ConvertTo-Json -InputObject @($args) -Compress':'#!/bin/sh\nprintf \'%s\\0\' "$@"\n',{mode:0o755});
  writeFileSync(join(otherDir,windows?'opencrawl.cmd':'opencrawl'),windows?'@exit /b 99':'#!/bin/sh\nexit 99\n',{mode:0o755});
  const args=['setup','status','--api',"https://example.test/path?x=$HOME&v='quoted'",'--plugins','codex,cursor','--empty',''];
  const shell=windows?join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'):'/bin/sh';
  const formatted=formatSetupCommand(args,[launcher]);
  const run=spawnSync(shell,windows?['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',formatted]:['-c',formatted],{encoding:'utf8',env:{...process.env,PATH:otherDir},timeout:5000});
  expect(run.error).toBeUndefined();expect(run.status).toBe(0);
  expect(windows?JSON.parse(run.stdout):run.stdout.split('\0').slice(0,-1)).toEqual(args);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
