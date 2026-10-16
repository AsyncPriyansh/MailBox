import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { requireWorkspace } from './middleware/auth.js';
import { registerLeadRoutes } from './routes/leads.js';
import { registerCampaignRoutes } from './routes/campaigns.js';
import { registerSheetWebhook } from './routes/webhooks.js';
import { registerGoogleSheetsRoutes } from './routes/googleSheets.js';
import { startGoogleSheetsSyncScheduler } from './services/googleSheets.js';
import { registerTemplateRoutes } from './routes/templates.js';

const app = Fastify({ logger: true });
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, defaultDone) => {
  if (typeof body !== 'string' || body.trim() === '') {
    defaultDone(null, {});
    return;
  }
  try {
    defaultDone(null, JSON.parse(body));
  } catch (err) {
    defaultDone(err as Error, undefined);
  }
});
await app.register(cors,{origin:process.env.CLIENT_ORIGIN?.split(',')||true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','X-Sync-Token','X-Workspace-Id']});
app.addHook('preHandler',async(req,reply)=>{
  const path=req.url.split('?')[0];
  if(req.method==='OPTIONS'||path==='/health'||path==='/v1/integrations/google/callback'||path==='/v1/integrations/google-sheets/sync'||path==='/v1/integrations/google/sync-trigger')return;
  return requireWorkspace(req,reply);
});
app.get('/health',async()=>({status:'healthy',service:'mailbpox-api'}));
await registerLeadRoutes(app);await registerCampaignRoutes(app);await registerTemplateRoutes(app);await registerSheetWebhook(app);await registerGoogleSheetsRoutes(app);
try{await import('./workers/campaignWorker.js');}catch(error){app.log.error(error,'Campaign worker failed to start');}
await startGoogleSheetsSyncScheduler(app.log);
const port=Number(process.env.PORT||5051);await app.listen({port,host:'0.0.0.0'});
