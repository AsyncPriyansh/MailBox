export type LeadStatus='new'|'contacted'|'qualified'|'unsubscribed';
export interface Lead{id:string;name:string;email:string;phone:string|null;company:string|null;source:string;campaign:string|null;status:LeadStatus;createdAt:string;welcomeEmailStatus?:string|null;welcomeEmailAt?:string|null;formName?:string|null;sourceLeadStatus?:string|null}
export interface Campaign{id:string;name:string;subject:string;status:string;recipient_count:number;sent_count:number;created_at:string;scheduled_at:string|null;template_id?:string|null;html_source?:string|null}
