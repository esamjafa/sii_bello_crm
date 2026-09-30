import { prisma } from './prisma';

async function record(serviceRequestId: string, channel: string, recipient: string, event: string, status: string, providerId?: string, error?: string) {
  await prisma.notificationLog.create({ data: { serviceRequestId, channel, recipient, event, status, providerId, error: error?.slice(0, 1000) } });
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
