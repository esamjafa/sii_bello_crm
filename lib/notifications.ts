import { prisma } from './prisma';

async function record(serviceRequestId: string, channel: string, recipient: string, event: string, status: string, providerId?: string, error?: string) {
  await prisma.notificationLog.create({ data: { serviceRequestId, channel, recipient, event, status, providerId, error: error?.slice(0, 1000) } });
}

export async function sendWhatsApp(serviceRequestId: string, recipient: string, event: string, template: string, parameters: string[]) {
  const token=process.env.WHATSAPP_ACCESS_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !recipient) { await record(serviceRequestId,'WHATSAPP',recipient||'missing',event,'SKIPPED',undefined,'WhatsApp environment variables or recipient missing'); return { status: 'SKIPPED' as const }; }
  try {
    const response=await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:recipient.replace(/[^0-9]/g,''),type:'template',template:{name:template,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en'},components:[{type:'body',parameters:parameters.map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(10000)});
    const body=await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    await record(serviceRequestId,'WHATSAPP',recipient,event,'SENT',body.messages?.[0]?.id);
    return { status: 'SENT' as const };
  } catch(error) { await record(serviceRequestId,'WHATSAPP',recipient,event,'FAILED',undefined,error instanceof Error?error.message:'Send failed'); return { status: 'FAILED' as const }; }
}

export async function sendEmail(serviceRequestId: string, recipient: string, event: string, subject: string, text: string) {
  const token=process.env.RESEND_API_KEY, from=process.env.EMAIL_FROM;
  if (!token || !from || !recipient) { await record(serviceRequestId,'EMAIL',recipient||'missing',event,'SKIPPED',undefined,'Email environment variables or recipient missing'); return; }
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':`${event}/${serviceRequestId}`},body:JSON.stringify({from,to:[recipient],subject,text}),signal:AbortSignal.timeout(10000)});
    const body=await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    await record(serviceRequestId,'EMAIL',recipient,event,'SENT',body.id);
  } catch(error) { await record(serviceRequestId,'EMAIL',recipient,event,'FAILED',undefined,error instanceof Error?error.message:'Send failed'); }
}
