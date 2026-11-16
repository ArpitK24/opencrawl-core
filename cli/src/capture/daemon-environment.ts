import {CliError} from '../oauth.ts';
import {isAbsolute} from 'node:path';

/** OS supervisors can start the executable directly without a resident shell
 * just to set its profile. Only these non-secret directory settings are accepted. */
export function applyDaemonEnvironment(args:string[]) {
  const index=args.findIndex(arg=>arg==='--worker-environment'||arg.startsWith('--worker-environment='));
  if(index<0)return;
  if(args[0]!=='collect'||args[1]!=='daemon')throw new CliError('INVALID_USAGE','Worker environment applies only to collect daemon.',64);
  const value=args[index]!.includes('=')?args[index]!.slice('--worker-environment='.length):args[index+1];
  let environment:unknown;try{if(!value||value.length>32768)throw Error();environment=JSON.parse(value);}catch{throw new CliError('INVALID_USAGE','Invalid worker environment.',64);}
  if(!environment||typeof environment!=='object'||Array.isArray(environment)||Object.entries(environment).some(([key,value])=>!['OPENCRAWL_CONFIG_HOME','OPENCRAWL_NO_UPDATE','XDG_CACHE_HOME','XDG_DATA_HOME'].includes(key)||typeof value!=='string'||value.includes('\0')))
    throw new CliError('INVALID_USAGE','Invalid worker environment.',64);
  if(Object.entries(environment).some(([key,value])=>key!=='OPENCRAWL_NO_UPDATE'&&!isAbsolute(value as string)))throw new CliError('INVALID_USAGE','Worker directories must be absolute paths.',64);
  Object.assign(process.env,environment);process.env.OPENCRAWL_NO_UPDATE='1';
}
