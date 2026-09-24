import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
export async function POST(_request:Request,context:{params:Promise<{id:string}>}){
  const actor=await currentUser();
  if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(actor.role!=='GOD')return NextResponse.json({error:'Only God Mode can unlock accounts'},{status:403});
  const {id}=await context.params;
  const target=await prisma.user.findUnique({where:{id},select:{id:true,username:true}});
  if(!target)return NextResponse.json({error:'User not found'},{status:404});
  await prisma.user.update({where:{id},data:{failedLoginAttempts:0,lockedUntil:null,dailyLockCount:0,lockCountDate:null,requiresGodUnlock:false}});
  await audit(actor,'ACCOUNT_UNLOCKED','users',id,{username:target.username});
  return NextResponse.json({ok:true});
}
