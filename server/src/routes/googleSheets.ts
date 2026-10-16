import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { supabase } from '../supabase.js';
import { decryptToken, encryptToken, googleOAuthClient, googleSpreadsheetId } from '../services/googleOAuth.js';
import { getSheetsSyncStatus, syncWorkspaceSheet } from '../services/googleSheets.js';

const oauthStates=new Map<string,{workspaceId:string;expires:number}>();
const sheetSchema=z.object({spreadsheetUrl:z.string().min(1).max(2048),range:z.string().trim().min(1).max(300).optional()});

export async function registerGoogleSheetsRoutes(app:FastifyInstance){
 app.post('/v1/integrations/google/connect-url',async(req,reply)=>{try{const client=googleOAuthClient();const state=randomUUID();oauthStates.set(state,{workspaceId:req.workspaceId,expires:Date.now()+10*60_000});const authUrl=client.generateAuthUrl({access_type:'offline',include_granted_scopes:true,prompt:'consent',scope:['openid','email','https://www.googleapis.com/auth/spreadsheets.readonly'],state});return{authUrl};}catch(error){return reply.code(503).send({error:error instanceof Error?error.message:'Google connection is unavailable.'});}});

 app.get('/v1/integrations/google/callback',async(req:any,reply)=>{
  const base=(process.env.CLIENT_ORIGIN||'http://localhost:5173').split(',')[0].trim();const redirect=(name:string)=>reply.redirect(`${base}/?${name}`);
  if(req.query.error)return redirect('google=cancelled');
  const state=String(req.query.state||'');const stateData=oauthStates.get(state);oauthStates.delete(state);const workspaceId=stateData&&stateData.expires>Date.now()?stateData.workspaceId:null;const code=String(req.query.code||'');if(!workspaceId||!code||!supabase)return redirect('google=error');
  try{
   const client=googleOAuthClient();const {tokens}=await client.getToken(code);if(!tokens.refresh_token)throw new Error('Google did not return offline access. Disconnect and reconnect, then approve access.');
   client.setCredentials(tokens);const oauth2=google.oauth2({version:'v2',auth:client});const profile=await oauth2.userinfo.get();const email=profile.data.email;if(!email)throw new Error('Google did not return an email address.');
   const {error}=await supabase.from('google_sheet_connections').upsert({workspace_id:workspaceId,google_email:email,encrypted_refresh_token:encryptToken(tokens.refresh_token),spreadsheet_id:null,spreadsheet_title:null,sheet_range:'Leads!A1:Z5000',connected_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'workspace_id'});if(error)throw error;
   return redirect('google=connected');
  }catch(error){app.log.error(error,'Google OAuth callback failed');return redirect('google=error');}
 });

 app.get('/v1/integrations/google/status',async(req)=>getSheetsSyncStatus(req.workspaceId));
 app.post('/v1/integrations/google/sheet',async(req,reply)=>{
  if(!supabase)return reply.code(503).send({error:'Supabase is not configured.'});const parsed=sheetSchema.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Paste a valid Google Sheets link and optional tab range.'});
  try {
    const spreadsheetId = googleSpreadsheetId(parsed.data.spreadsheetUrl);
    const current = await supabase.from('google_sheet_connections').select('google_email,encrypted_refresh_token').eq('workspace_id', req.workspaceId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return reply.code(400).send({ error: 'Connect your Google account first.' });
    const client = googleOAuthClient();
    client.setCredentials({ refresh_token: decryptToken(current.data.encrypted_refresh_token) });
    const sheets = google.sheets({ version: 'v4', auth: client });
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'spreadsheetId,properties.title,sheets(properties(title))' });
    const titles = (meta.data.sheets || []).map(s => s.properties?.title).filter((t): t is string => Boolean(t));
    let range = (parsed.data.range || '').trim();
    if (!range) {
      range = `${titles[0] || 'Sheet1'}!A1:Z5000`;
    } else if (range.includes('!')) {
      const [tab, cells] = range.split('!');
      const cleanTab = tab.replace(/^['"]|['"]$/g, '');
      if (!titles.includes(cleanTab) && titles.length > 0) {
        range = `${titles[0]}!${cells || 'A1:Z5000'}`;
      }
    } else {
      range = `${titles[0] || 'Sheet1'}!${range}`;
    }
    const check = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    if (!check.data.values?.length) throw new Error(`The range ${range} is empty. Make sure row 1 has headers and your sheet has data.`);
    const { error } = await supabase.from('google_sheet_connections').update({
      spreadsheet_id: spreadsheetId,
      spreadsheet_title: meta.data.properties?.title || null,
      sheet_range: range,
      updated_at: new Date().toISOString()
    }).eq('workspace_id', req.workspaceId);
    if (error) throw error;
    const synced = await syncWorkspaceSheet(req.workspaceId);
    return { ...synced, spreadsheetTitle: meta.data.properties?.title || null, range };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not connect this spreadsheet.' });
  }
 });
 app.post('/v1/integrations/google/sync-now',async(req,reply)=>{try{return await syncWorkspaceSheet(req.workspaceId);}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:'Google Sheets sync failed.'});}});
 app.delete('/v1/integrations/google',async(req,reply)=>{
  if(!supabase)return reply.code(503).send({error:'Supabase is not configured.'});
  const {error}=await supabase.from('google_sheet_connections').delete().eq('workspace_id',req.workspaceId);
  if(error)throw error;
  try {
    await supabase.from('integration_sync_state').delete().eq('workspace_id',req.workspaceId).eq('integration','google_sheets');
  } catch {}
  return { disconnected: true };
 });

  app.post('/v1/integrations/google/sync-trigger', async (req, reply) => {
    const token = req.headers['x-sync-token'];
    if (!token || token !== process.env.SHEETS_SYNC_TOKEN) {
      return reply.code(401).send({ error: 'Invalid sync token' });
    }
    const workspaceId = process.env.MAILBPOX_WORKSPACE_ID;
    if (!workspaceId) return reply.code(500).send({ error: 'Workspace not configured' });
    try {
      const result = await syncWorkspaceSheet(workspaceId);
      return { success: true, imported: result.imported, syncedAt: result.lastSyncedAt };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Sync failed' });
    }
  });
}

