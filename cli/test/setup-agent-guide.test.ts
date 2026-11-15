import {test,expect} from 'bun:test';
import {setupAgentGuide} from '../src/setup/agent-guide.ts';
import {formatSetupCommand} from '../src/setup/invocation.ts';
import {skillFiles} from '../src/skills.ts';
import {setupPluginFiles,setupPluginIdentity} from '../src/setup/plugins.ts';

test('setup guides preserve the actual invocation and quote client/server arguments on both shell platforms',()=>{
 const api='https://knowledge.example';
 for(const platform of ['linux','win32'] as const){
  const command=[platform==='win32'?"C:\\Private install's\\opencrawl.cmd":"/private install's/bin/opencrawl"];
  const guide=setupAgentGuide('codex',api,command,platform);
  for(const args of [['setup','status','--json'],['setup','resume','--json'],['setup'],['verify-installation','--client','codex','--json']]){
   expect(guide).toContain('`'+formatSetupCommand([...args,'--api',api],command,platform)+'`');
  }
  expect(guide).not.toMatch(/`opencrawl (setup|verify-installation)/);
  expect(guide).toContain('recording is off (forward=false)');
  expect(guide).toContain('complete MCP sign-in and tool proof, expect not_selected');
  expect(guide).toContain('do not require or enable new capture');
  expect(guide).toContain('Preserve skipped history');
 }
});

test('standalone setup reference uses the current executable without hardcoding another server',()=>{
 const guide=skillFiles()['references/setup.md'];
 expect(guide).toBe(setupAgentGuide());
 expect(guide).toContain('`'+formatSetupCommand(['setup','status','--json'])+'`');
 expect(guide).toContain('`'+formatSetupCommand(['verify-installation','--client','<this-client>','--json'])+'`');
 expect(guide).not.toContain('--api');
});

test('every native plugin gives its onboarding and shared setup reference the same client-bound guide',()=>{
 const api='https://selected.example';
 for(const client of ['claude-code','codex','cursor','antigravity'] as const){
  const files=setupPluginFiles(client,api),guide=files['skills/opencrawl-setup/SKILL.md'];
  expect(guide).toStartWith(setupAgentGuide(client,api));
  expect(guide).toContain(setupPluginIdentity(api).name);
  expect(files['skills/opencrawl/references/setup.md']).toBe(guide);
  expect(guide).toContain('`'+formatSetupCommand(['verify-installation','--client',client,'--json','--api',api])+'`');
  expect(guide).not.toMatch(/`opencrawl (setup|verify-installation)/);
 }
});
