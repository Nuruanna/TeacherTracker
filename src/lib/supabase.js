import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const redactString = value => value
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
  .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[SUPABASE KEY REDACTED]')
  .slice(0, 1000);

const safeRealtimeData = (value, key = '', depth = 0) => {
  if (/token|authorization|api.?key|secret|password/i.test(key)) return '[REDACTED]';
  if (key === 'state') return '[AppState omitted]';
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 6) return '[Nested data omitted]';
  if (Array.isArray(value)) return value.slice(0, 30).map(item => safeRealtimeData(item, '', depth + 1));
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, safeRealtimeData(child, childKey, depth + 1)]));
};

const realtimeOptions = import.meta.env.DEV
  ? {
      logLevel: 'info',
      logger(kind, msg, data) {
        if (!['push', 'receive', 'transport', 'error'].includes(kind)) return;
        console.info(`[supabase realtime:${kind}] ${msg}`, safeRealtimeData(data));
      },
    }
  : undefined;

export const supabaseConfigurationError =
  !supabaseUrl || !supabasePublishableKey
    ? "Supabase connection is not configured. Add the required environment variables and restart the app."
    : null;

export const supabase = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      ...(realtimeOptions ? { realtime: realtimeOptions } : {}),
    });
