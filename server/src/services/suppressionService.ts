import { supabase } from '../supabase.js';
export async function isSuppressed(email:string,workspaceId:string){if(!supabase)throw new Error('Supabase is not configured.');const {data,error}=await supabase.from('suppression_list').select('id').eq('workspace_id',workspaceId).ilike('email',email).limit(1);if(error)throw error;return Boolean(data?.length);}
