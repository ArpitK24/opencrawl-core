import {expect, test} from 'bun:test';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {saveBoardRegistration} from '../src/board.ts';
import {claudeSearchContextMatcher, searchContextCommand} from '../src/search-context.ts';

test('Claude resolves renamed MCP connections by their actual scoped destination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oc-claude-binding-'));
  const env = {CLAUDE_CONFIG_DIR:dir, CLAUDE_PROJECT_DIR:dir, OPENCRAWL_CONFIG_HOME:dir, OPENCRAWL_AUTH:'replicas-workspace'};
  const prior = new Map(Object.keys(env).map(k => [k,process.env[k]]));
  Object.assign(process.env, env);
  const api = 'https://team.example', endpoint = api + '/mcp';
  const relay = 'http://127.0.0.1:17323/identity/' + [api,endpoint].map(v => Buffer.from(v).toString('base64url')).join('/');
  const write = (name:string, url:string) => writeFileSync(join(dir,'.claude.json'), JSON.stringify({
    mcpServers:{[name]:{type:'http',url}},
    projects:{[dir]:{mcpServers:{[name]:{type:'http',url:endpoint}}}},
  }));
  async function call(name:string, source='user', tool='board_sync') {
    const tool_name = 'mcp__' + name.replace(/[^a-zA-Z0-9_-]/g,'_') + '__' + tool;
    if (!new RegExp(claudeSearchContextMatcher).test(tool_name)) return;
    const event = {hook_event_name:'PreToolUse',session_id:'this-chat',cwd:dir,tool_name,tool_input:{limit:1},mcp_server:{name,source}};
    let output='';
    await searchContextCommand(['--harness','claude-code','--api',api],Readable.from([JSON.stringify(event)]),{write(value:string){output+=value;return true;}});
    return output ? JSON.parse(output).hookSpecificOutput : undefined;
  }
  try {
    const changed={hookEventName:'PreToolUse',updatedInput:{limit:1,currentSession:{harness:'claude-code',sessionId:'this-chat'}}};
    write('Custom-TEAM',endpoint);
    expect(await call('Custom-TEAM')).toBeUndefined();
    saveBoardRegistration(api,'this-chat',{workspace:'team',agent:'a'.repeat(64),name:'my-agent',boardProtocol:2});
    expect(await call('Custom-TEAM')).toEqual(changed);
    write('EntirelyDifferent',relay);
    expect(await call('EntirelyDifferent')).toEqual(changed);
    expect(await call('Custom-TEAM')).toBeUndefined();
    expect(await call('EntirelyDifferent','user','board_read')).toBeUndefined();
    expect(await call('EntirelyDifferent','dynamic')).toBeUndefined();
    writeFileSync(join(dir,'.mcp.json'),JSON.stringify({mcpServers:{EntirelyDifferent:{type:'http',url:'https://other.example/mcp'}}}));
    expect(await call('EntirelyDifferent','project')).toBeUndefined();
    expect(await call('EntirelyDifferent','local')).toEqual(changed);
    delete process.env.OPENCRAWL_AUTH;
    expect(await call('EntirelyDifferent')).toBeUndefined();
    for (const wrong of ['https://other.example/mcp',endpoint+'?forward=true',relay.replace('17323','17324'),relay+'/extra']) {
      write('opencrawl',wrong);
      expect(await call('opencrawl')).toBeUndefined();
    }
  } finally {
    for (const [k,v] of prior) { if (v===undefined) delete process.env[k]; else process.env[k]=v; }
    rmSync(dir,{recursive:true,force:true});
  }
});
