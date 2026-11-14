import {commandForSelf} from '../capture/runtime.ts';

// Preserve the managed launcher: it may carry a private installation's environment.
// Windows handoffs use PowerShell; POSIX handoffs work in sh, bash and zsh.
export function formatSetupCommand(args:string[],command=commandForSelf(),platform=process.platform):string{
 const literal=(value:string)=>"'"+value.replaceAll("'",platform==='win32'?"''":"'\\''")+"'";
 const safe=platform==='win32'?/^[A-Za-z0-9_./:-]+$/:/^[A-Za-z0-9_@%+=:,./-]+$/;
 const words=[...command,...args].map((value,index)=>platform==='win32'&&index===0?literal(value):safe.test(value)?value:literal(value));
 return (platform==='win32'?'& ':'')+words.join(' ');
}
