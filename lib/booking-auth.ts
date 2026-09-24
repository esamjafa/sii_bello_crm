import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
const cookieName='customer_booking_session';
function secret(){const value=process.env.SESSION_SECRET;if(!value||value.length<32)throw new Error('SESSION_SECRET must be at least 32 characters');return new TextEncoder().encode(value);}
export async function setBookingSession(customerId:string){const token=await new SignJWT({sub:customerId,scope:'customer_booking'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(secret());(await cookies()).set(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production'||process.env.FORCE_SECURE_COOKIES==='true',sameSite:'lax',path:'/',maxAge:86400});}
export async function bookingCustomerId(){try{const token=(await cookies()).get(cookieName)?.value;if(!token)return null;const {payload}=await jwtVerify(token,secret());return payload.scope==='customer_booking'&&typeof payload.sub==='string'?payload.sub:null;}catch{return null;}}
export async function clearBookingSession(){(await cookies()).delete(cookieName);}
