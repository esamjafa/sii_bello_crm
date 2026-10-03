import { NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { setSession } from '@/lib/auth';
import { securityRateLimit } from '@/lib/security';
import { schedulingTransaction } from '@/lib/scheduling';
// Equal-cost password work for unknown/inactive identities. Never authenticates.
const dummyHash=hash('non-authenticating-placeholder',12);
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store, max-age=0',Pragma:'no-cache'};
 try{
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.username!=='string'||typeof body.password!=='string'||body.username.length>254||body.password.length>200)return NextResponse.json({error:'Invalid credentials'},{status:400,headers});
  const limit=await securityRateLimit({request,action:'LOGIN_ATTEMPT',identity:'login',windowMs:15*60*1000,maximum:30});
  if(!limit.allowed)return NextResponse.json({error:'Too many attempts'},{status:429,headers:{...headers,'Retry-After':String(limit.retryAfter)}});
  const identity=body.username.trim();
  const result=await schedulingTransaction(async tx=>{
   const user=await tx.user.findFirst({where:{OR:[{username:identity},{email:identity.toLowerCase()}]}});
   if(!user?.active){await compare(body.password,await dummyHash);return {status:401,error:'Invalid credentials'};}
   const validPassword=await compare(body.password,user.passwordHash);
   if(user.requiresGodUnlock)return validPassword?{status:423,error:'Account locked. God Mode must unlock it.',code:'GOD_UNLOCK_REQUIRED'}:{status:401,error:'Invalid credentials'};
   if(user.lockedUntil&&user.lockedUntil>new Date())return validPassword?{status:423,error:'Account temporarily locked',code:'TEMPORARY_LOCK',retryAfter:Math.ceil((+user.lockedUntil-Date.now())/1000)}:{status:401,error:'Invalid credentials'};
   const log=async(action:string,details:unknown)=>tx.auditLog.create({data:{actorId:user.id,actorName:user.name,actorRole:user.role,action,entity:'session',entityId:user.id,details:JSON.stringify(details)}});
   if(!validPassword){
    const attempts=user.failedLoginAttempts+1;
    if(attempts>=5){
     const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     const locks=user.lockCountDate===today?user.dailyLockCount+1:1;const god=locks>=3;
     await tx.user.update({where:{id:user.id},data:{failedLoginAttempts:0,dailyLockCount:locks,lockCountDate:today,requiresGodUnlock:god,lockedUntil:god?null:new Date(Date.now()+600000),sessionVersion:{increment:1}}});
     await log('ACCOUNT_LOCKED',{locks,requiresGodUnlock:god});return {status:401,error:'Invalid credentials'};
    }
    await tx.user.update({where:{id:user.id},data:{failedLoginAttempts:attempts,lockedUntil:null}});await log('LOGIN_FAILED',{attempts});return {status:401,error:'Invalid credentials'};
   }
   await tx.user.update({where:{id:user.id},data:{failedLoginAttempts:0,lockedUntil:null}});await log('LOGIN',{});return {status:200,userId:user.id,version:user.sessionVersion};
  });
  if(result.userId){await setSession(result.userId,result.version);return NextResponse.json({ok:true},{headers});}
  return NextResponse.json({error:result.error,code:result.code},{status:result.status,headers:{...headers,...(result.retryAfter?{'Retry-After':String(result.retryAfter)}:{})}});
 }catch{return NextResponse.json({error:'Login failed'},{status:500,headers});}
}
