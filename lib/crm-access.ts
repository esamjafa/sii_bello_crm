import { crm } from './crm-config';
export type Actor = { id:string; name:string; role:string; staffId?:string|null };
export const owners = (u:Actor) => ['GOD','ADMIN'].includes(u.role);
export const managers = (u:Actor) => owners(u)||u.role==='MANAGER';
export const financial = (u:Actor) => owners(u)||u.role==='ACCOUNTANT';
export function actorDepartments(u:Actor):string[] {
 if(managers(u))return ['SALON','COLLEGE','EVENT','PRODUCTS','FINANCE'];
 if(u.role==='ACCOUNTANT')return ['FINANCE'];
 if(['COLLEGE','TRAINER'].includes(u.role))return ['COLLEGE'];
 if(u.role==='EVENT_MANAGER')return ['EVENT'];
 if(u.role==='INVENTORY')return ['PRODUCTS'];
 return ['SALON'];
}
export function fieldAllowed(u:Actor,r:string,key:string) {
 if(!financial(u)&&['cost','commissionRate','paidAmount','invoiceId'].includes(key))return false;
 if(r==='customers'&&!managers(u)&&!actorDepartments(u).includes('SALON')&&['allergies','careInstructions','photoConsent','serviceConsent','notes','interestedIn'].includes(key))return false;
 return true;
}
const access:Record<string,string[]> = {
 MANAGER:['customers','tasks','appointments','services','laserPlans','laserSessions','hairSessions','staff','leaves','team','notes','documents','workingHours','templates'],
 ACCOUNTANT:['customers','invoices','payments','expenses','team','documents'],
 RECEPTIONIST:['customers','tasks','appointments','services','team','notes'],
 STAFF:['customers','tasks','appointments','services','laserPlans','laserSessions','hairSessions','notes','documents','team','staff','leaves'],
 SALES:['customers','tasks','notes','documents','team','templates'],
 COLLEGE:['customers','tasks','students','collegeCourses','enrollments','courseSessions','attendance','notes','documents','team','templates'],
 TRAINER:['customers','students','collegeCourses','enrollments','courseSessions','attendance','notes','documents','team'],
 EVENT_MANAGER:['customers','tasks','events','eventPackages','eventLeads','notes','documents','team','templates'],
 INVENTORY:['products','stockMovements','supplierOrders','customers','team'],
 VIEWER:['customers','tasks','appointments','services','team']
};
export function allowed(u:Actor,r:string,write=false) {
 if(!Object.hasOwn(crm,r)||u.role==='CUSTOMER') return false;
 if(owners(u)) return !write||!['audit','team','documents'].includes(r);
 if(!(access[u.role]??[]).includes(r))return false;
 if(!write)return true;
 if(['team','audit','documents'].includes(r)||u.role==='VIEWER')return false;
 if(u.role==='ACCOUNTANT')return ['invoices','payments','expenses'].includes(r);
 if(u.role==='TRAINER')return ['attendance','notes','enrollments'].includes(r);
 if(u.role==='INVENTORY')return r!=='customers';
 if(u.role==='STAFF'&&['services','staff'].includes(r))return false;
 return true;
}
export function customerScope(u:Actor):any {
 if(managers(u)||['ACCOUNTANT','INVENTORY'].includes(u.role))return {};
 if(['RECEPTIONIST','VIEWER'].includes(u.role))return {departments:{has:'SALON'}};
 if(u.role==='COLLEGE')return {ownerId:u.id,departments:{has:'COLLEGE'}};
 if(u.role==='TRAINER')return {students:{some:{enrollments:{some:{course:{trainerId:u.id}}}}}};
 if(u.role==='STAFF')return {OR:[{ownerId:u.id},{appointments:{some:{staffId:u.staffId??'__none__',archivedAt:null}}}]};
 if(u.role==='EVENT_MANAGER')return {OR:[{ownerId:u.id},{eventLeads:{some:{event:{managerId:u.id}}}}]};
 return {ownerId:u.id};
}
export function scope(u:Actor,r:string):any {
 const c=customerScope(u);
 if(r==='team'&&!managers(u))return {id:u.id,role:{not:'GOD'}};
 if(['users','team'].includes(r))return u.role==='GOD'?{}:{role:{not:'GOD'}};
 if(r==='audit')return u.role==='GOD'?{}:{AND:[{actorRole:{not:'GOD'}},{OR:[{details:null},{NOT:{details:{contains:'"GOD"'}}}]}]};
 if(r==='staff')return {AND:[...(u.role==='STAFF'?[{id:u.staffId??'__none__'}]:[]),...(u.role==='GOD'?[]:[{OR:[{user:null},{user:{role:{not:'GOD'}}}]}])]};
 if(r==='customers')return c;
 if(r==='templates')return managers(u)?{}:{department:{in:actorDepartments(u)}};
 if(r==='tasks')return managers(u)?u.role==='GOD'?{}:{owner:{role:{not:'GOD'}}}:{ownerId:u.id,customer:c};
 if(['notes','documents'].includes(r))return {customer:c,department:{in:actorDepartments(u)}};
 if(['hairSessions','invoices'].includes(r))return {customer:c};
 if(r==='appointments')return u.role==='STAFF'?{staffId:u.staffId??'__none__',customer:c}:{customer:c};
 if(r==='laserPlans')return {customer:c};
 if(r==='laserSessions')return {plan:{customer:c},...(u.role==='STAFF'?{staffId:u.staffId??'__none__'}:{})};
 if(r==='students')return {customer:c};
 if(r==='enrollments')return {student:{customer:c},...(u.role==='TRAINER'?{course:{trainerId:u.id}}:{})};
 if(r==='collegeCourses')return u.role==='TRAINER'?{trainerId:u.id}:u.role==='COLLEGE'?{OR:[{coordinatorId:u.id},{enrollments:{some:{student:{customer:{ownerId:u.id}}}}}]}:{};
 if(r==='courseSessions')return {course:scope(u,'collegeCourses')};
 if(r==='attendance')return {enrollment:scope(u,'enrollments')};
 if(r==='events')return u.role==='EVENT_MANAGER'?{managerId:u.id}:{};
 if(r==='eventPackages')return u.role==='EVENT_MANAGER'?{event:{managerId:u.id}}:{};
 if(r==='eventLeads')return {customer:c,...(u.role==='EVENT_MANAGER'?{event:{managerId:u.id}}:{})};
 if(['staff','leaves'].includes(r)&&u.role==='STAFF')return r==='staff'?{id:u.staffId??'__none__'}:{staffId:u.staffId??'__none__'};
 return {};
}
export function sanitize(u:Actor,r:string,row:any):any {
 const out={...row};
 for(const key of ['passwordHash','sessionVersion','content','imageBytes'])delete out[key];
 if(!financial(u)) {
   for(const key of ['paidAmount','invoiceId'])delete out[key];
   for(const key of ['cost','commissionRate'])delete out[key];
   if(!['COLLEGE','EVENT_MANAGER'].includes(u.role))for(const key of ['paidAmount','agreedAmount','originalPrice','originalAmount','discount','discountReason','fee','quotedPrice','offeredDiscount','invoiceId'])delete out[key];
   if(u.role!=='INVENTORY')delete out.purchasePrice;
 }
 if(r==='customers'&&!managers(u)) {
   const department=u.role==='COLLEGE'||u.role==='TRAINER'?'COLLEGE':u.role==='EVENT_MANAGER'?'EVENT':['STAFF','RECEPTIONIST','SALES','VIEWER'].includes(u.role)?'SALON':null;
   if(department)out.departments=(out.departments??[]).filter((value:string)=>value===department);
   if(['COLLEGE','TRAINER','EVENT_MANAGER','ACCOUNTANT','INVENTORY'].includes(u.role))for(const key of ['allergies','careInstructions','photoConsent','serviceConsent','notes','interestedIn'])delete out[key];
 }
 if(r==='customers'&&u.role==='INVENTORY')return {id:out.id,name:out.name,phone:out.phone};
 return out;
}
