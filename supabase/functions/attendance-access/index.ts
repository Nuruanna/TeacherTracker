import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { clientIpFromXForwardedFor, corsHeadersFor, genericJson, issueExpiry, sha256Hex, validRequestBody } from './shared.ts';

Deno.serve(async request => {
  const cors = corsHeadersFor(request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return genericJson(405, { error: 'Method not allowed.' }, cors);

  let body: unknown;
  try { body = await request.json(); } catch { return genericJson(400, { error: 'Invalid request.' }, cors); }
  if (!validRequestBody(body)) return genericJson(400, { error: 'Invalid request.' }, cors);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const scopeSecret = Deno.env.get('ATTENDANCE_RATE_LIMIT_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !scopeSecret) return genericJson(500, { error: 'Attendance access is unavailable.' }, cors);

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256Hex(token);
  const normalizedSlug = body.slug.trim();
  const clientIp = clientIpFromXForwardedFor(request.headers.get('x-forwarded-for'));
  const clientScopeHash = clientIp
    ? await sha256Hex(`${scopeSecret}|client|${normalizedSlug}|${clientIp}`)
    : null;
  const slugScopeHash = await sha256Hex(`${scopeSecret}|slug|${normalizedSlug}`);
  const expiresAt = issueExpiry();
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('issue_attendance_session', {
    p_slug: normalizedSlug,
    p_pin: body.pin,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_client_scope_hash: clientScopeHash,
    p_slug_scope_hash: slugScopeHash,
  });
  if (error) return genericJson(401, { error: 'Attendance access denied.' }, cors);
  if (data?.status === 'rate_limited') return genericJson(429, { error: 'Too many attempts. Try again later.' }, cors);
  if (data?.status !== 'issued') return genericJson(401, { error: 'Attendance access denied.' }, cors);
  return genericJson(200, { token, expiresAt }, cors);
});
