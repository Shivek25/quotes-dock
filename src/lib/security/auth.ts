import type { AstroCookies } from 'astro';

export const STUDIO_COOKIE_NAME = 'qd_studio_key';

export async function hashClientIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`qd-salt:${ip || '127.0.0.1'}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function getConfiguredStudioKey(env: { ADMIN_STUDIO_KEY?: string } | undefined): string {
  return env?.ADMIN_STUDIO_KEY?.trim() || '';
}

export function isLocalhostRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function isStudioAuthorized(
  request: Request,
  cookies: AstroCookies,
  env: { ADMIN_STUDIO_KEY?: string } | undefined
): boolean {
  const configuredKey = getConfiguredStudioKey(env);

  // Fail closed on any public/deployed domain if ADMIN_STUDIO_KEY is missing; only allow passwordless access on localhost
  if (!configuredKey) {
    return isLocalhostRequest(request);
  }

  const headerKey = request.headers.get('x-studio-key')?.trim() || '';
  if (headerKey && constantTimeEquals(headerKey, configuredKey)) {
    return true;
  }

  const cookieKey = cookies.get(STUDIO_COOKIE_NAME)?.value?.trim() || '';
  if (cookieKey && constantTimeEquals(cookieKey, configuredKey)) {
    return true;
  }

  return false;
}
