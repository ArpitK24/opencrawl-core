import {existsSync,readFileSync,fstatSync,openSync,readSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inventory} from '../capture/backfill.ts';
import {captureDir,type CaptureConfig} from '../capture/runtime.ts';
import {atomicJson} from '../session.ts';
import {transcriptCheckpoint} from '../capture/transcript-checkpoint.ts';
import type {TranscriptHarness} from '../capture/parse.ts';
/** Snapshot byte boundaries, never parse or upload pre-consent conversation content. */
export function establishForwardBoundaries(config:CaptureConfig,harnesses:TranscriptHarness[]){
  for(const harness of harnesses)for(const file of inventory(config,harness).files){
    const stateFile=join(captureDir(),'state',createHash('sha256').update(harness+file.path).digest('hex')+'.json');
    const previous=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{};
    const fd=openSync(file.path,'r');
    try{
      const source=fstatSync(fd),last=Buffer.alloc(1);
      let partial=false,checkpoint:string|undefined;
      if(!file.path.endsWith('.zst')){if(source.size){readSync(fd,last,0,1,source.size-1);partial=last[0]!==10;}checkpoint=transcriptCheckpoint(fd,source.size);}
      atomicJson(stateFile,{offset:source.size,ino:source.ino,parserVersion:1,forwardBoundary:true,skipPartial:partial,...(checkpoint?{checkpoint}:{}),...(previous.ino===source.ino&&previous.meta?{meta:previous.meta}:{}),...(file.path.endsWith('.zst')?{archiveSize:source.size,archiveMtime:source.mtimeMs}: {})});
    }finally{closeSync(fd);}
  }
}
