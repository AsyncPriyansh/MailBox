import type { FastifyBaseLogger } from 'fastify';
import { google } from 'googleapis';
import { supabase } from '../supabase.js';
import { upsertLeads } from './leadRepository.js';
import { decryptToken, googleOAuthClient } from './googleOAuth.js';

export interface SheetsSyncStatus {
  configured: boolean;
  spreadsheetId: string | null;
  spreadsheetTitle: string | null;
  spreadsheetUrl: string | null;
  range: string | null;
  googleEmail: string | null;
  intervalMinutes: number;
  lastSyncedAt: string | null;
  lastImported: number;
  lastError: string | null;
  syncing: boolean;
}
const intervalMinutes=()=>{const n=Number(process.env.GOOGLE_SHEETS_SYNC_INTERVAL_MINUTES||5);return Number.isFinite(n)?Math.min(1440,Math.max(1,n)):5;};
const activeSyncs=new Set<string>();

function normalizeHeader(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function mapRows(values:unknown[][]){
 if(values.length<2)return[];
 const headers=values[0].map(value=>normalizeHeader(String(value??'')));
 const find=(...aliases:string[])=>{for(const alias of aliases){const at=headers.findIndex(header=>header===alias);if(at>=0)return at;}return-1;};
 const email=find('email','e_mail');if(email<0)throw new Error('The selected tab needs an Email column in the first row.');
 const name=find('full_name','name','contact_name'),first=find('first_name'),last=find('last_name'),phone=find('phone_number','phone','mobile','telephone'),company=find('company','business'),campaign=find('campaign_name','campaign'),formName=find('form_name'),leadStatus=find('lead_status');
 const cell=(row:unknown[],at:number)=>at>=0?String(row[at]??'').trim():'';
 return values.slice(1).filter(row=>cell(row,email).includes('@')).map(row=>({email:cell(row,email),name:name>=0?cell(row,name):[cell(row,first),cell(row,last)].filter(Boolean).join(' '),phone:cell(row,phone).replace(/^p:/i,'')||undefined,company:cell(row,company)||undefined,campaign:cell(row,campaign)||undefined,formName:cell(row,formName)||undefined,sourceLeadStatus:cell(row,leadStatus)||undefined,source:'Meta Lead Ads (Google Sheets)'}));
}

async function connection(workspaceId:string){
 if(!supabase)throw new Error('Supabase is not configured.');
 const {data,error}=await supabase.from('google_sheet_connections').select('workspace_id,google_email,encrypted_refresh_token,spreadsheet_id,spreadsheet_title,sheet_range').eq('workspace_id',workspaceId).maybeSingle();
 if(error)throw error;if(!data)throw new Error('Connect Google and choose a spreadsheet first.');return data;
}

async function saveSyncState(workspaceId:string,state:{lastSyncedAt?:string;lastImported?:number;lastError?:string|null}){
 if(!supabase)return;
 try{
  const {error}=await supabase.from('integration_sync_state').upsert({workspace_id:workspaceId,integration:'google_sheets',last_synced_at:state.lastSyncedAt,last_imported:state.lastImported,last_error:state.lastError,updated_at:new Date().toISOString()},{onConflict:'workspace_id,integration'});
  if(error && (error as any).code !== 'PGRST205') throw error;
 }catch(err:any){
  if(err?.code !== 'PGRST205') throw err;
 }
}                                        

export async function getSheetsSyncStatus(workspaceId:string):Promise<SheetsSyncStatus>{
 if(!supabase)throw new Error('Supabase is not configured.');
 const {data:connectionRow,error}=await supabase.from('google_sheet_connections').select('google_email,spreadsheet_id,spreadsheet_title,sheet_range').eq('workspace_id',workspaceId).maybeSingle();
 if(error)throw error;
 let state: { last_synced_at: string | null; last_imported: number; last_error: string | null } | null = null;
 try {
  const { data, error: stateError } = await supabase.from('integration_sync_state').select('last_synced_at,last_imported,last_error').eq('workspace_id',workspaceId).eq('integration','google_sheets').maybeSingle();
  if(!stateError) state = data;
 } catch {}
 const spreadsheetId = connectionRow?.spreadsheet_id || null;
 const spreadsheetTitle = connectionRow?.spreadsheet_title || null;
 const spreadsheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null;
 return {
   configured: Boolean(spreadsheetId),
   spreadsheetId,
   spreadsheetTitle,
   spreadsheetUrl,
   range: connectionRow?.sheet_range || null,
   googleEmail: connectionRow?.google_email || null,
   intervalMinutes: intervalMinutes(),
   lastSyncedAt: state?.last_synced_at || null,
   lastImported: state?.last_imported || 0,
   lastError: state?.last_error || null,
   syncing: activeSyncs.has(workspaceId)
 };
}

export async function syncWorkspaceSheet(workspaceId:string){
 if(activeSyncs.has(workspaceId))return{success:true,imported:0,rowsRead:0,lastSyncedAt:new Date().toISOString(),alreadySyncing:true};
 activeSyncs.add(workspaceId);
 try{
  const stored=await connection(workspaceId);if(!stored.spreadsheet_id)throw new Error('Paste your spreadsheet link to finish setup.');
  const oauth=googleOAuthClient();oauth.setCredentials({refresh_token:decryptToken(stored.encrypted_refresh_token)});
  const sheets=google.sheets({version:'v4',auth:oauth});
  const response=await sheets.spreadsheets.values.get({spreadsheetId:stored.spreadsheet_id,range:stored.sheet_range||'Leads!A1:Z5000'});
  const values=(response.data.values||[]) as unknown[][];if(values.length>5001)throw new Error('The configured range exceeds 5,000 data rows. Narrow it and sync again.');
  const leads=mapRows(values);const result=await upsertLeads(leads,workspaceId);const timestamp=new Date().toISOString();await saveSyncState(workspaceId,{lastSyncedAt:timestamp,lastImported:result.imported,lastError:null});
  return{success:true,imported:result.imported,rowsRead:Math.max(0,values.length-1),lastSyncedAt:timestamp};
 }catch(error){try{await saveSyncState(workspaceId,{lastError:error instanceof Error?error.message:'Google Sheets sync failed.'});}catch{}throw error;}finally{activeSyncs.delete(workspaceId);}
}

export async function startGoogleSheetsSyncScheduler(logger:FastifyBaseLogger){
 if(!supabase){logger.warn('Supabase is not configured; Google Sheets scheduler is disabled.');return;}
 const run=async()=>{
  const {data,error}=await supabase!.from('google_sheet_connections').select('workspace_id').not('spreadsheet_id','is',null);
  if(error){logger.error(error,'Unable to load Google Sheets connections');return;}
  for(const row of data||[])void syncWorkspaceSheet(row.workspace_id).then(result=>logger.info({workspaceId:row.workspace_id,imported:result.imported},'Google Sheet synced')).catch(err=>logger.error({workspaceId:row.workspace_id,error:err},'Google Sheets sync failed'));
 };
 const initial=setTimeout(()=>void run(),5000);initial.unref?.();
 const timer=setInterval(()=>void run(),intervalMinutes()*60_000);timer.unref?.();
 logger.info({intervalMinutes:intervalMinutes()},'Workspace Google Sheets scheduler started');
}
