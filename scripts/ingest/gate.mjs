// Match-day gate. Prints "leagues=<slug,slug>" (to GITHUB_OUTPUT too): the leagues with a match in play right now.
// Window per match: 15 min before kickoff until 2 h 30 min after it, so the run that follows full time is always inside.
// Reads only kickoff times from Neon over its HTTP endpoint, so this job needs no npm install and costs seconds.
import { appendFile } from 'node:fs/promises';

const BEFORE = 15 * 60_000;
const AFTER = 150 * 60_000;

export function activeLeagues(rows, now = Date.now()) {
  return rows
    .filter((r) => (r.ks ?? []).some((k) => { const d = now - Date.parse(k); return d >= -BEFORE && d <= AFTER; }))
    .map((r) => String(r.key).replace(/^leagues\//, ''));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  const host = new URL(url.replace(/^postgres(ql)?:/, 'https:')).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: { 'Neon-Connection-String': url, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `select key, (select coalesce(jsonb_agg(f->>'kickoff'), '[]'::jsonb) from jsonb_array_elements(coalesce(data->'fixtures', '[]'::jsonb)) f) as ks
              from datasets where key like 'leagues/%' and key not like 'leagues/archive/%'`,
    }),
  });
  if (!res.ok) throw new Error(`Neon ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const rows = (body.rows ?? []).map((r) => (Array.isArray(r) ? { key: r[0], ks: r[1] } : r));
  const leagues = activeLeagues(rows).join(',');
  console.log(`leagues=${leagues}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `leagues=${leagues}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    // If the gate itself fails, run everything for this tick rather than miss a result.
    console.error(`::warning::gate failed: ${e.message}`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `leagues=isl,ifl,i-league-2,i-league-3,iwl,iwl-2,bdfa-sd\n`);
  });
}
