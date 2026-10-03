import {NextResponse} from 'next/server';
import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {actorDepartments,allowed,customerScope} from '@/lib/crm-access';
import {recordAudit} from '@/lib/crm-server';
const input=z.object({customerId:z.string().min(1),purpose:z.enum(['MARKETING','PHOTO_PUBLICATION']),granted:z.boolean(),note:z.string().trim().min(3).max(500)}).strict();
async function customer(user:any,id:string){return prisma.customer.findFirst({where:{AND:[{id,archivedAt:null},customerScope(user)]},select:{id:true}});}
export async function GET(request:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:'سجلي الدخول'},{status:401});
 const id=new URL(request.url).searchParams.get('customerId')??'';
 if(!allowed(user,'notes')||!await customer(user,id))return NextResponse.json({error:'غير مصرح'},{status:403});
 const rows=await prisma.consentRecord.findMany({where:{customerId:id,...(!actorDepartments(user).includes('SALON')?{purpose:'MARKETING'}:{})},orderBy:[{recordedAt:'desc'},{id:'desc'}],take:100});
 return NextResponse.json({rows:rows.map(({actorId,...row})=>row)});
}
export async function POST(request:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:'سجلي الدخول'},{status:401});
 const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'اختاري نوع الموافقة وحالتها واكتبي مصدر الموافقة أو سبب سحبها'},{status:400});
 const body=parsed.data;
 if(!allowed(user,'notes',true)||body.purpose==='PHOTO_PUBLICATION'&&!actorDepartments(user).includes('SALON')||!await customer(user,body.customerId))return NextResponse.json({error:'غير مصرح'},{status:403});
 const row=await prisma.$transaction(async tx=>{const row=await tx.consentRecord.create({data:{...body,actorId:user.id}});await recordAudit(tx,user,'CONSENT_RECORDED','consents',row.id,null,{...body,recordedAt:row.recordedAt});return row;});
 return NextResponse.json({id:row.id,recordedAt:row.recordedAt});
}
