import { upsertLeads } from './leadRepository.js';

export interface SheetLeadRow { email:string; name?:string; phone?:string; company?:string; campaign?:string }


export async function syncMetaLeadSheet(rows:SheetLeadRow[],workspaceId:string){
 return upsertLeads(rows.map(row=>({...row,source:'Meta Lead Ads'})),workspaceId);
}
