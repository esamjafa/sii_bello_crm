import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {publicSlots} from '@/lib/public-catalogue';
import {securityRateLimit} from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const url=new URL(request.url);
  if(url.searchParams.has('date')){
   const limit=await securityRateLimit({request,action:'PUBLIC_AVAILABILITY',identity:'slots',windowMs:60000,maximum:30});
   if(!limit.allowed)return NextResponse.json({error:'محاولات كثيرة؛ انتظري قليلًا'},{status:429});
   return NextResponse.json({slots:await publicSlots(url.searchParams.get('serviceId')??'',url.searchParams.get('date')??'')});
  }
  const services=await prisma.service.findMany({where:{active:true,onlineBookable:true},select:{id:true,name:true,department:true,price:true,imageUrl:true,durationMinutes:true,configuration:true},orderBy:{name:'asc'},take:200});
  const products=await prisma.product.findMany({where:{onlineVisible:true,archivedAt:null,purpose:'SALE'},select:{id:true,name:true,sku:true,salePrice:true,currency:true,imageUrl:true},take:200});
  const stock=await prisma.stockMovement.groupBy({by:['productId'],where:{productId:{in:products.map(p=>p.id)}},_sum:{quantity:true}});
  return NextResponse.json({services,products:products.map(p=>({...p,stock:Math.max(0,stock.find(s=>s.productId===p.id)?._sum.quantity??0)})),checkoutEnabled:false,timeZone:'Asia/Jerusalem'});
 }catch{return NextResponse.json({error:'تعذر تحميل الخدمات؛ حاولي مجددًا'},{status:503});}
}
