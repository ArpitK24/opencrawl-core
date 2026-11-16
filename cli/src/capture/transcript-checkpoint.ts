import {readSync} from 'node:fs';
import {createHash} from 'node:crypto';

/** Bounded fingerprint immediately before a saved byte boundary. Never parse
 * pre-consent messages or read the whole transcript to detect a rewritten tail. */
export function transcriptCheckpoint(fd:number,end:number) {
  const bytes=Buffer.alloc(Math.min(end,1024)),count=readSync(fd,bytes,0,bytes.length,end-bytes.length);
  return createHash('sha256').update(bytes.subarray(0,count)).digest('hex');
}
