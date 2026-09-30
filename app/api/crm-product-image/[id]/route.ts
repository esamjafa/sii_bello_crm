import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { allowed } from '@/lib/crm-access';
import { recordAudit } from '@/lib/crm-server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return new Response(null,{status:401});if(!allowed(user,'products'))return new Response(null,{status:403});
 const {id}=await params;const product=await prisma.product.findUnique({where:{id},select:{imageBytes:true,imageMime:true}});
 if(!product?.imageBytes||!product.imageMime)return new Response(null,{status:404});
 return new Response(Buffer.from(product.imageBytes),{headers:{'Content-Type':product.imageMime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});if(!allowed(user,'products',true))return NextResponse.json({error:'Forbidden'},{status:403});
 try{
  const {id}=await params;const form=await request.formData();const file=form.get('file');if(!(file instanceof File)||file.size===0||file.size>2*1024*1024)return NextResponse.json({error:'صورة حتى 2 MB مطلوبة'},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());const valid=file.type==='image/png'&&Buffer.from(bytes.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))||file.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||file.type==='image/webp'&&Buffer.from(bytes.slice(0,4)).toString()==='RIFF'&&Buffer.from(bytes.slice(8,12)).toString()==='WEBP';
  if(!valid)return NextResponse.json({error:'صورة PNG أو JPEG أو WebP حقيقية مطلوبة'},{status:400});
  await prisma.$transaction(async tx=>{await tx.product.update({where:{id,archivedAt:null},data:{imageBytes:bytes,imageMime:file.type,imageUrl:`/api/crm-product-image/${id}`}});await recordAudit(tx,user,'IMAGE','products',id,null,{mimeType:file.type,size:file.size});});
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'تعذر رفع الصورة'},{status:400});}
}
