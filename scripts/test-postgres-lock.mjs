import assert from 'node:assert/strict';
import { PrismaClient } from '../generated/postgresql/index.js';
import { acquireScheduleLock, assertNoOverlap, SchedulingConflict } from '../lib/scheduling.ts';

// Only used against the throwaway rehearsal database, after import verification.
if (process.env.POSTGRES_REHEARSAL !== 'true' || new URL(process.env.DATABASE_URL || 'http://invalid').hostname !== '127.0.0.1') {
  throw new Error('This fixture test may only run inside the local PostgreSQL rehearsal.');
}
const clients = [new PrismaClient(), new PrismaClient()];
try {
  const customer = await clients[0].customer.create({ data: { name: 'Lock test', phone: `lock-${Date.now()}` } });
  const service = await clients[0].service.create({ data: { name: 'Lock test', price: 1, durationMinutes: 60 } });
  const startsAt = new Date('2099-01-01T09:00:00Z');
  const results = await Promise.allSettled(clients.map(client => client.$transaction(async tx => {
    await acquireScheduleLock(tx);
    await assertNoOverlap(tx, startsAt, 60);
    await new Promise(resolve => setTimeout(resolve, 100));
    return tx.appointment.create({ data: { customerId: customer.id, serviceId: service.id, startsAt } });
  })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason instanceof SchedulingConflict).length, 1);
  assert.equal(await clients[0].appointment.count({ where: { startsAt } }), 1);
  console.log('PASS: independent PostgreSQL clients admit exactly one overlapping appointment.');
} finally { await Promise.all(clients.map(client => client.$disconnect())); }
