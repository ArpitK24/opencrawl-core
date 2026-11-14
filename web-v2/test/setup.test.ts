import test from 'node:test';
import assert from 'node:assert/strict';
import {clientSummary,historyLabel,setupCommands} from '../src/application/setup.tsx';
import type {SetupStatus} from '../../src/application/types.mjs';

type Client=SetupStatus['installations'][number]['clients'][number];
const client:Client={client:'codex',installed:true,forward:true,history:'skip',historyProgress:{state:'not_started',completed:0},hookTrust:'trusted',mcp:{state:'authenticated'},proof:{state:'verified'},humanTasks:[]};
test('past verification does not hide disabled recording, removed plugins, or outstanding human actions',()=>{
  assert.equal(clientSummary({...client,forward:false}).label,'Future recording off');
  assert.equal(clientSummary({...client,installed:false,forward:false,history:'import'}).label,'History only');
  assert.equal(clientSummary({...client,humanTasks:[{id:'auth',kind:'mcp_auth',client:'codex',title:'Sign in',instruction:'Use native MCP authentication.'}]}).label,'Continue in your agent');
  assert.equal(clientSummary({...client,history:'import',historyProgress:{state:'failed',completed:7,total:20}}).tone,'danger');
  assert.equal(clientSummary({...client,history:'skip',historyProgress:{state:'failed',completed:7,total:20}}).label,'Verified');
});
test('history import progress stays distinct from live session verification',()=>{
  assert.equal(historyLabel({...client,history:'import',proof:{state:'pending'},historyProgress:{state:'complete',completed:12,total:12}}),'Import complete, 12 of 12 processed');
  assert.equal(clientSummary({...client,proof:{state:'waiting_index'}}).label,'Waiting for search');
  assert.equal(historyLabel({...client,history:'skip',historyProgress:{state:'complete',completed:12,total:12}}),'Not selected');
});
test('setup and agent handoff target the selected server with shell-safe arguments',()=>{
  const commands=setupCommands('http://[::1]:4310/mcp');
  assert.equal(commands.setup,"opencrawl setup --api 'http://[::1]:4310'");
  assert.ok(commands.handoff.includes("--api 'http://[::1]:4310' --json"));
  assert.ok(!commands.setup.includes('app.getopencrawl.com'));
  assert.ok(setupCommands('https://team.example/mcp',true).install.startsWith('irm '));
});

test('a preview installer override completely replaces main distribution commands',()=>{
  const pinned='sh /private/preview/install-012345.sh';
  for(const windows of [false,true]){
    const commands=setupCommands('https://preview.example/mcp',windows,pinned);
    assert.equal(commands.start,pinned+"\nopencrawl setup --api 'https://preview.example'");
    assert.ok(!commands.start.includes('raw.githubusercontent.com'));
    assert.ok(!commands.start.includes('/main/'));
    assert.ok(!commands.start.includes('latest'));
  }
});
