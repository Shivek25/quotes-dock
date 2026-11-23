import type { AstroCookies } from 'astro';

export const STUDIO_COOKIE_NAME = 'qd_studio_key';

interface AuthEnv {
  ADMIN_STUDIO_KEY?: string;
  IP_HASH_SALT?: string;
}

export async function hashClientIp(ip: string, env?: AuthEnv): Promise<string> {
  const salt =
    env?.IP_HASH_SALT?.trim() ||
    env?.ADMIN_STUDIO_KEY?.trim() ||
    'qd-local-dev-salt';
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${ip || '127.0.0.1'}`);
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

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function getConfiguredStudioKey(env: AuthEnv | undefined): string {
  return env?.ADMIN_STUDIO_KEY?.trim() || '';
}

export function verifyStudioPassword(submittedKey: string, configuredKey: string): boolean {
  const cleanSubmitted = submittedKey.trim();
  const cleanConfigured = configuredKey.trim();
  if (!cleanSubmitted || !cleanConfigured) return false;
  return constantTimeEquals(cleanSubmitted, cleanConfigured);
}

export async function deriveStudioSessionToken(configuredKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(configuredKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode('qd-studio-session-v1')
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isLocalhostRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function isSameOriginStudioRequest(
  request: Request,
  env: AuthEnv | undefined
): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  // Non-browser CLI clients authenticating with explicit header key are exempt from browser CSRF checks
  const configuredKey = getConfiguredStudioKey(env);
  const headerKey = request.headers.get('x-studio-key')?.trim() || '';
  if (configuredKey && headerKey && constantTimeEquals(headerKey, configuredKey)) {
    return true;
  }

  let expectedOrigin = '';
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  const originHeader = request.headers.get('origin')?.trim();
  if (originHeader) {
    return originHeader === expectedOrigin;
  }

  const refererHeader = request.headers.get('referer')?.trim();
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  // Allow headerless local dev CLI calls (e.g. scripts/scout.ts) when running unauthenticated on localhost
  if (!configuredKey && isLocalhostRequest(request)) {
    return true;
  }

  return false;
}

export async function isStudioAuthorized(
  request: Request,
  cookies: AstroCookies,
  env: AuthEnv | undefined
): Promise<boolean> {
  const configuredKey = getConfiguredStudioKey(env);

  // Fail closed on any public/deployed domain if ADMIN_STUDIO_KEY is missing; only allow passwordless access on localhost
  if (!configuredKey) {
    return isLocalhostRequest(request);
  }

  const headerKey = request.headers.get('x-studio-key')?.trim() || '';
  if (headerKey && constantTimeEquals(headerKey, configuredKey)) {
    return true;
  }

  const cookieToken = cookies.get(STUDIO_COOKIE_NAME)?.value?.trim() || '';
  if (cookieToken) {
    const expectedToken = await deriveStudioSessionToken(configuredKey);
    if (constantTimeEquals(cookieToken, expectedToken)) {
      return true;
    }
  }

  return false;
}
