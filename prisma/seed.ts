import { loadEnvConfig } from '@next/env';
import { PrismaClient, Role } from '@prisma/client';
import { hash } from 'bcryptjs';

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const accounts: { username: string; name: string; role: Role; password?: string }[] = [
    { username: 'DemaT', name: 'DemaT', role: 'ADMIN', password: process.env.DEMAT_PASSWORD },
    { username: 'Raneenj', name: 'Raneenj', role: 'ADMIN', password: process.env.RANEENJ_PASSWORD },
    { username: 'esamJ', name: 'esamJ', role: 'GOD', password: process.env.ESAMJ_PASSWORD }
  ];
  for (const account of accounts) {
    if (!account.password) throw new Error(`Missing password for ${account.username}`);
    const { password, ...profile } = account;
    await prisma.user.upsert({
      where: { username: account.username },
      create: { ...profile, passwordHash: await hash(password, 12) },
      update: { name: account.name, role: account.role, active: true, passwordHash: await hash(password, 12) }
    });
    console.log(`Account ready: ${account.username} (${account.role})`);
  }
  const hours = [
    { dayOfWeek: 0, openTime: '09:00', closeTime: '18:00', active: true },
    { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', active: true },
    { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', active: true },
    { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', active: true },
    { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', active: true },
    { dayOfWeek: 5, openTime: '09:00', closeTime: '14:00', active: true },
    { dayOfWeek: 6, openTime: '09:00', closeTime: '18:00', active: false }
  ];
  for (const day of hours) await prisma.workingHour.upsert({ where: { dayOfWeek: day.dayOfWeek }, create: day, update: {} });
}
main().finally(() => prisma.$disconnect());
