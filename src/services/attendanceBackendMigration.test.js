import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clientIpFromXForwardedFor, normalizeClientIp } from '../../supabase/functions/attendance-access/shared.ts';

const sql = readFileSync(new URL('../../supabase/migrations/202609010001_add_attendance_v1_backend.sql', import.meta.url), 'utf8');
const grantFix = readFileSync(new URL('../../supabase/migrations/202609050001_fix_attendance_v1_function_grants.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../../supabase/functions/attendance-access/index.ts', import.meta.url), 'utf8');
const helpers = readFileSync(new URL('../../supabase/functions/attendance-access/shared.ts', import.meta.url), 'utf8');
const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
const publicSite = readFileSync(new URL('../../supabase/migrations/202608300001_add_homework_audio_support.sql', import.meta.url), 'utf8');

describe('Attendance V1 database contract', () => {
  it('preserves the original production-applied Attendance migration', () => {
    expect(createHash('sha256').update(sql).digest('hex')).toBe('e8679db1d428e6a552d495604d6d7535d3949185915dbef8f26df46533c6d576');
  });

  it('creates the five dedicated tables and no attendance day/blob model', () => {
    for (const table of ['attendance_students', 'attendance_absences', 'attendance_access', 'attendance_sessions', 'attendance_rate_limits']) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    expect(sql).not.toContain('attendance_days');
    expect(sql).not.toContain('app_states');
  });

  it('enforces roster, absence and session constraints', () => {
    expect(sql).toContain("check (btrim(display_name) <> '')");
    expect(sql).toContain('check (sort_order >= 0)');
    expect(sql).toContain('primary key (student_id, attendance_date, lesson_number)');
    expect(sql).toContain('check (lesson_number between 1 and 7)');
    expect(sql).toContain('references public.attendance_students(id) on delete restrict');
    expect(sql).toContain("check (token_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain('attendance_students_roster_idx');
    expect(sql).toContain('attendance_absences_date_student_idx');
    expect(sql).toContain('attendance_sessions_class_expiry_idx');
  });

  it('stores only slow PIN hashes and validates exactly six digits', () => {
    expect(sql).toContain("p_new_pin !~ '^[0-9]{6}$'");
    expect(sql).toContain("extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10))");
    expect(sql).not.toMatch(/\bpin\s+text\b/i);
    expect(sql).not.toMatch(/return[^;]*pin_hash/i);
  });

  it('rotates the access version and revokes old sessions', () => {
    expect(sql).toContain('access_version = public.attendance_access.access_version + 1');
    expect(sql).toMatch(/update public\.attendance_sessions set revoked_at = now\(\)[\s\S]*class_site_id = p_class_site_id/);
    expect(sql).toContain('ses.access_version = aa.access_version');
  });

  it('isolates teacher access through owned Class Sites and keeps internal tables private', () => {
    expect(sql.match(/cs\.owner_id = auth\.uid\(\)/g).length).toBeGreaterThanOrEqual(10);
    expect(sql).toContain("cs.source_teaching_group_id = 'grade8-a'");
    expect(sql).toContain('grant select, insert, update, delete on table public.attendance_students to authenticated');
    expect(sql).not.toMatch(/grant[^;]+attendance_(?:access|sessions|rate_limits)[^;]+to (?:anon|authenticated)/i);
    expect(sql).not.toMatch(/grant\s+select[^;]+to\s+anon/i);
  });

  it('requires owned grade8-a Class Sites in every roster CRUD policy', () => {
    const rosterPolicies = sql.slice(
      sql.indexOf('create policy attendance_students_teacher_select'),
      sql.indexOf('-- These policies document'),
    );
    expect(rosterPolicies.match(/cs\.owner_id = auth\.uid\(\)/g)).toHaveLength(5);
    expect(rosterPolicies.match(/cs\.source_teaching_group_id = 'grade8-a'/g)).toHaveLength(5);
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      expect(rosterPolicies).toContain(`attendance_students_teacher_${operation}`);
    }
  });

  it('keeps availability minimal and does not alter ordinary public RPCs', () => {
    const availability = sql.slice(sql.indexOf('create or replace function public.get_attendance_availability'), sql.indexOf('create or replace function public.set_attendance_pin'));
    expect(availability).toContain("jsonb_build_object('enabled', exists");
    for (const forbidden of ['display_name', 'pin_hash', 'owner_id', 'attendance_students']) expect(availability).not.toContain(forbidden);
    expect(publicSite).not.toContain('attendance_');
  });

  it('makes internal issuance service-role-only and persistently rate limits client and slug scopes', () => {
    expect(sql).toContain('grant execute on function public.issue_attendance_session(text, text, text, timestamptz, text, text) to service_role');
    expect(sql).not.toMatch(/grant execute on function public\.issue_attendance_session[^;]+to (?:anon|authenticated)/);
    expect(sql).toContain('else array[p_client_scope_hash, p_slug_scope_hash]');
    expect(sql).toContain('then array[p_slug_scope_hash]');
    expect(sql).toContain('then 8 else 50');
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain('delete from public.attendance_rate_limits where scope_hash = p_client_scope_hash');
  });

  it('allows student RPCs only a token and server-derived today', () => {
    expect(sql).toContain('function public.get_today_attendance(p_token text)');
    expect(sql).toContain('function public.set_today_student_absences(p_token text, p_student_id uuid, p_lesson_numbers smallint[])');
    expect(sql).not.toMatch(/function public\.get_today_attendance\([^)]*(?:date|slug|class_site|owner)/);
    expect(sql).not.toMatch(/function public\.set_today_student_absences\([^)]*p_attendance_date/);
    expect(sql.match(/timezone\('Asia\/Vladivostok', now\(\)\)::date/g).length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain('ast.class_site_id = v_site_id and ast.is_active = true');
  });

  it('validates lesson arrays, clears before insert, and serializes same-student/day saves', () => {
    expect(sql).toContain('attendance_lesson_set_is_valid');
    expect(sql).toContain('lesson not between 1 and 7');
    expect(sql).toContain('count(distinct lesson)');
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(sql.match(/delete from public\.attendance_absences/g).length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/insert into public\.attendance_absences/g).length).toBeGreaterThanOrEqual(2);
  });

  it('rejects teacher future dates and retains relevant inactive historical students', () => {
    expect(sql.match(/p_attendance_date > v_today/g)).toHaveLength(2);
    expect(sql).toContain('ast.is_active = true or exists');
    expect(sql).toContain('aa.attendance_date = p_attendance_date');
  });

  it('hardens every SECURITY DEFINER function and grants only intended entry points', () => {
    const definers = sql.match(/security definer/g) || [];
    expect(definers.length).toBeGreaterThanOrEqual(9);
    expect(sql.match(/security definer\s+set search_path = public, (?:extensions, )?pg_temp/g)).toHaveLength(definers.length);
    expect(sql).toContain('revoke all on function public.get_today_attendance(text) from public');
    expect(sql).toContain('grant execute on function public.get_today_attendance(text) to anon, authenticated');
  });
});

describe('Attendance V1 production function-grant hotfix', () => {
  const signature = {
    helper: [
      'public.set_attendance_updated_at()',
      'public.attendance_lesson_set_is_valid(smallint[])',
      'public.attendance_session_class_site(text)',
    ],
    internal: ['public.issue_attendance_session(text, text, text, timestamptz, text, text)'],
    student: [
      'public.get_attendance_availability(text)',
      'public.get_today_attendance(text)',
      'public.set_today_student_absences(text, uuid, smallint[])',
    ],
    teacher: [
      'public.set_attendance_pin(uuid, text)',
      'public.set_attendance_enabled(uuid, boolean)',
      'public.get_teacher_attendance_day(uuid, date)',
      'public.set_teacher_student_absences(uuid, date, smallint[])',
    ],
  };

  it('records the correction as an atomic follow-up migration', () => {
    expect(grantFix.trimStart().startsWith('-- Record the Attendance V1 function privilege hotfix')).toBe(true);
    expect(grantFix).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/);
  });

  it('makes helper and session-issuance functions service-role-only', () => {
    for (const functionSignature of [...signature.helper, ...signature.internal]) {
      expect(grantFix).toContain(`revoke execute on function ${functionSignature} from public, anon, authenticated;`);
      expect(grantFix).toContain(`grant execute on function ${functionSignature} to service_role;`);
    }
  });

  it('grants public Student RPCs only to the two browser roles and service role', () => {
    for (const functionSignature of signature.student) {
      expect(grantFix).toContain(`revoke execute on function ${functionSignature} from public, anon, authenticated;`);
      expect(grantFix).toContain(`grant execute on function ${functionSignature} to anon, authenticated, service_role;`);
    }
  });

  it('keeps every Teacher RPC unavailable to anon and available to authenticated', () => {
    for (const functionSignature of signature.teacher) {
      expect(grantFix).toContain(`revoke execute on function ${functionSignature} from public, anon, authenticated;`);
      expect(grantFix).toContain(`grant execute on function ${functionSignature} to authenticated, service_role;`);
      expect(grantFix).not.toContain(`grant execute on function ${functionSignature} to anon`);
    }
  });

  it('contains privilege changes only, with no schema or data mutation', () => {
    expect(grantFix).not.toMatch(/\b(?:create|alter|drop|truncate|insert|update|delete)\b(?!\s+on\s+function)/i);
    const statements = grantFix
      .replace(/^--.*$/gm, '')
      .split(';')
      .map(statement => statement.trim())
      .filter(Boolean);
    expect(statements.every(statement => /^(?:begin|commit|revoke execute on function|grant execute on function)\b/i.test(statement))).toBe(true);
  });
});

describe('attendance-access Edge Function contract', () => {
  it('explicitly disables gateway JWT verification because the Attendance PIN is the authentication boundary', () => {
    expect(config).toMatch(/^\[functions\.attendance-access\]\r?\nverify_jwt = false\r?\n?$/);
  });

  it('supports POST and OPTIONS only with restricted reflected CORS', () => {
    expect(edge).toContain("request.method === 'OPTIONS'");
    expect(edge).toContain("request.method !== 'POST'");
    expect(helpers).toContain('https://nuruanna.gitverse.site');
    expect(helpers).toContain("url.hostname === 'localhost'");
    expect(helpers).not.toContain("'Access-Control-Allow-Origin': '*'");
  });

  it('validates six digits and creates a crypto-random 30-day token', () => {
    expect(helpers).toContain('/^[0-9]{6}$/');
    expect(edge).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(edge).toContain('const tokenHash = await sha256Hex(token)');
    expect(helpers).toContain('30 * 24 * 60 * 60 * 1000');
    expect(edge).toContain('{ token, expiresAt }');
  });

  it('hashes rate-limit metadata and returns generic denial or 429 without logging secrets', () => {
    expect(edge).toContain("sha256Hex(`${scopeSecret}|client|");
    expect(edge).toContain("sha256Hex(`${scopeSecret}|slug|");
    expect(edge).not.toContain("get('user-agent')");
    expect(edge).not.toContain("get('cf-connecting-ip')");
    expect(edge).toContain("data?.status === 'rate_limited'");
    expect(edge).toContain("{ error: 'Attendance access denied.' }");
    expect(edge).not.toMatch(/console\.(?:log|info|error)/);
    expect(edge).not.toMatch(/['"](?:service_role|eyJ[A-Za-z0-9_-]+\.)/);
  });

  it.each([
    ['single IPv4', '203.0.113.7', '203.0.113.7'],
    ['IPv4 normalization', '203.000.113.007', '203.0.113.7'],
    ['IPv4 whitespace', '  203.0.113.7  ', '203.0.113.7'],
    ['IPv6', '2001:0DB8:0:0:0:0:0:1', '2001:db8::1'],
    ['IPv6 whitespace', '  2001:db8::8  ', '2001:db8::8'],
    ['bad IPv4', '999.0.0.1', null],
    ['bad text', 'not-an-ip', null],
    ['empty', '   ', null],
  ])('normalizes client IP safely: %s', (_label, value, expected) => {
    expect(normalizeClientIp(value)).toBe(expected);
  });

  it('selects the first valid address from an X-Forwarded-For chain', () => {
    expect(clientIpFromXForwardedFor('bad, 203.0.113.9, 198.51.100.4')).toBe('203.0.113.9');
    expect(clientIpFromXForwardedFor('2001:db8::1, 203.0.113.9')).toBe('2001:db8::1');
  });

  it('omits the client scope when X-Forwarded-For is absent or entirely malformed while retaining the slug scope', () => {
    expect(clientIpFromXForwardedFor(null)).toBeNull();
    expect(clientIpFromXForwardedFor('bad, 999.1.1.1')).toBeNull();
    expect(edge).toMatch(/clientIp\s*\? await sha256Hex/);
    expect(edge).toContain(': null');
    expect(edge).toContain('p_slug_scope_hash: slugScopeHash');
  });

  it('does not store or log raw IP addresses', () => {
    expect(edge).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(sql).not.toMatch(/\bip(?:_address)?\b/i);
    expect(sql).toContain('scope_hash text primary key');
  });

  it('keeps token hashing and generic response contracts unchanged', () => {
    expect(edge).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(edge).toContain('const tokenHash = await sha256Hex(token)');
    expect(sql).toContain("encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')");
    expect(edge).toContain("{ error: 'Attendance access denied.' }");
    expect(edge).toContain('{ token, expiresAt }');
  });
});
