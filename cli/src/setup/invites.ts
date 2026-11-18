import {CliError} from '../oauth.ts';
import {setupRequest} from './api.ts';
import type {SetupScope} from './state.ts';
import type {SetupUi} from './tui.tsx';

export type InviteOptions = {workspace:string;delivery:'email'|'link';send:(email:string)=>Promise<void>};
const path='/api/setup/invitations';

export async function offerInvitations(scope:SetupScope, ui:Pick<SetupUi,'invite'|'signal'>) {
  // Older deployments and accounts without team access continue through setup.
  const info = await setupRequest(scope.api,path,undefined,fetch,4000).catch(()=>null) as
    {scope?:Partial<SetupScope>;workspace?:unknown;delivery?:unknown}|null;
  if (!info || info.scope?.tenantId !== scope.tenantId || info.scope?.userId !== scope.userId ||
      typeof info.workspace !== 'string' || !info.workspace || (info.delivery !== 'email' && info.delivery !== 'link') || ui.signal.aborted) return;
  const delivery=info.delivery;
  await ui.invite({workspace:info.workspace,delivery,send:async email=>{
    const receipt = await setupRequest(scope.api,path,{tenantId:scope.tenantId,userId:scope.userId,email}) as {created?:boolean;delivery?:string};
    if (receipt?.created !== true || receipt.delivery !== delivery) throw new CliError('INVITATION_UNCONFIRMED','Check Team settings before trying that address again.');
  }});
}
