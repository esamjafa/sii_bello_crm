import {prisma} from './prisma';
import {allowed,scope,type Actor} from './crm-access';
import {serviceDepartments} from './crm-config';
export async function customerCatalogue(u:Actor,url:URL){
 const q=url.searchParams.get('q')?.trim().slice(0,100)??'';
 const rows:any[]=[];const categories:string[]=[];
 if(allowed(u,'services')){
  categories.push(...serviceDepartments);
  const services=await prisma.service.findMany({where:{active:true,name:{contains:q,mode:'insensitive'}},select:{id:true,name:true,department:true,price:true,durationMinutes:true,imageUrl:true,configuration:true},orderBy:{name:'asc'},take:100});
  rows.push(...services.map(s=>({...s,kind:'SERVICE',category:s.department,currency:'ILS'})));
 }
 if(allowed(u,'collegeCourses')){
  categories.push('COLLEGE');const courses=await prisma.collegeCourse.findMany({where:{AND:[scope(u,'collegeCourses'),{active:true,title:{contains:q,mode:'insensitive'}}]},select:{id:true,title:true,fee:true,description:true},orderBy:{title:'asc'},take:100});
  rows.push(...courses.map(c=>({id:c.id,name:c.title,price:c.fee,description:c.description,kind:'COLLEGE',category:'COLLEGE',currency:'ILS'})));
 }
 if(allowed(u,'eventPackages')){
  categories.push('EVENT');const packages=await prisma.eventPackage.findMany({where:{AND:[scope(u,'eventPackages'),{active:true,event:{archivedAt:null},OR:[{name:{contains:q,mode:'insensitive'}},{event:{name:{contains:q,mode:'insensitive'}}}]}]},select:{id:true,name:true,price:true,description:true,event:{select:{name:true,currency:true,location:true,startsAt:true}}},orderBy:{name:'asc'},take:100});
  rows.push(...packages.map(p=>({id:p.id,name:`${p.event?.name} · ${p.name}`,price:p.price,description:p.description,kind:'EVENT',category:'EVENT',currency:p.event?.currency??'AED'})));
 }
 return {rows,categories};
}
