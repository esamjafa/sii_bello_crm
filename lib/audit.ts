import { headers } from 'next/headers';
import { prisma } from './prisma';

type Actor = { id: string; name: string; role: string };
export async function audit(actor: Actor, action: string, entity: string, entityId?: string | null, details?: unknown) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  await prisma.auditLog.create({ data: {
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entity,
    entityId: entityId ?? null,
    details: details === undefined ? null : JSON.stringify(details).slice(0, 4000),
    ipAddress: forwarded ?? requestHeaders.get('x-real-ip')
  }});
}
