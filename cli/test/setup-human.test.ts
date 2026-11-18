import {test,expect} from 'bun:test';
test('saved setup destination cannot redirect an environment token',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
 const home=mkdtempSync(join(tmpdir(),'oc-setup-token-'));let requests=0;
 const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch:()=>{requests++;return Response.json({});}});
 try{
  const config=join(home,'opencrawl','capture');mkdirSync(config,{recursive:true});
  writeFileSync(join(config,'config.json'),JSON.stringify({schemaVersion:1,api:server.url.origin,owner:{tenantId:'fixture',userId:'fixture'},installationId:'fixture',harnesses:[],roots:{'claude-code':join(home,'claude'),codex:join(home,'codex')}}));
  const env:NodeJS.ProcessEnv={...process.env,OPENCRAWL_CONFIG_HOME:home,OPENCRAWL_TOKEN:'fixture-token',OPENCRAWL_NO_UPDATE:'1'};delete env.OPENCRAWL_API_URL;
  const child=Bun.spawn([process.execPath,resolve(import.meta.dir,'../src/cli.ts'),'setup','--json'],{env,stdin:'ignore',stdout:'pipe',stderr:'pipe'});
  const output=await new Response(child.stdout).text();const error=await new Response(child.stderr).text();
  expect(await child.exited).toBe(64);expect(output+error).toContain('TOKEN_DESTINATION_MISMATCH');expect(requests).toBe(0);
 }finally{server.stop(true);rmSync(home,{recursive:true,force:true});}
});
