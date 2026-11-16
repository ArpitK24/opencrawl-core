import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {atomicJson,withSessionLock} from '../src/session.ts';
import {captureDir,readCaptureConfig,type CaptureConfig} from '../src/capture/runtime.ts';
import {upgradeCaptureDaemon} from '../src/capture/daemon-upgrade.ts';

async function fixture(run:(config:CaptureConfig)=>Promise<void>){
  const root=mkdtempSync(join(tmpdir(),'opencrawl-upgrade-test-')),previous=process.env.OPENCRAWL_CONFIG_HOME;
  process.env.OPENCRAWL_CONFIG_HOME=root;
  try{
    const config:CaptureConfig={schemaVersion:1,api:'http://127.0.0.1:1',installationId:'retained-installation',owner:{tenantId:'retained-tenant',userId:'retained-user'},installedAt:'2026-11-16T00:00:00Z',harnesses:['codex','cursor'],roots:{'claude-code':join(root,'claude'),codex:join(root,'codex'),cursor:join(root,'cursor')},command:[join(root,'opencrawl')]};
    atomicJson(join(captureDir(),'config.json'),config);await run(config);
  }finally{if(previous===undefined)delete process.env.OPENCRAWL_CONFIG_HOME;else process.env.OPENCRAWL_CONFIG_HOME=previous;rmSync(root,{recursive:true,force:true});}
}
const forbidden=async()=>{throw Error('Unexpected service installation');};
for(const changes of [{disabled:true},{authPending:true},{harnesses:[]},{hookOwnership:'plugin' as const}])test('upgrade preserves unselected profile '+JSON.stringify(changes),()=>fixture(async config=>{
  atomicJson(join(captureDir(),'config.json'),{...config,...changes});const before=readFileSync(join(captureDir(),'config.json'));
  expect(await upgradeCaptureDaemon({install:forbidden})).toEqual({state:'not-selected'});
  expect(readFileSync(join(captureDir(),'config.json'))).toEqual(before);
}));
test('upgrade preserves queued bytes, cursor and destination, and installs once',()=>fixture(async config=>{
  const retained=['queue/batch.json','state/cursor.json','sources/session.json'];
  for(const name of retained){const path=join(captureDir(),name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,'retained '+name);}
  let installs=0;const install=async(next:CaptureConfig)=>{installs++;expect(next).toEqual({...config,captureWorker:'daemon-v1'});return {supervised:true};};
  expect(await upgradeCaptureDaemon({install})).toEqual({state:'activated'});
  expect(await upgradeCaptureDaemon({install})).toEqual({state:'already-enabled'});
  expect(installs).toBe(1);
  for(const name of retained)expect(readFileSync(join(captureDir(),name),'utf8')).toBe('retained '+name);
}));
test('upgrade waits for a legacy worker and pending notices without changing ingress',()=>fixture(async config=>{
  await withSessionLock('capture:worker',async()=>{expect(await upgradeCaptureDaemon({install:forbidden})).toEqual({state:'busy'});});
  const notice=join(captureDir(),'notices','pending.json');mkdirSync(dirname(notice),{recursive:true});writeFileSync(notice,'retained notice');
  expect(await upgradeCaptureDaemon({install:forbidden})).toEqual({state:'legacy-pending'});
  expect(readCaptureConfig()).toEqual(config);expect(readFileSync(notice,'utf8')).toBe('retained notice');
  unlinkSync(notice);
  expect(await upgradeCaptureDaemon({install:async()=>({supervised:true})})).toEqual({state:'activated'});
}));
test('failed service installation retains accepted inbox and retries supervision',()=>fixture(async()=>{
  const inbox=join(captureDir(),'daemon','inbox','accepted.json');
  await expect(upgradeCaptureDaemon({install:async()=>{mkdirSync(dirname(inbox),{recursive:true});writeFileSync(inbox,'accepted during install');throw Error('supervisor unavailable');}})).rejects.toThrow('supervisor unavailable');
  expect(readCaptureConfig()?.captureWorker).toBe('daemon-v1');
  expect(existsSync(join(captureDir(),'daemon','upgrade.json'))).toBe(false);
  expect(await upgradeCaptureDaemon({install:async()=>({supervised:false})})).toEqual({state:'supervision-required'});
  expect(await upgradeCaptureDaemon({install:async()=>({supervised:true})})).toEqual({state:'activated'});
  expect(readFileSync(inbox,'utf8')).toBe('accepted during install');
}));
test('service startup releases configuration lock and never certifies a changed destination',()=>fixture(async config=>{
  expect(await upgradeCaptureDaemon({install:async()=>{
    await withSessionLock('capture:configuration',async()=>{
      atomicJson(join(captureDir(),'config.json'),{...config,disabled:true});
    },0);
    return {supervised:true};
  }})).toEqual({state:'busy'});
  expect(readCaptureConfig()).toEqual({...config,disabled:true});
  expect(existsSync(join(captureDir(),'daemon','upgrade.json'))).toBe(false);
}));
