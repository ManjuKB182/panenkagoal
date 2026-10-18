import { json, type Env } from '../../../src/lib/write';

// GET /api/write/config: public settings the submit form needs (read at request time, so no rebuild).
export const onRequestGet = ({ env }: { env: Env }) =>
  json({ turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY || null }, 200, { 'cache-control': 'public, max-age=300' });
