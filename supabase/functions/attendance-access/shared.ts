const PRODUCTION_ORIGIN = 'https://nuruanna.gitverse.site';

export function normalizeClientIp(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
    const octets = candidate.split('.').map(Number);
    return octets.every(octet => octet >= 0 && octet <= 255)
      ? octets.join('.')
      : null;
  }
  if (!candidate.includes(':') || candidate.includes('%') || candidate.includes('[') || candidate.includes(']')) return null;
  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1).toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function clientIpFromXForwardedFor(header: string | null) {
  if (!header) return null;
  for (const entry of header.split(',')) {
    const normalized = normalizeClientIp(entry);
    if (normalized) return normalized;
  }
  return null;
}

export function allowedOrigin(origin: string | null) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin === PRODUCTION_ORIGIN) return url.origin;
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && ['http:', 'https:'].includes(url.protocol)) return url.origin;
  } catch { /* Invalid origins are not reflected. */ }
  return null;
}

export function corsHeadersFor(origin: string | null) {
  const allowed = allowedOrigin(origin);
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function validRequestBody(value: unknown): value is { slug: string; pin: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 2 && typeof body.slug === 'string'
    && body.slug.trim().length >= 1 && body.slug.trim().length <= 128
    && typeof body.pin === 'string' && /^[0-9]{6}$/.test(body.pin);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function issueExpiry(now = new Date()) {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export function genericJson(status: number, body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
