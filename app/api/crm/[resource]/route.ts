import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { crm } from '@/lib/crm-config';
import { CrmError, appointmentAvailability, bookingOptions, customerOptions, customerProfile, dashboard, listRecords, mutateRecord } from '@/lib/crm-server';
import { SchedulingConflict } from '@/lib/scheduling';
import { sectionSummary } from '@/lib/crm-section-summary';
import { departmentScreen } from '@/lib/crm-department-screen';
import { customerCatalogue } from '@/lib/customer-catalogue';
export const dynamic='force-dynamic';
async function handle(request:Request,context:{params:Promise<{resource:string}>}){
 const user=await currentUser();if(!user)return NextResponse.json({error:'انتهت جلسة الدخول؛ سجّلي الدخول مجددًا ثم أعيدي المحاولة',code:'SESSION_EXPIRED'},{status:401});
 const {resource}=await context.params;
 try{
   const url=new URL(request.url);
   if(request.method==='GET'&&resource==='catalogue')return NextResponse.json(await customerCatalogue(user,url));
   if(request.method==='GET'&&resource==='department-screen')return NextResponse.json(await departmentScreen(user,url.searchParams.get('section')??'',url.searchParams.get('eventId')??''));
   if(request.method==='GET'&&['staff-options','service-options'].includes(resource))return NextResponse.json(await bookingOptions(user,resource,url));
   if(request.method==='GET'&&resource==='availability')return NextResponse.json(await appointmentAvailability(user,url));
   if(request.method==='GET'&&resource==='customer-options')return NextResponse.json(await customerOptions(user,url));
   if(request.method==='GET'&&resource==='section-summary')return NextResponse.json(await sectionSummary(user,url.searchParams.get('section')??'',url.searchParams.get('eventId')??''));
   if(request.method==='GET'&&resource==='dashboard')return NextResponse.json(await dashboard(user));
   if(request.method==='GET'&&resource==='profile')return NextResponse.json(await customerProfile(user,url.searchParams.get('id')??''));
   if(!Object.hasOwn(crm,resource))return NextResponse.json({error:'Not found'},{status:404});
   if(request.method==='GET')return NextResponse.json(await listRecords(user,resource,url));
   const raw=await request.text();if(Buffer.byteLength(raw)>65536)return NextResponse.json({error:'Request too large'},{status:413});
   let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
   return NextResponse.json(await mutateRecord(user,resource,body,request.method));
 }catch(e:any){
   if(e instanceof CrmError||e instanceof SchedulingConflict)return NextResponse.json({error:e.message},{status:e instanceof CrmError?e.status:409});
   if(e?.code==='P2002')return NextResponse.json({error:'السجل موجود بالفعل؛ تحققي من رقم الهاتف أو التسجيل'},{status:409});
   if(e?.code==='P2025')return NextResponse.json({error:'السجل المرتبط غير موجود'},{status:404});
   console.error('CRM request failed',e?.code??e?.name);
   return NextResponse.json({error:'تعذر حفظ البيانات؛ تحققي من الحقول وحاولي مجددًا'},{status:400});
 }
}
export const GET=handle;export const POST=handle;export const PATCH=handle;
export async function DELETE(){return NextResponse.json({error:'الحذف غير مسموح؛ استخدمي الأرشفة أو إلغاء الحركة مع السبب'},{status:405});}
