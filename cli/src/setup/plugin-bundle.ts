import {createHash} from 'node:crypto';

export type BundleFiles=Record<string,string|Buffer>;
export const MAX_PLUGIN_TEXT=2_000_000;
export const MAX_PLUGIN_BINARY=160*1024*1024;
export const binaryPath=(name:unknown):name is string=>name==='bin/opencrawl-hook'||name==='bin/opencrawl-hook.exe';
export const fileHash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
export const binaryBundleDigest=(files:Record<string,string>,executable:string)=>fileHash(JSON.stringify({files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),executable})+'\n');
export function bundleManifest(files:BundleFiles,executable?:string){
 const hashes=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,fileHash(bytes)]));
 if(executable){
  if(!binaryPath(executable)||!Buffer.isBuffer(files[executable])||Object.entries(files).some(([name,bytes])=>Buffer.isBuffer(bytes)&&name!==executable))throw new Error('Invalid binary plugin inventory');
  return {schemaVersion:3,digest:binaryBundleDigest(hashes,executable),files:hashes,executable};
 }
 if(Object.values(files).some(Buffer.isBuffer))throw new Error('Binary plugin requires an executable inventory');
 return {schemaVersion:2,digest:fileHash(JSON.stringify(files,null,2)+'\n'),files:hashes};
}
