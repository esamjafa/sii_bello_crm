import {resolve} from 'node:path';
export async function verifyReferenceApi({req,check,db,users,customers,service,create}){
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await create('appointments',{customerId:customers.STAFF.id,serviceId:service.id,staffId:users.STAFF.staffId,startsAt:`${day}T09:00:00.000Z`,status:'CONFIRMED'});
 for(const section of ['salon','college','events']){
  const view=await req(`/api/crm/department-screen?section=${section}`);
  check(`Reference department screen API ${section}`,view.status===200&&view.data.cards.length===4&&Array.isArray(view.data.rows));
 }
 check('Reference screen requires authentication',(await req('/api/crm/department-screen?section=salon',{role:null})).status===401);
 check('College cannot access salon reference data',(await req('/api/crm/department-screen?section=salon',{role:'COLLEGE'})).status===403);
 check('Salon cannot access college reference data',(await req('/api/crm/department-screen?section=college',{role:'STAFF'})).status===403);
 const salon=(await req('/api/crm/department-screen?section=salon',{role:'STAFF'})).data;
 check('Salon reference screen contains assigned appointments only',salon.rows.length>0&&salon.rows.every(r=>r.staffId===users.STAFF.staffId));
 check('Reference screens do not leak financial access',salon.canFinance===false&&salon.rows.every(r=>!('invoiceId' in r)));
 const college=(await req('/api/crm/department-screen?section=college',{role:'COLLEGE'})).data;
 check('College reference screen keeps assigned customer scope',college.rows.every(r=>r.person?.name==='كلية مسندة'));
 const other=await db.event.findFirst({where:{managerId:null}});if(other){const event=(await req(`/api/crm/department-screen?section=events&eventId=${other.id}`,{role:'EVENT_MANAGER'})).data;check('Reference event selector cannot cross ownership',event.rows.length===0&&event.cards.every(c=>c.value===0));}
}
export async function verifyReferenceBrowser({browser,base,cookies,db,check,output}){
 for(const role of ['STAFF','COLLEGE','EVENT_MANAGER']){
  const section=role==='STAFF'?'salon':role==='COLLEGE'?'college':'events',title=role==='STAFF'?'الصالون':role==='COLLEGE'?'الكلية':'الإيفنتات';
  const context=await browser.newContext({viewport:{width:1585,height:992}});await context.addCookies([{name:'salon_session',value:cookies[role],domain:'localhost',path:'/'}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('navigation').getByRole('button',{name:title,exact:false}).click();await page.locator('.ref-main-table').waitFor();
  check(`Four reference metric cards ${role}`,await page.locator('.ref-metric').count()===4);
  check(`Reference sidebar plum ${role}`,await page.locator('.crm-sidebar').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(45, 25, 49)');
  check(`Reference primary action fuchsia ${role}`,await page.locator('.crm-global-add').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(230, 0, 120)');
  await page.locator('.ref-person').first().click();await page.getByRole('textbox',{name:'ملاحظة القسم',exact:true}).fill(`ملاحظة الشاشة ${role}`);await page.getByRole('button',{name:'حفظ الملاحظة والمرفق',exact:true}).click();await page.getByText('تم الحفظ في الملف',{exact:true}).waitFor();
  check(`Reference note saves in correct department ${role}`,await db.customerNote.count({where:{body:`ملاحظة الشاشة ${role}`,department:role==='STAFF'?'SALON':role==='COLLEGE'?'COLLEGE':'EVENT'}})===1);
  await page.screenshot({path:resolve(output,`reference-${section}-${role}.png`),fullPage:true});
  await page.getByRole('button',{name:'كل السجلات والخدمات',exact:true}).click();check(`Full resource lists remain reachable ${role}`,await page.locator('.crm-resource-browser').isVisible());
  check(`Reference browser has no runtime errors ${role}`,errors.length===0,errors);await context.close();
 }
}
