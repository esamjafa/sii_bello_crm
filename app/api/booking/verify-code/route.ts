import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { setBookingSession } from '@/lib/booking-auth';
import { securityRateLimit } from '@/lib/security';
import { normalizePhone } from '@/lib/phone';
import { schedulingTransaction } from '@/lib/scheduling';
const schema=z.object({phone:z.string().min(8).max(30),code:z.string().regex(/^\d{6}$/),name:z.string().trim().min(2).max(120)});
export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid details'},{status:400});
 let phone;try{phone=normalizePhone(parsed.data.phone);}catch{return NextResponse.json({error:'Invalid phone'},{status:400});}
 const limit=await securityRateLimit({request,action:'BOOKING_CODE_VERIFY',identity:'otp-verify',windowMs:15*60*1000,maximum:30});
 if(!limit.allowed)return NextResponse.json({error:'Too many attempts'},{status:429});
 const result=await schedulingTransaction(async tx=>{
  const verification=await tx.bookingVerification.findFirst({where:{phone,verifiedAt:null},orderBy:{createdAt:'desc'}});
  if(!verification||verification.expiresAt<new Date())return {error:'Code expired',status:400};
  if(verification.attempts>=5)return {error:'Too many attempts',status:423};
  if(!await compare(parsed.data.code,verification.codeHash)){await tx.bookingVerification.update({where:{id:verification.id},data:{attempts:{increment:1}}});return {error:'Incorrect code',status:401};}
  await tx.bookingVerification.update({where:{id:verification.id},data:{verifiedAt:new Date()}});
  const customer=await tx.customer.upsert({where:{phone},create:{phone,name:parsed.data.name},update:{}});
  if(customer.archivedAt)return {error:'Account unavailable',status:403};
  return {customer};
 });
 if('error' in result)return NextResponse.json({error:result.error},{status:result.status});
 await setBookingSession(result.customer.id);return NextResponse.json({ok:true,customer:{name:result.customer.name}});
}
