import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './prisma';
import type { Role } from '@prisma/client';

const cookieName = 'salon_session';
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(value);
}
export async function setSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret());
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true', sameSite: 'lax', path: '/', maxAge: 604800 });
}
export async function clearSession() { (await cookies()).delete(cookieName); }
export async function currentUser() {
  try {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return await prisma.user.findFirst({ where: { id: payload.sub, active: true }, select: { id: true, name: true, username: true, email: true, role: true, customerId: true } });
  } catch { return null; }
}
export function canWrite(role: Role, resource: string) {
  if (role === 'GOD') return true;
  if (role === 'ADMIN') return true;
  if (role === 'MANAGER') return resource !== 'users';
  if (role === 'STAFF') return ['customers', 'appointments', 'invoices', 'laserPlans', 'laserSessions'].includes(resource);
  return false;
}
