import {expect,test} from 'bun:test';
import {waitForSetup} from '../src/setup/wait.ts';
import type {SetupState} from '../src/setup/state.ts';
import type {SetupServerStatus} from '../src/setup/api.ts';
const saved:SetupState={schemaVersion:1,scope:{api:'http://localhost:8092',tenantId:'org',userId:'person'},installationId:'installation',acceptedAt:'2026-11-17T00:00:00Z',selections:{plugins:{'claude-code':true},forward:{'claude-code':true},history:{'claude-code':false}}};
const status=(proof:string,mcp='authenticated'):SetupServerStatus=>({scope:{tenantId:'org',userId:'person'},firstWin:null,installations:[{installationId:'installation',clients:[{client:'claude-code',installed:true,mcp:{state:mcp},proof:{state:proof},humanTasks:[]}]}]});
test('indexing delay finishes without a human reply or a second choice',async()=>{
 let checks=0;const waits:number[]=[];
 const result=await waitForSetup(()=>saved,{read:async()=>status(checks?'verified':'waiting_index'),verify:async id=>{expect(id).toBe('installation');checks++;},delay:async ms=>{waits.push(ms);}});
 expect(result.nextAction.kind).toBe('complete');expect(result.selections).toEqual(saved.selections);expect(waits).toEqual([3000]);
});
test('waiting is bounded and does not manufacture a missing native MCP receipt',async()=>{
 let checks=0;const deps={read:async()=>status('waiting_capture'),verify:async()=>{checks++;},delay:async()=>{},attempts:2};
 expect((await waitForSetup(()=>saved,deps)).status).toBe('pending');expect(checks).toBe(2);
 checks=0;expect((await waitForSetup(()=>saved,{...deps,read:async()=>status('waiting_capture','pending')})).nextAction.kind).toBe('native_tool');expect(checks).toBe(0);
});
test('changing authenticated owner stops observation before verification',async()=>{
 let checks=0;
 await expect(waitForSetup(()=>saved,{read:async()=>({...status('waiting_index'),scope:{tenantId:'other',userId:'person'}}),verify:async()=>{checks++;}})).rejects.toThrow('changed while waiting');
 expect(checks).toBe(0);
});

test('all selected harnesses must finish; waiting verifies the pending client',async()=>{
 const multiple:SetupState={...saved,selections:{plugins:{'claude-code':true,codex:true},forward:{'claude-code':true,codex:true},history:{}}};
 let checked=false;
 const result=await waitForSetup(()=>multiple,{read:async()=>{const server=status('verified');server.installations[0].clients.push({client:'codex',installed:true,mcp:{state:'authenticated'},proof:{state:checked?'verified':'waiting_index'},humanTasks:[]});return server;},verify:async(id,client)=>{expect(id).toBe('installation');expect(client).toBe('codex');checked=true;},delay:async()=>{}});
 expect(checked).toBe(true);expect(result.nextAction.kind).toBe('complete');
});
