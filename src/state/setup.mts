import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {sessionScope} from '../sessions/event-identity.mjs';
import {validateSetupState,type SetupStateRecord,type SetupScope} from '../setup/state.mjs';
import type {ApplicationDatabase} from './postgres.mjs';

export interface SetupState {
  read(scope:SetupScope):Promise<{record:SetupStateRecord|null;version:string|null}>;
  save(scope:SetupScope,version:string|null,record:SetupStateRecord):Promise<boolean>;
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
/** The owner aggregate commits atomically, including firstWin and every client.
 * Scope is explicit; the installation namespace is bound by the database. */
export function createSetupState(database:ApplicationDatabase):SetupState&{ready():Promise<void>;importStatus(value:unknown):Promise<SetupStateRecord>} {
  const ns=database.namespace;let preparing:Promise<void>|undefined;
  async function read(scope:SetupScope){
    sessionScope(scope);const {rows}=await database.pool.query('SELECT record,revision FROM opencrawl_setup_status WHERE namespace=$1 AND tenant_id=$2 AND user_id=$3',[ns,scope.tenantId,scope.userId]);
    if(!rows[0])return {record:null,version:null};
    if(typeof rows[0].revision!=='string'||!uuid.test(rows[0].revision))throw new Error('Invalid setup storage revision');
    return {record:validateSetupState(rows[0].record,scope),version:rows[0].revision as string};
  }
  async function save(scope:SetupScope,version:string|null,input:SetupStateRecord){
    sessionScope(scope);if(version!==null&&!uuid.test(version))throw new Error('Invalid setup storage revision');
    const record=validateSetupState(input,scope),args=[ns,scope.tenantId,scope.userId,JSON.stringify(record),randomUUID()];
    const result=version===null?await database.pool.query('INSERT INTO opencrawl_setup_status(namespace,tenant_id,user_id,record,revision) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT DO NOTHING',args):
      await database.pool.query('UPDATE opencrawl_setup_status SET record=$4::jsonb,revision=$5 WHERE namespace=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$6',[...args,version]);
    return result.rowCount===1;
  }
  return {read,save,
    async ready(){preparing??=(async()=>{await database.ready();await database.transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('opencrawl:setup:schema',0))");
      await client.query(`CREATE TABLE IF NOT EXISTS opencrawl_setup_status(namespace text NOT NULL,tenant_id text NOT NULL,user_id text NOT NULL,record jsonb NOT NULL,revision uuid NOT NULL,PRIMARY KEY(namespace,tenant_id,user_id),CHECK((record->'scope'->>'tenantId') IS NOT NULL AND record->'scope'->>'tenantId'=tenant_id),CHECK((record->'scope'->>'userId') IS NOT NULL AND record->'scope'->>'userId'=user_id))`);
    });})().catch(error=>{preparing=undefined;throw error;});await preparing;},
    async importStatus(input:unknown){const record=validateSetupState(input);await save(record.scope,null,record);const target=(await read(record.scope)).record;
      if(!isDeepStrictEqual(target,record))throw new Error('Setup target differs from legacy state');return target!;},
  };
}
