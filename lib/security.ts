import { prisma } from './prisma';

export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'local';
}

export async function securityRateLimit(options: {
  request: Request;
  action: string;
  identity: string;
  windowMs: number;
  maximum: number;
  bindToIp?: boolean;
}) {
  const now = new Date();
  const since = new Date(now.getTime() - options.windowMs);
  const ipAddress = clientIp(options.request);
  const entity = `security:${options.identity.slice(0, 180)}`;
  const scope = options.bindToIp === false ? { action: options.action, entity } : { action: options.action, entity, ipAddress };
  const attempts = await prisma.auditLog.count({
    where: { ...scope, createdAt: { gte: since } }
  });
  if (attempts >= options.maximum) {
    const oldest = await prisma.auditLog.findFirst({
      where: { ...scope, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' }, select: { createdAt: true }
    });
    const retryAfter = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? now.getTime()) + options.windowMs - now.getTime()) / 1000));
    return { allowed: false as const, retryAfter };
  }
  await prisma.auditLog.create({ data: {
    actorName: 'Anonymous', actorRole: 'ANONYMOUS', action: options.action,
    entity, details: null, ipAddress
  }});
  return { allowed: true as const, retryAfter: 0 };
}
