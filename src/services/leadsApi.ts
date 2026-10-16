import type {Lead} from '../types/domain';import {request} from './http';
export interface LeadImportRow{email:string;name?:string;phone?:string;company?:string;campaign?:string;source?:string}
export const leadsApi={list:()=>request<{leads:Lead[]}>('/v1/leads'),importRows:(rows:LeadImportRow[])=>request<{imported:number}>('/v1/leads/import',{method:'POST',body:JSON.stringify({rows})})};
