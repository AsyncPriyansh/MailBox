export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unsubscribed';
export interface Lead { id:string; name:string; email:string; phone:string|null; company:string|null; source:string; campaign:string|null; status:LeadStatus; createdAt:string; formName?:string|null; sourceLeadStatus?:string|null; }
export interface CampaignJob { campaignId:string; contactId:string; email:string; name:string; subject:string; html:string; }
