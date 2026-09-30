import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { actorDepartments, allowed, customerScope, financial, scope } from '@/lib/crm-access';
import { recordAudit } from '@/lib/crm-server';
export const dynamic='force-dynamic';
function matches(bytes:Uint8Array,type:string){
 if(type==='application/pdf')return Buffer.from(bytes.slice(0,5)).toString()==='%PDF-';
 if(type==='image/png')return Buffer.from(bytes.slice(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/webp')return Buffer.from(bytes.slice(0,4)).toString()==='RIFF'&&Buffer.from(bytes.slice(8,12)).toString()==='WEBP';
 return false;
}
export async function POST(request:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!allowed(user,'documents')||user.role==='VIEWER')return NextResponse.json({error:'Forbidden'},{status:403});
 try{
 const form=await request.formData();const customerId=form.get('customerId');const file=form.get('file');const category=String(form.get('category')??'DOCUMENT');
 const department=String(form.get('department')??(category==='RECEIPT'?'FINANCE':category==='WORK'?'COLLEGE':actorDepartments(user)[0]));
 const invoiceId=String(form.get('invoiceId')??'')||null;
 if(!actorDepartments(user).includes(department))return NextResponse.json({error:'القسم خارج صلاحيتك'},{status:403});
 if(category==='RECEIPT'&&(!financial(user)||department!=='FINANCE')||['BEFORE','AFTER'].includes(category)&&department!=='SALON'||category==='WORK'&&department!=='COLLEGE')return NextResponse.json({error:'نوع الملف غير متاح لهذا القسم أو الحساب'},{status:403});
 if(typeof customerId!=='string'||!(file instanceof File)||!['DOCUMENT','BEFORE','AFTER','WORK','RECEIPT'].includes(category))return NextResponse.json({error:'بيانات الملف غير صالحة'},{status:400});
 const customer=await prisma.customer.findFirst({where:{AND:[{id:customerId,archivedAt:null},customerScope(user)]}});
 if(!customer)return NextResponse.json({error:'Not found'},{status:404});
 if(invoiceId&&(!financial(user)||department!=='FINANCE'||!await prisma.invoice.findFirst({where:{id:invoiceId,customerId:customer.id,status:{not:'VOID'}}})))return NextResponse.json({error:'الفاتورة غير متاحة أو لا تتبع هذه العميلة'},{status:403});
 if(['BEFORE','AFTER'].includes(category)&&!customer.photoConsent)return NextResponse.json({error:'موافقة التصوير مطلوبة أولًا'},{status:400});
 if(file.size===0||file.size>4*1024*1024)return NextResponse.json({error:'الحد الأقصى 4 MB'},{status:400});
 const content=new Uint8Array(await file.arrayBuffer());if(!matches(content,file.type))return NextResponse.json({error:'يسمح بملفات PDF وPNG وJPEG وWebP حقيقية فقط'},{status:400});
 const document=await prisma.$transaction(async tx=>{const row=await tx.customerDocument.create({data:{customerId,department,invoiceId,filename:file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200),mimeType:file.type,content,category,authorId:user.id},select:{id:true,filename:true}});await recordAudit(tx,user,'UPLOAD','documents',row.id,null,{customerId,invoiceId,filename:row.filename,category,department});return row;});
 return NextResponse.json(document);
 }catch{return NextResponse.json({error:'تعذر رفع الملف'},{status:400});}
}
export async function GET(request:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!allowed(user,'documents'))return NextResponse.json({error:'Forbidden'},{status:403});
 const id=new URL(request.url).searchParams.get('id')??'';
 const doc=await prisma.customerDocument.findFirst({where:{AND:[{id},scope(user,'documents')]}});
 if(!doc)return NextResponse.json({error:'Not found'},{status:404});
 await recordAudit(prisma,user,'DOWNLOAD','documents',doc.id);
 const name=doc.filename.replace(/[\x00-\x1f\x7f"\\/]/g,'_');const fallback=name.replace(/[^\x20-\x7e]/g,'_');
 const encoded=encodeURIComponent(name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
 return new Response(Buffer.from(doc.content),{headers:{'Content-Type':doc.mimeType,'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
