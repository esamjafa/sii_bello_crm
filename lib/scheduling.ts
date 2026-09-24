import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

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

// Preserve the existing single-salon capacity rule: appointments conflict even
// when different staff members are selected.
export async function assertNoOverlap(tx: Prisma.TransactionClient, startsAt: Date, durationMinutes: number, excludeId?: string) {
  const end = startsAt.getTime() + durationMinutes * 60000;
  const appointments = await tx.appointment.findMany({
    where: { ...(excludeId ? { id: { not: excludeId } } : {}), startsAt: { lt: new Date(end) }, status: { in: ['SCHEDULED', 'COMPLETED'] } },
    include: { service: true }
  });
  if (appointments.some(a => startsAt.getTime() < a.startsAt.getTime() + a.service.durationMinutes * 60000)) {
    throw new SchedulingConflict('This time overlaps another appointment. Choose another time.');
  }
}
