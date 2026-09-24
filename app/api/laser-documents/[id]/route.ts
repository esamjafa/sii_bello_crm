import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['GOD', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await context.params;
  const document = await prisma.laserDocument.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const filename = document.filename.replace(/[\x00-\x1f\x7f"\\/]/g, '_');
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(Buffer.from(document.content), { headers: { 'Content-Type': document.mimeType, 'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
}
