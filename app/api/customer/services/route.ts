import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
export async function GET(){const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});if(user.role!=='CUSTOMER')return NextResponse.json({error:'Forbidden'},{status:403});return NextResponse.json(await prisma.service.findMany({where:{active:true},select:{id:true,name:true,price:true,durationMinutes:true},orderBy:{name:'asc'}}));}
