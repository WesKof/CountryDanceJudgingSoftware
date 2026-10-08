import { env } from 'cloudflare:workers';

export function getDb(): D1Database {
  const binding = (env as { DB?: D1Database }).DB;
  if (!binding) throw new Error('LIVE_STORAGE_UNAVAILABLE');
  return binding;
}
