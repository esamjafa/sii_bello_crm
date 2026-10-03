import {z} from 'zod';

export const bodyRegions=['BEARD','FACE','NECK','UNDERARMS','CHEST','ARMS','LEGS','THIGHS','ABDOMEN','BACK','LOWER_BACK','BUTTOCKS','BIKINI'] as const;
export const regionLabels:Record<string,string>={BEARD:'اللحية',FACE:'الوجه',NECK:'الرقبة',CHEST:'الصدر',THIGHS:'الفخذان',LOWER_BACK:'أسفل الظهر',BUTTOCKS:'الأرداف',UNDERARMS:'الإبطان',ARMS:'الذراعان',LEGS:'الساقان',ABDOMEN:'البطن',BACK:'الظهر',BIKINI:'البكيني'};
const money=z.coerce.number().finite().min(0).max(1000000).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,'السعر يقبل منزلتين عشريتين');
const area=z.object({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(100),region:z.enum(bodyRegions),price:money,coverage:z.array(z.enum(bodyRegions)).min(1).max(20).optional(),audience:z.enum(['FEMALE','MALE','ALL']).optional()});
const offer=z.object({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(100),areaIds:z.array(z.string()).min(1).max(40),price:money,startsAt:z.string().datetime().optional(),endsAt:z.string().datetime().optional()});
export const serviceConfiguration=z.object({areas:z.array(area).max(40).default([]),offers:z.array(offer).max(30).default([])}).superRefine((v,ctx)=>{
 const ids=v.areas.map(a=>a.id);
 if(new Set(ids).size!==ids.length||new Set(v.offers.map(a=>a.id)).size!==v.offers.length)ctx.addIssue({code:'custom',message:'رموز المناطق والعروض يجب أن تكون فريدة'});
 for(const o of v.offers){
  if(new Set(o.areaIds).size!==o.areaIds.length||o.areaIds.some(id=>!ids.includes(id)))ctx.addIssue({code:'custom',message:'العرض يشير إلى مناطق غير صالحة'});
  if(o.startsAt&&o.endsAt&&o.startsAt>=o.endsAt)ctx.addIssue({code:'custom',message:'نهاية العرض يجب أن تكون بعد بدايته'});
  const total=v.areas.filter(a=>o.areaIds.includes(a.id)).reduce((s,a)=>s+Math.round(a.price*100),0);
  if(Math.round(o.price*100)>total)ctx.addIssue({code:'custom',message:'سعر العرض أكبر من أسعار مناطقه'});
 }
});
export type ServiceConfiguration=z.infer<typeof serviceConfiguration>;
const selection=z.object({gender:z.enum(['FEMALE','MALE']).optional(),areaIds:z.array(z.string().max(80)).max(40).optional(),offerId:z.string().max(80).optional(),kind:z.string().max(100).optional(),color:z.string().max(100).optional(),shade:z.string().max(100).optional(),steps:z.array(z.enum(['CLEAN','PEEL','STEAM','MASK'])).max(4).optional(),notes:z.string().max(1000).optional(),faceAreas:z.array(z.enum(['FOREHEAD','CHEEKS','NOSE','CHIN'])).max(4).optional(),currentColor:z.string().max(100).optional(),currentLevel:z.number().int().min(1).max(10).optional(),targetLevel:z.number().int().min(1).max(10).optional(),resultLevel:z.number().int().min(1).max(10).optional(),texture:z.enum(['SOFT','MEDIUM','COARSE']).optional(),density:z.enum(['LIGHT','MEDIUM','THICK']).optional(),formula:z.string().max(500).optional(),products:z.string().max(500).optional(),result:z.string().max(500).optional()}).strict();
export type Selection=z.infer<typeof selection>;
export function quoteService(service:{department:string;price:unknown;configuration?:unknown},input:unknown,now=new Date()){
 const details=selection.parse(input??{});
 if(service.department!=='LASER'){
  if(details.gender||details.areaIds?.length||details.offerId)throw new Error('مناطق الليزر لا تتبع هذه الخدمة');
  if(service.department!=='SKIN'&&(details.steps?.length||details.faceAreas?.length))throw new Error('خطوات البشرة لا تتبع هذه الخدمة');
  if(service.department!=='HAIR'&&['currentColor','currentLevel','targetLevel','resultLevel','texture','density','formula','products','result'].some(k=>(details as any)[k]!==undefined))throw new Error('تفاصيل الشعر لا تتبع هذه الخدمة');
  if(service.department==='HAIR'&&details.kind!=='COLOR'&&['currentColor','currentLevel','targetLevel','resultLevel','formula'].some(k=>(details as any)[k]!==undefined))throw new Error('تفاصيل الصبغة لا تتبع نوع الخدمة المختار');
  if((details.color||details.shade)&&(service.department!=='HAIR'||details.kind!=='COLOR'))throw new Error('اللون والدرجة لخدمة الصبغة فقط');
  return {details,areas:[],offer:null,originalPrice:Number(service.price),finalPrice:Number(service.price),currency:'ILS'};
 }
 const config=serviceConfiguration.parse(service.configuration??{});
 if(!details.areaIds?.length)throw new Error('اختاري منطقة ليزر واحدة على الأقل');
 if(Object.keys(details).some(k=>!['gender','areaIds','offerId','notes'].includes(k)))throw new Error('تفاصيل الخدمة لا تتبع الليزر');
 const ids=[...new Set(details.areaIds)];
 const areas=ids.map(id=>{const a=config.areas.find(a=>a.id===id);if(!a)throw new Error('إحدى المناطق لم تعد متاحة');return a;});
 const gender=details.gender??'FEMALE';
 for(const a of areas){if((a.region==='BEARD'||a.coverage?.includes('BEARD'))&&gender!=='MALE')throw new Error('منطقة اللحية متاحة للرجال فقط');if(a.audience&&a.audience!=='ALL'&&a.audience!==gender)throw new Error('المنطقة لا تتبع نوع العميل المختار');}
 const covered=new Set<string>();for(const a of areas){for(const region of new Set(a.coverage??[a.region])){if(covered.has(region))throw new Error('تتداخل المناطق المختارة. أزيلي المنطقة المشمولة في الباقة لتجنب احتسابها مرتين');covered.add(region);}}
 const originalCents=areas.reduce((s,a)=>s+Math.round(a.price*100),0);
 const offer=details.offerId?config.offers.find(o=>o.id===details.offerId):undefined;
 if(details.offerId&&(!offer||offer.areaIds.length!==ids.length||offer.areaIds.some(id=>!ids.includes(id))||offer.startsAt&&new Date(offer.startsAt)>now||offer.endsAt&&new Date(offer.endsAt)<now))throw new Error('العرض غير متاح للمناطق المختارة أو انتهت صلاحيته');
 return {details:{...details,areaIds:ids},areas,offer:offer??null,originalPrice:originalCents/100,finalPrice:offer?offer.price:originalCents/100,currency:'ILS'};
}
