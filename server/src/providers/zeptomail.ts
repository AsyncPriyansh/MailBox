import { SendMailClient } from 'zeptomail';
const apiKey=process.env.ZEPTOMAIL_API_KEY;const fromEmail=process.env.ZEPTOMAIL_FROM_EMAIL;const url=process.env.ZEPTOMAIL_URL||'https://api.zeptomail.in/v1.1/email';
export async function sendWithZeptoMail(input:{to:string;name:string;subject:string;html:string}){
 if(!apiKey||!fromEmail)throw new Error('ZeptoMail credentials and verified sender are required.');
 const client=new SendMailClient({url,token:apiKey});
 return client.sendMail({from:{address:fromEmail,name:process.env.ZEPTOMAIL_FROM_NAME||'Mailbpox'},to:[{email_address:{address:input.to,name:input.name}}],subject:input.subject,htmlbody:input.html});
}
