export async function verifyCategoryCatalogue({req,check,db,users,customers,create}){
 const config={areas:[],offers:[],variants:[{id:'short',name:'قص شعر قصير',kind:'CUT',hairLength:'SHORT',price:100},{id:'long',name:'قص شعر طويل',kind:'CUT',hairLength:'LONG',price:180},{id:'extensions',name:'وصلات سوداء 60 سم — 50 قطعة',kind:'EXTENSIONS',extensionColor:'أسود',extensionLength:60,extensionQuantity:50,price:500}]};
 const hair=await create('services',{name:'كتالوج شعر تجريبي',department:'HAIR',price:50,durationMinutes:60,configuration:config});
 const course=await create('collegeCourses',{title:'دورة كتالوج تجريبية',fee:1200,capacity:20,status:'OPEN',coordinatorId:users.COLLEGE.id,trainerId:users.TRAINER.id});
 const event=await create('events',{name:'إيفنت كتالوج تجريبي',currency:'AED',managerId:users.EVENT_MANAGER.id});
 const pack=await create('eventPackages',{eventId:event.id,name:'Standard',price:900});
 const catalogue=await req('/api/crm/catalogue');check('Admin catalogue includes all five major categories',['LASER','HAIR','NAILS','COLLEGE','EVENT'].every(c=>catalogue.data.categories.includes(c)));
 check('Catalogue connects actual courses and event packages',catalogue.data.rows.some(x=>x.id===course.id&&x.kind==='COLLEGE')&&catalogue.data.rows.some(x=>x.id===pack.id&&x.currency==='AED'));
 const staff=await req('/api/crm/catalogue',{role:'STAFF'});check('Staff catalogue excludes college and event data',staff.status===200&&staff.data.rows.every(x=>x.kind==='SERVICE')&&!staff.data.categories.includes('COLLEGE'));
 const college=await req('/api/crm/catalogue',{role:'COLLEGE'});check('College catalogue excludes salon and event data',college.data.categories.length===1&&college.data.categories[0]==='COLLEGE');
 const save=details=>req('/api/crm/customers',{method:'PATCH',body:{id:customers.ADMIN.id,servicePreferences:{services:[{serviceId:hair.id,price:'1',details}]}}});
 const short=await save({variantId:'short',kind:'CUT',hairLength:'SHORT'});check('Short haircut uses configured server price',short.data.servicePreferences.services[0].price==='100');
 const long=await save({variantId:'long',kind:'CUT',hairLength:'LONG'});check('Long haircut has independent price',long.data.servicePreferences.services[0].price==='180');
 check('Conflicting haircut details cannot use cheaper variant',(await save({variantId:'short',kind:'CUT',hairLength:'LONG'})).status===400);
 check('Extension color cannot use mismatching price option',(await save({variantId:'extensions',kind:'EXTENSIONS',extensionColor:'أشقر',extensionLength:60,extensionQuantity:50})).status===400);
 const extensions=await save({variantId:'extensions',kind:'EXTENSIONS',extensionColor:'أسود',extensionLength:60,extensionQuantity:50});check('Extension price and details persist together',extensions.data.servicePreferences.services[0].price==='500'&&extensions.data.servicePreferences.services[0].details.extensionQuantity===50);
 const enrollmentCount=await db.studentEnrollment.count(),paymentCount=await db.payment.count();
 const interests=await req('/api/crm/customers',{method:'PATCH',body:{id:customers.ADMIN.id,catalogueInterests:{items:[{kind:'COLLEGE',id:course.id,price:'1'},{kind:'EVENT',id:pack.id}]}}});
 check('College and event selections save authoritative prices in original currencies',interests.status===200&&interests.data.catalogueInterests.items[0].price==='1200'&&interests.data.catalogueInterests.items[1].currency==='AED');
 check('Catalogue selection does not fabricate registration or payment',await db.studentEnrollment.count()===enrollmentCount&&await db.payment.count()===paymentCount);
 const forged=await req('/api/crm/customers',{role:'STAFF',method:'PATCH',body:{id:customers.STAFF.id,catalogueInterests:{items:[{kind:'COLLEGE',id:course.id}]}}});check('Staff cannot forge college catalogue selection',forged.status===403);
 await db.customer.update({where:{id:customers.STAFF.id},data:{catalogueInterests:interests.data.catalogueInterests}});
 const scoped=await req('/api/crm/profile?id='+customers.STAFF.id,{role:'STAFF'});check('Cross-department catalogue interests hidden in customer profile',scoped.data.customer.catalogueInterests.items.length===0);
}
