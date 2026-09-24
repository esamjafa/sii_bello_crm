import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
export async function GET() {
  const user=await currentUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if (user.role !== 'GOD') return NextResponse.json({error:'God Mode only'},{status:403});
  const [auditLogs,notificationLogs]=await Promise.all([
    prisma.auditLog.findMany({orderBy:{createdAt:'desc'},take:1000}),
    prisma.notificationLog.findMany({orderBy:{createdAt:'desc'},take:500})
  ]);
  return NextResponse.json({auditLogs,notificationLogs});
}
