import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canWrite, currentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(user.role, 'laserPlans')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const form = await request.formData();
  const planId = form.get('planId');
  const file = form.get('file');
  if (typeof planId !== 'string' || !planId || !(file instanceof File)) return NextResponse.json({ error: 'Plan and file required' }, { status: 400 });
  if (!allowed.has(file.type) || file.size > 4 * 1024 * 1024 || file.size === 0) return NextResponse.json({ error: 'PDF or image required, up to 4 MB' }, { status: 400 });
  const plan = await prisma.laserPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  const content = new Uint8Array(await file.arrayBuffer());
  const document = await prisma.laserDocument.create({ data: { planId, filename: file.name.slice(0, 200), mimeType: file.type, content }, select: { id: true, filename: true } });
  await audit(user,'UPLOAD','laserDocuments',document.id,{planId,filename:document.filename,mimeType:file.type,size:file.size});
  return NextResponse.json(document);
}
