import { NextResponse } from 'next/server';

function isExpoDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false;

  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || !['8081', '19006'].includes(url.port)) return false;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || /^10(?:\.\d{1,3}){3}$/.test(hostname)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(hostname)
    || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(hostname);
}

export function middleware(request) {
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.ADMIN_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const response = request.method === 'OPTIONS'
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();

  if (origin && (allowedOrigins.includes(origin) || isExpoDevelopmentOrigin(origin))) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
