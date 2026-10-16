import{request}from'./http';
export interface SheetsSyncStatus{configured:boolean;spreadsheetId:string|null;range:string|null;googleEmail:string|null;intervalMinutes:number;lastSyncedAt:string|null;lastImported:number;lastError:string|null;syncing:boolean}
export const googleSheetsApi={
 status:()=>request<SheetsSyncStatus>('/v1/integrations/google/status'),
 connectUrl:()=>request<{authUrl:string}>('/v1/integrations/google/connect-url',{method:'POST'}),
 saveSheet:(spreadsheetUrl:string,range?:string)=>request<{success:boolean;imported:number;spreadsheetTitle:string|null;range:string}>('/v1/integrations/google/sheet',{method:'POST',body:JSON.stringify({spreadsheetUrl,range})}),
 syncNow:()=>request<{success:boolean;imported:number;rowsRead:number;lastSyncedAt:string}>('/v1/integrations/google/sync-now',{method:'POST'}),
 disconnect:()=>request<{disconnected:boolean}>('/v1/integrations/google',{method:'DELETE'})
};
