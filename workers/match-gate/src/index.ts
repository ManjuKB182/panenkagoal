// Match-day trigger. Runs every 5 min on Cloudflare cron (more reliable than GitHub's */5 schedule).
// Reads today's kickoffs from the league snapshots committed to the repo (no Neon: its free quota ran out and silently stopped every dispatch),
// and only when a league has a match in its window, dispatches the ingest workflow for those leagues.
// Keep LEAGUE_SLUGS and the window in sync with scripts/ingest/gate.mjs.

export interface Env {
  GITHUB_TOKEN: string; // fine-grained token, Actions: read/write on this repo (secret)
  GITHUB_REPO: string; // "owner/repo"
}

const BEFORE = 15 * 60_000;
const AFTER = 240 * 60_000;

// Every league with a snapshot file under data/snapshots/leagues/ (archive excluded).
export const LEAGUE_SLUGS = [
  'bdfa-sd', 'elite-u18', 'i-league-2', 'i-league-3', 'ifl', 'isl', 'iwl', 'iwl-2', 'junior-u15', 'rfdl-u21', 'sub-junior-u13',
];

export function activeLeagues(rows: { key: string; ks: string[] }[], now = Date.now()): string[] {
  return rows
    .filter((r) => (r.ks ?? []).some((k) => { const d = now - Date.parse(k); return d >= -BEFORE && d <= AFTER; }))
    .map((r) => String(r.key).replace(/^leagues\//, ''));
}

// Reads kickoffs for one league from the repo snapshot. A failed read counts as "in play" so a result is never missed.
async function kickoffsFor(env: Env, slug: string): Promise<{ key: string; ks: string[] }> {
  const url = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/data/snapshots/leagues/${slug}.json?t=${Date.now()}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'panenka-match-gate' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap: any = await res.json();
    const ks = (snap.fixtures ?? []).map((f: any) => f.kickoff).filter(Boolean);
    return { key: `leagues/${slug}`, ks };
  } catch (e) {
    console.log(`snapshot read failed for ${slug}: ${(e as Error).message}; treating as active`);
    return { key: `leagues/${slug}`, ks: [new Date().toISOString()] };
  }
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
    const rows = await Promise.all(LEAGUE_SLUGS.map((s) => kickoffsFor(env, s)));
    const leagues = activeLeagues(rows);
    console.log(`leagues=${leagues.join(',')}`);
    if (leagues.length) await dispatchIngest(env, leagues);
  },
};
