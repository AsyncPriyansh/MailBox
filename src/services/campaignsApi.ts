import type{Campaign}from'../types/domain';import{request}from'./http';
export interface CampaignInput{name:string;subject:string;html:string;leadIds:string[];audienceStatus?:'new'|'contacted'|'qualified'|'all'|'selected';scheduledAt?:string|null;templateId?:string|null}
export const campaignsApi={list:()=>request<{campaigns:Campaign[]}>('/v1/campaigns'),create:(input:CampaignInput)=>request<{campaignId:string;queued:number;scheduledRecipients:number;suppressed:number;scheduledAt:string|null}>('/v1/campaigns',{method:'POST',body:JSON.stringify(input)})};
export const dashboardApi={stats:()=>request<{stats:{totalLeads:number;newLeads:number;contactedLeads:number};recentCampaigns:Campaign[]}>('/v1/dashboard/stats')};
