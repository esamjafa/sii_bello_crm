import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { SignJWT } from 'jose';

// Uses a fresh, disposable database and disables all external notifications.
mkdirSync('audit-results', { recursive: true });
const database = resolve('audit-results', `test-${Date.now()}.db`).replaceAll('\\', '/');
const postgres = /provider\s*=\s*"postgresql"/.test(readFileSync('prisma/schema.prisma', 'utf8'));
let databaseUrl = `file:${database}`;
if (postgres) {
  const url = new URL(process.env.AUDIT_DATABASE_URL || 'http://missing');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/audit_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('PostgreSQL audits require AUDIT_DATABASE_URL pointing to a disposable localhost database named audit_*. Production URLs are refused.');
  }
  databaseUrl = url.toString();
}
const secret = randomBytes(32).toString('hex');
const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, SESSION_SECRET: secret,
  NODE_ENV: 'production', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: '',
  RESEND_API_KEY: '', BOOKING_DEV_OTP: 'false' };
const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, encoding: 'utf8' });
if (migration.status !== 0) throw new Error(migration.error?.message || migration.stderr || migration.stdout);
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
if (postgres && await prisma.user.count()) { await prisma.$disconnect(); throw new Error('Audit database must be empty.'); }
const results = [];
const check = (name, pass, evidence) => { results.push({ name, pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(evidence)}`); };
const password = randomBytes(16).toString('hex');
const customer = await prisma.customer.create({ data: { name: 'Audit customer', phone: '972500000001' } });
const other = await prisma.customer.create({ data: { name: 'Other customer', phone: '972500000002' } });
const users = {};
for (const role of ['GOD', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER', 'CUSTOMER']) users[role] = await prisma.user.create({ data: { name: role, username: `audit_${role}`, role, passwordHash: await hash(password, 4), ...(role === 'CUSTOMER' ? { customerId: customer.id } : {}) } });
const service = await prisma.service.create({ data: { name: 'Audit service', price: 100, durationMinutes: 60 } });
for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) await prisma.workingHour.create({ data: { dayOfWeek, openTime: '09:00', closeTime: '18:00', active: true } });
const plan = await prisma.laserPlan.create({ data: { customerId: other.id, area: 'Private record', sessionsTotal: 3 } });
const doc = await prisma.laserDocument.create({ data: { planId: plan.id, filename: 'private.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4 audit private document') } });
const cookies = {};
for (const [role, user] of Object.entries(users)) cookies[role] = 'salon_session=' + await new SignJWT({ sub: user.id }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
const bookingCookie = 'customer_booking_session=' + await new SignJWT({ sub: customer.id, scope: 'customer_booking' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
const port = 3197;
const servers = [port, port + 1].map(value => spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(value)], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
let logs = '';
for (const server of servers) { server.stdout.on('data', x => { logs += x; }); server.stderr.on('data', x => { logs += x; }); }
async function req(path, { role, cookie, method = 'GET', body, headers = {}, instance = 0 } = {}) {
  const response = await fetch(`http://localhost:${port + instance}${path}`, { method, redirect: 'manual', headers: { ...(role ? { Cookie: cookies[role] } : cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 150); }
  return { status: response.status, data, headers: response.headers };
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) { try { await req('/login'); await req('/login', { instance: 1 }); ready = true; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  if (!ready) throw new Error('Test server did not start');
  for (const path of ['/login', '/book']) { const r = await req(path); check(`Public page ${path}`, r.status === 200, r.status); }
  for (const path of ['/api/data/customers', '/api/booking/data', '/api/service-requests', `/api/laser-documents/${doc.id}`]) { const r = await req(path); check(`Anonymous blocked ${path}`, r.status === 401, r.status); }
  for (const role of ['VIEWER', 'STAFF', 'CUSTOMER']) { const r = await req('/api/data/users', { role }); check(`${role} cannot list users`, r.status === 403, r.status); }
  const login = await req('/api/auth/login', { method: 'POST', body: { username: 'audit_ADMIN', password } });
  check('Password login and secure cookie', login.status === 200 && /Secure/i.test(login.headers.get('set-cookie') || ''), login.status);
  let r = await req('/api/data/customers', { role: 'VIEWER', method: 'POST', body: { name: 'Forbidden', phone: '123456789' } }); check('Viewer write denied', r.status === 403, r.status);
  r = await req('/api/data/customers', { role: 'ADMIN', method: 'POST', body: { name: 'Cross site', phone: '123456789' }, headers: { Origin: 'https://attacker.example' } }); check('Cross-origin mutation denied', r.status === 403, r.status);
  r = await req('/api/data/invoices', { role: 'ADMIN', method: 'POST', body: { customerId: customer.id, description: 'Invalid overpayment', amount: 100, paidAmount: 101 } }); check('Invoice overpayment denied', r.status === 400, r.status);
  r = await req(`/api/laser-documents/${doc.id}`, { role: 'CUSTOMER' }); check('Customer cannot download another customer document', r.status === 403 || r.status === 404, { status: r.status, receivedPrivateDocument: String(r.data).includes('audit private document') });
  for (const role of ['GOD', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER']) {
    r = await req(`/api/laser-documents/${doc.id}`, { role }); check(`${role} can download staff documents`, r.status === 200, r.status);
  }
  for (const path of ['/api/auth/login', '/api/booking/request-code', '/api/booking/verify-code']) { r = await req(path, { method: 'POST', body: '{' }); check(`Malformed JSON returns 400 ${path}`, r.status === 400, r.status); }
  r = await req('/api/booking/request-code', { method: 'POST', body: { phone: '972500000003' } });
  check('OTP reports unavailable delivery', r.status >= 400, { status: r.status, body: r.data, loggedStatus: (await prisma.notificationLog.findFirst({ where: { event: 'BOOKING_VERIFICATION' } }))?.status });
  const failedCode = await prisma.bookingVerification.findFirst({ where: { phone: '972500000003' } });
  check('Undelivered OTP is expired and not exposed', r.status === 503 && !r.data.devCode && failedCode.expiresAt < new Date(), r.status);
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  r = await req(`/api/booking/slots?serviceId=${service.id}&date=${future}`, { cookie: bookingCookie });
  check('Future booking slots available', r.status === 200 && r.data.length > 0, { status: r.status, count: r.data.length });
  const slot = r.data[0];
  const appt = { customerId: customer.id, serviceId: service.id, startsAt: slot, status: 'SCHEDULED' };
  const a = await req('/api/data/appointments', { role: 'ADMIN', method: 'POST', body: appt });
  const b = await req('/api/data/appointments', { role: 'ADMIN', method: 'POST', body: appt });
  check('Direct appointment creation rejects overlap', a.status === 200 && b.status === 409, { first: a.status, duplicate: b.status });
  const expense = await req('/api/data/expenses', { role: 'ADMIN', method: 'POST', body: { payee: 'Audit', category: 'Audit', description: 'Audit', amount: 50, dueAt: slot, paidAt: slot } });
  r = await req('/api/data/expenses', { role: 'ADMIN', method: 'PATCH', body: { id: expense.data.id, payee: 'Audit', category: 'Audit', description: 'Audit', amount: 50, dueAt: slot, paidAt: null } });
  check('Clearing expense payment date persists null', r.data.paidAt === null && r.data.status === 'DUE', { status: r.status, paidAt: r.data.paidAt, expenseStatus: r.data.status });
  r = await req(`/api/booking/slots?serviceId=${service.id}&date=2026-99-99`, { cookie: bookingCookie }); check('Invalid calendar date handled without 500', r.status < 500, r.status);
  const dateCases = ['2026-01-15T09:00:00.000Z', '2026-07-15T09:00:00.000Z', '2026-10-24T22:30:12.345Z', '2026-10-24T23:30:12.345Z'];
  for (const zone of ['Asia/Jerusalem', 'UTC', 'America/New_York']) {
    const dateTest = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import { dateInput, dateInputToISO } from './lib/date-input.ts'; const dates=${JSON.stringify(dateCases)}; console.log(JSON.stringify(dates.map(d=>({original:d,saved:dateInputToISO(dateInput(d),d)}))))`], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    const converted = dateTest.status === 0 ? JSON.parse(dateTest.stdout.trim()) : [];
    check(`Unchanged date edits preserve instants in ${zone}`, converted.length === dateCases.length && converted.every(x => x.original === x.saved), converted.length ? converted : dateTest.stderr);
    const createTest = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import { dateInput, dateInputToISO } from './lib/date-input.ts'; const dates=${JSON.stringify(dateCases.slice(0, 2))}; console.log(JSON.stringify(dates.map(d=>({original:d,saved:dateInputToISO(dateInput(d))}))))`], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    const created = createTest.status === 0 ? JSON.parse(createTest.stdout.trim()) : [];
    check(`Local date input round trip in ${zone}`, created.length === 2 && created.every(x => x.original === x.saved), created.length ? created : createTest.stderr);
  }
  const start = new Date(`${future}T22:00:00Z`);
  const requests = await Promise.all([1, 2].map(() => prisma.serviceRequest.create({ data: { customerId: customer.id, serviceId: service.id, preferredAt: start } })));
  const reviews = await Promise.all(requests.map((x, instance) => req('/api/service-requests', { instance, role: 'ADMIN', method: 'PATCH', body: { id: x.id, decision: 'APPROVED' } })));
  const count = await prisma.appointment.count({ where: { startsAt: start } });
  check('Concurrent approval prevents overlapping appointments', count === 1 && reviews.map(x => x.status).sort().join(',') === '200,409', { statuses: reviews.map(x => x.status), appointmentCount: count });
  const concurrentStart = new Date(new Date(slot).getTime() + 3 * 3600000).toISOString();
  const direct = await Promise.all([1, 2, 3].map(i => req('/api/data/appointments', { instance: i % 2, role: 'ADMIN', method: 'POST', body: { ...appt, startsAt: concurrentStart } })));
  check('Concurrent direct bookings admit exactly one appointment', direct.map(x => x.status).sort().join(',') === '200,409,409', direct.map(x => x.status));
  r = await req('/api/data/appointments', { role: 'ADMIN', method: 'PATCH', body: { ...appt, id: a.data.id } });
  check('Unchanged appointment edit does not conflict with itself', r.status === 200, r.status);
  r = await req('/api/data/appointments', { role: 'ADMIN', method: 'PATCH', body: { ...appt, id: a.data.id, startsAt: concurrentStart } });
  check('Appointment edit cannot move onto another appointment', r.status === 409, r.status);
  r = await req('/api/data/appointments', { role: 'ADMIN', method: 'POST', body: { ...appt, startsAt: new Date(new Date(slot).getTime() + 3600000).toISOString() } });
  check('Adjacent non-overlapping appointments are allowed', r.status === 200, r.status);
  r = await req('/api/data/appointments', { role: 'ADMIN', method: 'POST', body: { ...appt, status: 'CANCELLED' } });
  check('Cancelled appointment may overlap a reservation', r.status === 200, r.status);
  const cancelledId = r.data.id;
  r = await req('/api/data/appointments', { role: 'ADMIN', method: 'PATCH', body: { ...appt, id: cancelledId } });
  check('Reactivating a cancelled appointment checks conflicts', r.status === 409, r.status);
  const code = '654321';
  await prisma.bookingVerification.create({ data: { phone: customer.phone, codeHash: await hash(code, 4), expiresAt: new Date(Date.now() + 600000) } });
  r = await req('/api/booking/verify-code', { method: 'POST', body: { phone: customer.phone, name: customer.name, code } });
  check('Correct OTP establishes booking session', r.status === 200 && (r.headers.get('set-cookie') || '').includes('customer_booking_session='), r.status);
  r = await req('/api/booking/verify-code', { method: 'POST', body: { phone: customer.phone, name: customer.name, code } });
  check('Used OTP cannot be reused', r.status === 400, r.status);
  const nextSlots = await req(`/api/booking/slots?serviceId=${service.id}&date=${future}`, { cookie: bookingCookie });
  r = await req('/api/booking/requests', { cookie: bookingCookie, method: 'POST', body: { serviceId: service.id, preferredAt: nextSlots.data[0] } });
  check('Phone booking creates pending request', r.status === 200 && r.data.status === 'PENDING', { status: r.status, requestStatus: r.data.status });
  const requestId = r.data.id;
  r = await req('/api/service-requests', { role: 'ADMIN', method: 'PATCH', body: { id: requestId, decision: 'APPROVED' } });
  check('Approval creates appointment and invoice', r.status === 200 && !!r.data.appointmentId && !!r.data.invoiceId, r.status);
  r = await req('/api/service-requests', { role: 'ADMIN', method: 'PATCH', body: { id: requestId, decision: 'APPROVED' } });
  check('Same request cannot be approved twice', r.status === 409, r.status);
  const localizedDoc = await prisma.laserDocument.create({ data: { planId: plan.id, filename: '\u05d8\u05d5\u05e4\u05e1.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4 audit') } });
  r = await req(`/api/laser-documents/${localizedDoc.id}`, { role: 'ADMIN' });
  check('Hebrew document filename downloads successfully', r.status === 200, r.status);
  check('Unicode download filename is RFC 5987 encoded', (r.headers.get('content-disposition') || '').includes("filename*=UTF-8''%D7"), r.headers.get('content-disposition'));
  r = await req('/api/data/toString', { role: 'ADMIN' });
  check('Inherited object property is rejected as resource', r.status === 404, r.status);
  await prisma.appointment.create({ data: { customerId: customer.id, serviceId: service.id, startsAt: new Date(new Date(slot).getTime() - 30 * 60000) } });
  // Remove the earlier duplicate 09:00 appointments to isolate an 08:30-09:30 overlap.
  await prisma.appointment.deleteMany({ where: { startsAt: new Date(slot) } });
  r = await req(`/api/booking/slots?serviceId=${service.id}&date=${future}`, { cookie: bookingCookie });
  check('Pre-opening appointment blocks overlapping first slot', !r.data.includes(slot), { firstSlotOffered: r.data.includes(slot) });
} finally {
  for (const server of servers) server.kill();
  await prisma.$disconnect();
  writeFileSync('audit-results/results.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  writeFileSync('audit-results/server.log', logs);
}
process.exitCode = results.some(result => !result.pass) ? 1 : 0;
