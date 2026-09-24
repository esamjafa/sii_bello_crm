import { NextRequest, NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function middleware(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return NextResponse.next();

  // Browsers attach these headers to fetch/form mutations. Reject cross-site
  // requests before they reach authentication or database code.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const expectedOrigin = forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin;
  if (origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const length = Number(request.headers.get('content-length') ?? '0');
  const type = request.headers.get('content-type') ?? '';
  const maximum = type.includes('multipart/form-data') ? Math.floor(4.25 * 1024 * 1024) : 64 * 1024;
  if (Number.isFinite(length) && length > maximum) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }

  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };
