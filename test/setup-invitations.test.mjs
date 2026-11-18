import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {createSetupHandler} from '../dist/src/setup/http.mjs';
import {teamService} from '../dist/src/identity/team.mjs';

test('setup invitations bind a fresh human admin and only create a member in the displayed workspace',async t=>{
  const user={id:'user_admin',email:'admin@example.test'},scope={tenantId:'org_A',userId:user.id};
  let active=true,role='admin';
  const writes=[];
  const team=teamService({userManagement:{
    listOrganizationMemberships:async()=>({data:[{userId:user.id,organizationId:scope.tenantId,status:active?'active':'inactive',role:{slug:role}}]}),
    sendInvitation:async options=>{writes.push(options);return {email:options.email};},
  }});
  const handler=createSetupHandler({setup:{},authenticate:async()=>{throw Error('Agent setup credentials cannot authorize invitations');},invitations:{
    identifyHuman:async auth=>auth==='Bearer human'?{status:200,user,principal:scope}:{status:401},
    team,organization:async id=>({id,name:'Example Team'}),delivery:'email',
  }});
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port+'/api/setup/invitations';
  const request=(body,auth='Bearer human',extra={})=>fetch(url,{method:body?'POST':'GET',headers:{authorization:auth,...extra},body:body&&JSON.stringify(body)});
  assert.deepEqual((await (await request()).json()).data,{scope,workspace:'Example Team',delivery:'email'});
  const input={...scope,email:'  Alice@example.test '};
  assert.equal((await request(input,'Bearer delegated')).status,401);
  assert.equal((await request(input,'Bearer human',{origin:'https://example.test'})).status,403);
  assert.equal((await request({...input,tenantId:'org_B'})).status,403);
  assert.equal((await request({...input,userId:'user_other'})).status,403);
  assert.equal((await request({...input,email:'bad'})).status,400);
  role='member';
  assert.equal((await request()).status,403);
  assert.equal((await request(input)).status,403);
  role='admin';active=false;
  assert.equal((await request(input)).status,403);
  assert.deepEqual(writes,[]);
  active=true;
  assert.deepEqual((await (await request(input)).json()).data,{created:true,delivery:'email'});
  assert.deepEqual(writes,[{email:'alice@example.test',organizationId:'org_A',inviterUserId:user.id,roleSlug:'member'}]);
});
