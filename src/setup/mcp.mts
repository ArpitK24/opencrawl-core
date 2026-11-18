import type {McpServer} from '@modelcontextprotocol/server';
import type {Principal} from '../sessions/types.mjs';
import {serviceError} from '../sessions/types.mjs';
import {setupVerifySchema,setupMcpVerifySchema,type createSetupStatus} from './status.mjs';

/** Native verification uses the same authenticated setup state as the CLI. */
export function registerSetupTools(server:McpServer,principal:()=>Principal,setup:ReturnType<typeof createSetupStatus>){
  server.registerTool('installation_status',{
    title:'Check this OpenCrawl installation',
    description:'Check this installation and client. Get installationId from setup status --local. Emit the returned marker in a normal assistant message immediately, call verify_installation with its proofId, then let native capture run and check again. Keep saved choices. Ask the person only for a required native approval. Do not create transcript files or upload synthetic events.',
    inputSchema:setupVerifySchema,
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>{
    try{const result={installationId:input.installationId,...await setup.verify(principal(),input)};return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
    catch(failure){const error=serviceError(failure);return {isError:true,content:[{type:'text',text:[400,409].includes(error.status??0)?error.message:'Installation status unavailable or access denied.'}]};}
  });
  server.registerTool('verify_installation',{
    title:'Verify this OpenCrawl installation',
    description:'Call from this native client with the proofId from installation_status. The captured native result and a searchable new message establish readiness. The call alone does not establish success.',
    inputSchema:setupMcpVerifySchema,
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>{
    try{const observed=await setup.mcp(principal(),input),result=input.client==='claude-code'&&observed.status==='awaiting_native_capture'?{...observed,instruction:'Run setup wait --json with the profile-bound CLI from setup next. It waits for native capture and indexing; follow its nextAction. Do not ask the person to reply or type a test message.'}:observed;return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
    catch(failure){const error=serviceError(failure);return {isError:true,content:[{type:'text',text:[400,409].includes(error.status??0)?error.message:'Installation proof unavailable or access denied.'}]};}
  });
}
