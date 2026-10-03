import { NextResponse } from 'next/server';
import { clearSession, currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
export async function POST() {
 const user=await currentUser();
 if(user)await prisma.$transaction(async tx=>{
  // Revocation must persist before reporting logout success. This also signs
  // this account out on other devices, including copies of the same cookie.
  await tx.user.updateMany({where:{id:user.id,sessionVersion:user.sessionVersion},data:{sessionVersion:{increment:1}}});
  await tx.auditLog.create({data:{actorId:user.id,actorName:user.name,actorRole:user.role,action:'LOGOUT',entity:'session',entityId:user.id}});
 });
 await clearSession();return NextResponse.json({ok:true});
}
