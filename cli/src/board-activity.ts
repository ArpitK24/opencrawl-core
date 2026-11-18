import {createHash} from 'node:crypto';
import {closeSync,mkdirSync,openSync,readFileSync,statSync,utimesSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {configDir} from './session.ts';

export const boardIdleMs=30*60_000;

function activityFile(api:string,session:string){
  const key=createHash('sha256').update(JSON.stringify([api,session])).digest('hex');
  return join(configDir(),'board',key+'.activity');
}

/** Only listeners create markers. A native hook touches its own session's
 * existing timestamp without saving prompts, tool arguments or transcripts. */
export function markBoardActivity(api:string,session:unknown){
  if(typeof session!=='string'||!session.length||session.length>200)return;
  const now=new Date();
  try{utimesSync(activityFile(api,session),now,now);}catch{/* Optional local marker. */}
}

export function markNativeBoardActivity(api:string,event:Record<string,unknown>|null){
  if(!event||typeof event!=='object')return;
  const name=event.hook_event_name??event.hookEventName;
  if(typeof name!=='string'||!['UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','beforeSubmitPrompt','preToolUse','postToolUse'].includes(name))return;
  // Claude periodically ends and re-arms Monitor even in an otherwise idle
  // chat. Neither that call nor the enclosing turn boundary signals real work.
  const input=event.tool_input as {command?:unknown;query?:unknown}|undefined;
  if(event.tool_name==='Monitor' && typeof input?.command==='string' && /\bboard\s+watch\b/.test(input.command))return;
  if(event.tool_name==='ToolSearch' && typeof input?.query==='string' && /^select:(Monitor|TaskStop)(,(Monitor|TaskStop))*$/.test(input.query))return;
  if(name==='UserPromptSubmit' && typeof event.prompt==='string' && event.prompt.trimStart().startsWith('<task-notification>') && event.prompt.includes('OpenCrawl board notices'))return;
  markBoardActivity(api,event.session_id??event.conversation_id??event.conversationId);
}

export function listenerActivity(api:string,session:string){
  const file=activityFile(api,session);
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  closeSync(openSync(file,'a',0o600));
  return {
    lastActivity:()=>statSync(file).mtimeMs,
    onNotification:(receipt:string)=>{
      // Re-emit an outstanding notice on reattachment, but renew the idle
      // clock only for a newly delivered batch. The listener lock owns writes.
      if(readFileSync(file,'utf8')!==receipt)writeFileSync(file,receipt,{mode:0o600});
    },
  };
}
