import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;
 const p=await prisma.product.findFirst({where:{id,onlineVisible:true,archivedAt:null,purpose:'SALE'},select:{imageBytes:true,imageMime:true}});
 if(!p?.imageBytes||!['image/png','image/jpeg','image/webp'].includes(p.imageMime??''))return new NextResponse(null,{status:404});
 return new NextResponse(new Uint8Array(p.imageBytes),{headers:{'Content-Type':p.imageMime!,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
}
