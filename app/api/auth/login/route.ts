import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { setSession } from '@/lib/auth';
import { securityRateLimit } from '@/lib/security';
import { schedulingTransaction } from '@/lib/scheduling';
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
   if(!user?.active)return {status:401,error:'Invalid credentials'};
   if(user.requiresGodUnlock)return {status:423,error:'Account locked. God Mode must unlock it.',code:'GOD_UNLOCK_REQUIRED'};
   if(user.lockedUntil&&user.lockedUntil>new Date())return {status:423,error:'Account temporarily locked',code:'TEMPORARY_LOCK',retryAfter:Math.ceil((+user.lockedUntil-Date.now())/1000)};
   const log=async(action:string,details:unknown)=>tx.auditLog.create({data:{actorId:user.id,actorName:user.name,actorRole:user.role,action,entity:'session',entityId:user.id,details:JSON.stringify(details)}});
   if(!await compare(body.password,user.passwordHash)){
    const attempts=user.failedLoginAttempts+1;
    if(attempts>=5){
     const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     const locks=user.lockCountDate===today?user.dailyLockCount+1:1;const god=locks>=3;
     await tx.user.update({where:{id:user.id},data:{failedLoginAttempts:0,dailyLockCount:locks,lockCountDate:today,requiresGodUnlock:god,lockedUntil:god?null:new Date(Date.now()+600000),sessionVersion:{increment:1}}});
     await log('ACCOUNT_LOCKED',{locks,requiresGodUnlock:god});return {status:423,error:god?'God Mode unlock required':'Account locked for 10 minutes',code:god?'GOD_UNLOCK_REQUIRED':'TEMPORARY_LOCK',retryAfter:600};
    }
    await tx.user.update({where:{id:user.id},data:{failedLoginAttempts:attempts,lockedUntil:null}});await log('LOGIN_FAILED',{attempts});return {status:401,error:'Invalid credentials',remaining:5-attempts};
   }
   await tx.user.update({where:{id:user.id},data:{failedLoginAttempts:0,lockedUntil:null}});await log('LOGIN',{});return {status:200,userId:user.id,version:user.sessionVersion};
  });
  if(result.userId){await setSession(result.userId,result.version);return NextResponse.json({ok:true},{headers});}
  return NextResponse.json({error:result.error,code:result.code,remaining:result.remaining},{status:result.status,headers:{...headers,...(result.retryAfter?{'Retry-After':String(result.retryAfter)}:{})}});
 }catch{return NextResponse.json({error:'Login failed'},{status:500,headers});}
}
