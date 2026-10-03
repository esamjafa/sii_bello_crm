import { prisma } from './prisma';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { createHash } from 'node:crypto';
const cookieName='customer_booking_session';
function secret(){const value=process.env.SESSION_SECRET;if(!value||value.length<32)throw new Error('SESSION_SECRET must be at least 32 characters');return new TextEncoder().encode(value);}
export async function setBookingSession(customerId:string){const token=await new SignJWT({sub:customerId,scope:'customer_booking'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(secret());(await cookies()).set(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production'||process.env.FORCE_SECURE_COOKIES==='true',sameSite:'lax',path:'/',maxAge:86400});}
const tokenId=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function bookingCustomerId(){try{const token=(await cookies()).get(cookieName)?.value;if(!token)return null;const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256']});if(payload.scope!=='customer_booking'||typeof payload.sub!=='string')return null;const revoked=await prisma.auditLog.findFirst({where:{action:'BOOKING_LOGOUT',entity:'booking-session',entityId:tokenId(token)},select:{id:true}});if(revoked)return null;const customer=await prisma.customer.findFirst({where:{id:payload.sub,archivedAt:null},select:{id:true}});return customer?.id??null;}catch{return null;}}
export async function clearBookingSession(){
 const jar=await cookies();const token=jar.get(cookieName)?.value;
 if(token){
  let valid=false;try{const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256']});valid=payload.scope==='customer_booking'&&typeof payload.sub==='string';}catch{}
  if(valid){const entityId=tokenId(token);if(!await prisma.auditLog.findFirst({where:{action:'BOOKING_LOGOUT',entity:'booking-session',entityId},select:{id:true}}))await prisma.auditLog.create({data:{actorName:'Customer',actorRole:'CUSTOMER_PHONE',action:'BOOKING_LOGOUT',entity:'booking-session',entityId}});}
 }
 jar.delete(cookieName);
}
