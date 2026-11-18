import type {IncomingMessage} from 'node:http';
import {smallJson} from '../application/http.mjs';
import {fail} from '../errors.mjs';
import type {HostedUser,Principal} from '../identity/types.mjs';
import type {teamService} from '../identity/team.mjs';

type Identity = {status:200;user:HostedUser;principal:Principal} | {status:401|403|503};
export interface SetupInvitations {
  identifyHuman: (authorization:string|undefined)=>Promise<Identity>;
  team: Pick<ReturnType<typeof teamService>,'requireAdmin'|'invite'>;
  organization: (id:string)=>Promise<{id:string;name:string}>;
  delivery: 'email'|'link';
}

export async function setupInvitation(req:IncomingMessage, services:SetupInvitations) {
  const input = req.method === 'POST' ? await smallJson(req) : undefined;
  // Resolve the first-party human session after the body is complete. Agent and
  // capture credentials used by other setup operations cannot administer a team.
  const identity = await services.identifyHuman(req.headers.authorization);
  if (identity.status !== 200) return fail(identity.status,'Human sign-in required');
  const {principal,user} = identity;
  if (principal.userId !== user.id || !principal.tenantId || principal.captureAccess !== undefined) return fail(403,'Human sign-in required');
  const {tenantId,userId} = principal;
  if (input) {
    // The displayed destination is a precondition. Only the identity selects it.
    if (input.tenantId !== tenantId || input.userId !== userId) return fail(403,'Workspace changed');
    await services.team.invite(user,tenantId,input.email);
    return {created:true,delivery:services.delivery};
  }
  await services.team.requireAdmin(user,tenantId);
  const org = await services.organization(tenantId);
  if (org.id !== tenantId) return fail(403,'Workspace changed');
  return {scope:{tenantId,userId},workspace:org.name || tenantId,delivery:services.delivery};
}
