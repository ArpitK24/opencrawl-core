import {expect,test} from 'bun:test';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {atomicJson} from '../src/session.ts';
import {invokesPrivacy,nativePrivacySession,privateHookSession,purgePrivateQueue,denyBoardSend} from '../src/incognito.ts';
import {captureDir,type CaptureConfig} from '../src/capture/runtime.ts';
import {captureExcluded} from '../src/capture/policy.ts';

test('invocation comes from the native prompt or a selected skill',()=>{
  for(const name of ['oc-incognito','oc-private','opencrawl-private','oc-readonly']){
    for(const prompt of ['$'+name,'/opencrawl:'+name,'[$'+name+'](/skills/'+name+'/SKILL.md)'])
      expect(invokesPrivacy('codex',{hook_event_name:'UserPromptSubmit',prompt})).toBe(true);
    for(const prompt of ['please implement $'+name,'\x60/'+name+'\x60','/'+name+'-test'])
      expect(invokesPrivacy('codex',{hook_event_name:'UserPromptSubmit',prompt})).toBe(false);
    expect(invokesPrivacy('claude-code',{hook_event_name:'PreToolUse',tool_name:'Skill',tool_input:{skill:'opencrawl:'+name}})).toBe(true);
    expect(invokesPrivacy('codex',{hook_event_name:'PostToolUse',prompt:'/'+name})).toBe(false);
  }
  expect(invokesPrivacy('codex',{hook_event_name:'UserPromptSubmit',prompt:'/opencrawl-000000000000:oc-private'})).toBe(false);
  expect(invokesPrivacy('antigravity',{hookEventName:'PreInvocation',lastUserInput:'/oc-private'})).toBe(false);
  expect(nativePrivacySession('claude-code',{session_id:'parent',agent_id:'child'})?.sessionId).toBe('parent:child');
  expect(nativePrivacySession('codex',{session_id:'parent',agent_id:'child'})?.sessionId).toBe('child');
});

test('offline activation fences only this owner and harness and removes its pending batch',async()=>{
  const prev=process.env.OPENCRAWL_CONFIG_HOME,home=mkdtempSync(join(tmpdir(),'incognito-test-'));
  process.env.OPENCRAWL_CONFIG_HOME=home;
  try{
    const config={schemaVersion:1,api:'http://localhost:7050',installationId:'test',owner:{tenantId:'a',userId:'b'},roots:{codex:home,'claude-code':home},command:[],installedAt:new Date().toISOString()} satisfies CaptureConfig;
    atomicJson(join(captureDir(),'config.json'),config);
    const session={harness:'codex',sessionId:'chat'};
    const batch=(id:string,harness:string,sessionId:string)=>{const file=join(captureDir(),'queue',id.repeat(64)+'.json');atomicJson(file,{owner:config.owner,harness,sessionId});return file;};
    const mine=batch('a','codex','chat'),other=batch('b','codex','chat-more'),same=batch('c','cursor','chat');
    expect(privateHookSession('codex',{session_id:'chat',hook_event_name:'UserPromptSubmit',prompt:'/oc-private'},config)).toEqual(session);
    expect(captureExcluded(config,session)).toBe(true);
    expect(captureExcluded({...config,owner:{...config.owner,userId:'different'}},session)).toBe(false);
    expect(denyBoardSend('codex',{tool_name:'mcp__opencrawl__board_post'})?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(denyBoardSend('codex',{tool_name:'mcp__opencrawl__opencrawl_search'})).toBeUndefined();
    await purgePrivateQueue(config,session);
    expect([mine,other,same].map(existsSync)).toEqual([false,true,true]);
  }finally{if(prev===undefined)delete process.env.OPENCRAWL_CONFIG_HOME;else process.env.OPENCRAWL_CONFIG_HOME=prev;rmSync(home,{recursive:true,force:true});}
});
