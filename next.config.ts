import type { NextConfig } from 'next';
const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
      ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : [])
    ] }, { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] }];
  }
};
export default nextConfig;
