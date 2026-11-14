import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';

const owned=new Set(['OpenCrawl session capture','OpenCrawl session startup']);
export type CodexHookReview={state:'not_applicable'|'unknown'|'observed';total:number;pending:number|null;disabled:number|null};
type Snapshot={review:CodexHookReview;file:string;bytes:string;config:string;keys:Set<string>};
function snapshot(root:string):Snapshot {
 const file=join(root,'hooks.json'),keys=new Set<string>();let bytes='',config='';
 try {
  bytes=readFileSync(file,'utf8');
  const value=JSON.parse(bytes) as {hooks?:Record<string,unknown>};
  for(const [event,groups] of Object.entries(value.hooks??{}))if(Array.isArray(groups))groups.forEach((group:unknown,g:number)=>{
   if(!group||typeof group!=='object'||!('hooks' in group)||!Array.isArray(group.hooks))return;
   group.hooks.forEach((hook:unknown,h:number)=>{
    if(hook&&typeof hook==='object'&&'statusMessage' in hook&&typeof hook.statusMessage==='string'&&owned.has(hook.statusMessage))keys.add(`${file}:${event.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase()}:${g}:${h}`);
   });
  });
  if(existsSync(join(root,'config.toml')))config=readFileSync(join(root,'config.toml'),'utf8');
 } catch {return {file,bytes,config,keys,review:{state:existsSync(file)?'unknown':'not_applicable',total:keys.size,pending:existsSync(file)?null:0,disabled:existsSync(file)?null:0}};}
 return {file,bytes,config,keys,review:{state:keys.size?'unknown':'not_applicable',total:keys.size,pending:keys.size?null:0,disabled:keys.size?null:0}};
}
/** Local files establish ownership, never trust in a current hook definition. */
export function localCodexHookReview(root:string):CodexHookReview{return snapshot(root).review;}

/** Read native metadata without starting a thread or executing any hook. */
export async function nativeCodexHooks(root:string):Promise<unknown>{
 const executable=Bun.which('codex');if(!executable)throw new Error('Codex unavailable');
 let command=executable,args=['app-server','--stdio'];
 if(process.platform==='win32'&&/\.(cmd|bat)$/i.test(command)){
  const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
  args=['-NoProfile','-NonInteractive','-Command','& '+[command,...args].map(literal).join(' ')+'; exit $LASTEXITCODE'];
  command=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 }
 return await new Promise((accept,reject)=>{
  const child=spawn(command,args,{cwd:root,env:{...process.env,CODEX_HOME:root},stdio:['pipe','pipe','pipe'],windowsHide:true});
  let buffer='',bytes=0,finished=false;
  const finish=(error:Error|null,value?:unknown)=>{
   if(finished)return;finished=true;clearTimeout(deadline);child.stdin.end();
   if(process.platform==='win32'&&child.pid){
    // A .cmd launcher may own a native child; terminate only this process tree.
    const killer=spawn(join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.on('error',()=>child.kill());killer.unref();
   }else child.kill();
   const kill=setTimeout(()=>child.kill('SIGKILL'),500);kill.unref();child.once('close',()=>clearTimeout(kill));
   if(error)reject(error);else accept(value);
  };
  const deadline=setTimeout(()=>finish(new Error('Codex hook inspection timed out')),5000);
  const send=(message:unknown)=>child.stdin.write(JSON.stringify(message)+'\n');
  child.on('error',()=>finish(new Error('Codex hook inspection unavailable')));
  child.stdin.on('error',()=>finish(new Error('Codex hook inspection unavailable')));
  child.once('exit',()=>{if(!finished)finish(new Error('Codex hook inspection ended early'));});
  child.stderr.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2*1024*1024)finish(new Error('Codex hook inspection output exceeded limit'));});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{
   if(finished)return;bytes+=Buffer.byteLength(chunk);if(bytes>2*1024*1024){finish(new Error('Codex hook inspection output exceeded limit'));return;}
   buffer+=chunk;let end:number;
   while((end=buffer.indexOf('\n'))>=0&&!finished){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
    let message:{id?:unknown;error?:unknown;result?:unknown};try{const parsed:unknown=JSON.parse(line);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid response');message=parsed;}catch{finish(new Error('Invalid Codex hook response'));return;}
    if(message.id===1){if(message.error){finish(new Error('Codex hook inspection unsupported'));return;}send({method:'initialized',params:{}});send({id:2,method:'hooks/list',params:{cwds:[root]}});}
    if(message.id===2)finish(message.error?new Error('Codex hook inspection unavailable'):null,message.result);
   }
  });
  send({id:1,method:'initialize',params:{clientInfo:{name:'opencrawl_hook_status',version:'1'},capabilities:{experimentalApi:true}}});
 });
}
export async function inspectCodexHooks(root:string,query=nativeCodexHooks):Promise<CodexHookReview>{
 const before=snapshot(root);if(before.review.state==='not_applicable')return before.review;
 try {
  const value=await query(root),after=snapshot(root);
  if(after.bytes!==before.bytes||after.config!==before.config||!value||typeof value!=='object'||!('data' in value)||!Array.isArray(value.data))return before.review;
  const hooks:Record<string,unknown>[]=[];
  for(const entry of value.data){if(!entry||typeof entry!=='object'||!Array.isArray(entry.hooks)||!Array.isArray(entry.errors)||entry.errors.length)return before.review;
   for(const hook of entry.hooks)if(hook&&typeof hook==='object'&&typeof hook.sourcePath==='string'&&resolve(hook.sourcePath)===resolve(before.file)&&owned.has(hook.statusMessage))hooks.push(hook);
  }
  if(!before.keys.size||hooks.length!==before.keys.size||new Set(hooks.map(h=>h.key)).size!==before.keys.size||hooks.some(h=>!before.keys.has(String(h.key))||typeof h.enabled!=='boolean'||!['managed','trusted','untrusted','modified'].includes(String(h.trustStatus))))return before.review;
  return {state:'observed',total:hooks.length,pending:hooks.filter(h=>h.enabled&&['untrusted','modified'].includes(String(h.trustStatus))).length,disabled:hooks.filter(h=>!h.enabled).length};
 } catch {return before.review;}
}
export function codexHookReviewMessage(review:CodexHookReview):string|null{
 if(review.state==='unknown')return 'Codex hook trust could not be verified. Open /hooks (or desktop Settings > Hooks) to review OpenCrawl session capture and session startup; trust any new or changed definitions you approve, then start a new session.';
 if(review.disabled)return `${review.disabled} OpenCrawl hook${review.disabled===1?' is':'s are'} disabled in Codex. Review /hooks (or desktop Settings > Hooks); keep intentional opt-outs, or enable the hooks you want to use.`;
 return review.pending?`Codex will not run ${review.pending} OpenCrawl hook${review.pending===1?'':'s'} until you review and trust their current definitions: open /hooks (or desktop Settings > Hooks), review OpenCrawl session capture and session startup, then start a new session.`:null;
}
