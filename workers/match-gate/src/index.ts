// Match-day trigger. Runs every 5 min on Cloudflare cron (more reliable than GitHub's */5 schedule).
// Reads today's kickoffs from Neon and, only when a league has a match in its window, dispatches the ingest workflow for those leagues.
// activeLeagues mirrors scripts/ingest/gate.mjs; keep the two in sync.

export interface Env {
  DATABASE_URL: string; // Neon connection string (secret)
  GITHUB_TOKEN: string; // fine-grained token, Actions: read/write on this repo (secret)
  GITHUB_REPO: string; // "owner/repo"
}

const BEFORE = 15 * 60_000;
const AFTER = 240 * 60_000;

export function activeLeagues(rows: { key: string; ks: string[] }[], now = Date.now()): string[] {
  return rows
    .filter((r) => (r.ks ?? []).some((k) => { const d = now - Date.parse(k); return d >= -BEFORE && d <= AFTER; }))
    .map((r) => String(r.key).replace(/^leagues\//, ''));
}

async function kickoffRows(env: Env) {
  const host = new URL(env.DATABASE_URL.replace(/^postgres(ql)?:/, 'https:')).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: { 'Neon-Connection-String': env.DATABASE_URL, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `select key, (select coalesce(jsonb_agg(f->>'kickoff'), '[]'::jsonb) from jsonb_array_elements(coalesce(data->'fixtures', '[]'::jsonb)) f) as ks
              from datasets where key like 'leagues/%' and key not like 'leagues/archive/%'`,
    }),
  });
  if (!res.ok) throw new Error(`Neon ${res.status}: ${await res.text()}`);
  const body: any = await res.json();
  return (body.rows ?? []).map((r: any) => (Array.isArray(r) ? { key: r[0], ks: r[1] } : r));
}

async function dispatchIngest(env: Env, leagues: string[]) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/ingest.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'panenka-match-gate',
    },
    body: JSON.stringify({ ref: 'main', inputs: { leagues: leagues.join(',') } }),
  });
  if (!res.ok) throw new Error(`GitHub dispatch ${res.status}: ${await res.text()}`);
}

export default {
  async scheduled(_event: { cron: string }, env: Env): Promise<void> {
    const leagues = activeLeagues(await kickoffRows(env));
    console.log(`leagues=${leagues.join(',')}`);
    if (leagues.length) await dispatchIngest(env, leagues);
  },
};
