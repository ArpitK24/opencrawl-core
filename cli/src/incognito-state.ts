import {createHash} from 'node:crypto';
import {statSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {configDir} from './session.ts';

export type PrivacyOwner={api:string;owner:{tenantId:string;userId:string}};
export type PrivateSession={harness:string;sessionId:string};
const hash=(values:string[])=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
export const privacyRoot=(config:PrivacyOwner)=>join(configDir(),'capture','incognito',hash([config.api,config.owner.tenantId,config.owner.userId]));
export const privacyKey=({harness,sessionId}:PrivateSession)=>hash([harness,sessionId])+'.json';

function present(path:string){
  try{statSync(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
}

export function sessionPrivate(config:PrivacyOwner,session:PrivateSession){
  const root=privacyRoot(config),key=privacyKey(session);
  // Acceptance renames pending to accepted. Read in that order across the rename.
  return present(join(root,'pending',key))||present(join(root,'accepted',key));
}

export function pendingPrivacy(config:PrivacyOwner){
  const dir=join(privacyRoot(config),'pending');
  let files:string[];
  try{files=readdirSync(dir);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  return files.filter(file=>/^[a-f0-9]{64}\.json$/.test(file)).flatMap(file=>{
    let session:PrivateSession;
    try{session=JSON.parse(readFileSync(join(dir,file),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
    if(privacyKey(session)!==file)throw Error('Invalid incognito request');
    return [session];
  });
}
