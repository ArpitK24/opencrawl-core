import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration,plan} from './install.mts';
const root=dirname(fileURLToPath(import.meta.url));
const input={context:'test',url:'https://opencrawl.example.com',image:{tag:'sha-test'}};
test('installation plan bundles all resources and preserves independent external choices',()=>{
  const all=configuration(input);assert.equal(plan(all).steps.length,3);
  const mixed=configuration({...input,databases:{app:{mode:'external',existingSecret:'app-db'}},opensearch:{mode:'external',url:'https://search.test'}});
  assert.equal(mixed.databases.temporal.mode,'bundled');assert.equal(mixed.databases.airbyte.mode,'bundled');assert.equal(mixed.opensearch.mode,'external');
  const external=configuration({...input,postgresql:{enabled:false},databases:{app:{mode:'external',existingSecret:'app-db'}},temporal:{mode:'external',address:'temporal.test:7233'},opensearch:{mode:'external',url:'https://search.test'},objectStorage:{mode:'external',endpoint:'https://s3.test',bucket:'existing',existingSecret:'s3'},airbyte:{mode:'disabled'}});
  assert.equal(plan(external).steps.length,2);assert.equal(plan(external).steps[0].components?.postgresql,false);
});
test('invalid external modes, unsafe identifiers, incomplete credentials and wrong context fail before mutation',()=>{
  for(const patch of [{context:''},{temporal:{mode:'typo'}},{postgresql:{enabled:false}},{databases:{app:{name:'db;DROP DATABASE postgres'}}},{databases:{app:{mode:'external'}}},{opensearch:{mode:'external'}},{objectStorage:{mode:'external'}},{airbyte:{mode:'external'}},{unknown:true}])assert.throws(()=>configuration({...input,...patch}));
});
test('every infrastructure toggle combination renders and disabled resources disappear',()=>{
  const dir=mkdtempSync(join(tmpdir(),'opencrawl-chart-test-'));
  try{
    for(let mask=0;mask<16;mask++){
      const keys=['postgresql','temporal','opensearch','objectStorage'];
      const values:any={runtime:{enabled:false}};
      for(let i=0;i<keys.length;i++)values[keys[i]]={enabled:Boolean(mask&(1<<i)),existingSecret:'test'};
      values.postgresql.databases=[{name:'app',user:'app',passwordKey:'APP_DATABASE_PASSWORD'},{name:'temporal',user:'temporal',passwordKey:'TEMPORAL_DATABASE_PASSWORD'},{name:'temporal_visibility',user:'temporal',passwordKey:'TEMPORAL_DATABASE_PASSWORD'}];
      const path=join(dir,'values.json');writeFileSync(path,JSON.stringify(values));
      const p=spawnSync(process.env.HELM||'helm',['template','sample',join(root,'opencrawl'),'-f',path],{encoding:'utf8'});
      assert.equal(p.status,0,p.stderr);
      for(let i=0;i<keys.length;i++){const component=keys[i]==='objectStorage'?'s3':keys[i];assert.equal(p.stdout.includes('name: sample-'+component+'\n'),Boolean(mask&(1<<i)),`${mask}: ${component}`);}
      assert.ok(!p.stdout.includes('kind: Deployment\nmetadata:\n  name: sample-app'));
    }
  }finally{rmSync(dir,{recursive:true});}
});
test('application-only release renders with secret references and prevents SQL injection through Helm',()=>{
  const args=['template','sample',join(root,'opencrawl'),'--set','postgresql.enabled=false,temporal.enabled=false,opensearch.enabled=false,objectStorage.enabled=false,runtime.existingSecret=app-secrets,image.tag=sha-test'];
  const p=spawnSync(process.env.HELM||'helm',args,{encoding:'utf8'});assert.equal(p.status,0,p.stderr);
  assert.match(p.stdout,/name: sample-app\n/);assert.match(p.stdout,/name: sample-worker\n/);assert.ok(!p.stdout.includes('POSTGRES_PASSWORD'));
  const bad=spawnSync(process.env.HELM||'helm',['template','sample',join(root,'opencrawl'),'--set','runtime.enabled=false,postgresql.existingSecret=test,objectStorage.existingSecret=test,temporal.existingSecret=test','--set-string','postgresql.databases[0].name=bad;drop','--set','postgresql.databases[0].user=app,postgresql.databases[0].passwordKey=PASSWORD'],{encoding:'utf8'});assert.notEqual(bad.status,0);assert.match(bad.stderr,/pattern/);
});
