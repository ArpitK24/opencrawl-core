import {existsSync,readFileSync,statSync,openSync,readSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inventory} from '../capture/backfill.ts';
import {captureDir,type CaptureConfig} from '../capture/runtime.ts';
import {atomicJson} from '../session.ts';
import type {TranscriptHarness} from '../capture/parse.ts';
/** Snapshot byte boundaries, never parse or upload pre-consent conversation content. */
export function establishForwardBoundaries(config:CaptureConfig,harnesses:TranscriptHarness[]){
  for(const harness of harnesses)for(const file of inventory(config,harness).files){
    const source=statSync(file.path),stateFile=join(captureDir(),'state',createHash('sha256').update(harness+file.path).digest('hex')+'.json');
    const previous=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{};
    let partial=false;
    if(source.size&&!file.path.endsWith('.zst')){const fd=openSync(file.path,'r'),last=Buffer.alloc(1);try{readSync(fd,last,0,1,source.size-1);partial=last[0]!==10;}finally{closeSync(fd);}}
    atomicJson(stateFile,{offset:source.size,ino:source.ino,parserVersion:1,forwardBoundary:true,skipPartial:partial,...(previous.ino===source.ino&&previous.meta?{meta:previous.meta}:{}),...(file.path.endsWith('.zst')?{archiveSize:source.size,archiveMtime:source.mtimeMs}: {})});
  }
}
