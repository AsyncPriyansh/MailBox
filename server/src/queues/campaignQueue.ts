import { Queue } from 'bullmq';import IORedis from 'ioredis';
const Redis=(IORedis as any).default||IORedis;
const connection=new Redis(process.env.REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:null});
export const campaignQueue=new Queue('mailbpox-campaigns',{connection,defaultJobOptions:{attempts:3,backoff:{type:'exponential',delay:5000},removeOnComplete:1000,removeOnFail:5000}});
