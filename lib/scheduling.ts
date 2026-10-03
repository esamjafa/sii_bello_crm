import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { parseSchedule, withinSchedule } from './staff-schedule';

export class SchedulingConflict extends Error {}

export async function acquireScheduleLock(tx: Prisma.TransactionClient) {
  if (/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? '')) {
    await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1397311810)`;
  } else {
    await tx.$executeRaw`UPDATE "WorkingHour" SET "active" = "active" WHERE "dayOfWeek" = 0`;
  }
}

/** Acquire a database-wide scheduling lock BEFORE reading availability.
 * All appointment create/update paths must use this transaction. SQLite uses
 * its single-writer lock; PostgreSQL uses a transaction-scoped advisory lock.
 * Read Committed ensures reads after waiting see the preceding writer's commit.
 */
export async function schedulingTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await acquireScheduleLock(tx);
        return operation(tx);
      }, { maxWait: 10000, timeout: 15000 });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (['P1008', 'P2034', 'P2028'].includes(error.code) ||
          (error.code === 'P2010' && /locked|busy/i.test(error.message)));
      if (!retryable) throw error;
      if (attempt >= 2) throw new SchedulingConflict('The schedule is busy. Please try again.');
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function assertStaffAvailable(tx:Prisma.TransactionClient,staffId:string,startsAt:Date,durationMinutes:number,serviceId?:string){
 const staff=await tx.staff.findUnique({where:{id:staffId}});
 if(!staff?.active)throw new SchedulingConflict('الموظفة غير متاحة');
 if(serviceId&&!staff.services.includes(serviceId))throw new SchedulingConflict('الموظفة غير مؤهلة للخدمة؛ حددي الخدمات التي تقدمها في ملفها');
 let schedule;try{schedule=parseSchedule(staff.schedule);}catch{throw new SchedulingConflict('يجب تحديث جدول الموظفة قبل الحجز');}
 if(!schedule){
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(startsAt);
  const day=new Date(`${localDate}T12:00:00Z`).getUTCDay();const hours=await tx.workingHour.findUnique({where:{dayOfWeek:day}});
  if(!hours?.active)throw new SchedulingConflict('لا توجد فترات عمل متاحة لهذا اليوم');
  schedule={[day]:[{start:hours.openTime,end:hours.closeTime}]};
 }
 if(schedule&&!withinSchedule(schedule,startsAt,durationMinutes))throw new SchedulingConflict('الموعد خارج فترات دوام الموظفة');
 const endsAt=new Date(+startsAt+durationMinutes*60000);
 if(await tx.employeeLeave.findFirst({where:{staffId,status:'APPROVED',startsAt:{lt:endsAt},endsAt:{gt:startsAt}}}))throw new SchedulingConflict('الموظفة في إجازة أثناء الموعد');
}
// An unassigned booking reserves salon capacity; assigned bookings reserve their staff member.
export async function assertNoOverlap(tx: Prisma.TransactionClient, startsAt: Date, durationMinutes: number, excludeId?: string,staffId?:string|null,service?:{resourceKey?:string|null;bufferMinutes?:number}) {
  const end = startsAt.getTime() + (durationMinutes+(service?.bufferMinutes??0)) * 60000;
  const appointments = await tx.appointment.findMany({
    where: { ...(excludeId ? { id: { not: excludeId } } : {}),...(staffId?{OR:[{staffId},{staffId:null},...(service?.resourceKey?[{resourceKey:service.resourceKey},{service:{resourceKey:service.resourceKey}}]:[])]}:{}),archivedAt:null, startsAt: { lt: new Date(end) }, status: { in: ['SCHEDULED','PENDING_REPLY','CONFIRMED', 'COMPLETED'] } },
    include: { service: true }
  });
  if (appointments.some(a => startsAt.getTime() < a.startsAt.getTime() + ((a.durationMinutes??a.service.durationMinutes)+(a.bufferMinutes||a.service.bufferMinutes)) * 60000)) {
    throw new SchedulingConflict('الموعد يتداخل مع حجز قائم؛ اختاري وقتًا آخر');
  }
}
