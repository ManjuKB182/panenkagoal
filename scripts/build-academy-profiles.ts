// Builds data/karnataka/academy-profiles.json: for each Karnataka academy, the tournaments it plays in (from the stored league
// snapshots), the grounds it hosts matches at, and the players and coaches named in its recent match sheets.
// Run: npx tsx scripts/build-academy-profiles.ts   (needs network; re-run whenever you want the profiles refreshed)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fetchMatch } from '../src/lib/match';
import type { LeagueSnapshot } from '../src/lib/types';

const academies: { name: string; aiffName?: string; logo?: string }[] = JSON.parse(readFileSync('data/karnataka/academies.json', 'utf8'));
const leagues = readdirSync('data/snapshots/leagues').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`data/snapshots/leagues/${f}`, 'utf8')) as LeagueSnapshot);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const LEAGUE_NAMES: Record<string, string> = {
  'elite-u18': 'AIFF Elite Youth League (U18)', 'junior-u15': 'AIFF Junior League (U15)', 'sub-junior-u13': 'AIFF Sub-Junior League (U13)',
  iwl: "Indian Women's League", 'iwl-2': "Indian Women's League 2", 'bdfa-sd': 'KSFA Super Division', ifl: 'Indian Football League', isl: 'Indian Super League', 'i-league-2': 'I-League 2', 'i-league-3': 'I-League 3',
};

const out: Record<string, unknown> = {};
for (const acad of academies) {
  const a = { name: acad.aiffName ?? acad.name };
  const tournaments: unknown[] = [];
  for (const lg of leagues) {
    const rows = lg.stages.flatMap((st) => st.groups.map((g) => ({ st, g, r: g.rows.find((x) => same(x.team, a.name)) }))).filter((x) => x.r);
    const mine = lg.fixtures.filter((m) => same(m.home, a.name) || same(m.away, a.name));
    if (!rows.length && !mine.length) continue;
    // Home grounds and the squad come from this tournament's own matches, so senior and youth sides are never mixed.
    const venues = new Map<string, number>();
    for (const m of mine) if (same(m.home, a.name) && m.venue) venues.set(m.venue, (venues.get(m.venue) ?? 0) + 1);
    const recent = mine.filter((m) => m.status === 'ft' && m.id.startsWith('aiff-')).sort((x, y) => y.kickoff.localeCompare(x.kickoff)).slice(0, 3);
    const players = new Map<string, { name: string; position?: string; number?: number }>();
    const coaches = new Set<string>();
    let sheets = 0;
    for (const m of recent) {
      try {
        await new Promise((r) => setTimeout(r, 700));
        const d = await fetchMatch(m.id);
        const side = same(d.home.name, a.name) ? 'home' : same(d.away.name, a.name) ? 'away' : null;
        const lu = side && d.lineups?.[side];
        if (!lu) continue;
        sheets++;
        if (lu.coach) coaches.add(lu.coach);
        for (const p of [...lu.starters, ...lu.bench]) if (!players.has(p.name)) players.set(p.name, { name: p.name, position: p.position, number: p.number });
      } catch (e) { console.warn(`${acad.name} ${m.id}: ${(e as Error).message}`); }
    }
    const cur = rows.at(-1);
    tournaments.push({
      league: LEAGUE_NAMES[lg.slug] ?? lg.slug, slug: lg.slug, season: lg.seasonLabel,
      stage: cur?.st.name, group: cur?.g.name, pos: cur?.r?.pos, played: cur?.r?.played, won: cur?.r?.won, drawn: cur?.r?.drawn, lost: cur?.r?.lost,
      gf: cur?.r?.gf, ga: cur?.r?.ga, points: cur?.r?.points,
      grounds: [...venues.entries()].sort((x, y) => y[1] - x[1]).map(([v]) => v).slice(0, 2),
      coaches: [...coaches], sheets, players: [...players.values()],
    });
  }
  out[acad.name] = { tournaments, updatedAt: new Date().toISOString() };
  console.log(acad.name, tournaments.map((t: any) => `${t.slug}:${t.players.length}p`).join(' '));
}
writeFileSync('data/karnataka/academy-profiles.json', JSON.stringify(out, null, 1));
