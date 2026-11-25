// Team pages: one per club per league, linked from every standings table. Build-time only.
import { COMPETITIONS, type Competition } from '../config/competitions';
import { getLeague } from './data';
import type { Match, StandingRow } from './types';

export const teamSlug = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';

export const teamHref = (comp: Pick<Competition, 'slug'>, team: string) => `/stats/${comp.slug}/${teamSlug(team)}`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Every fixture of this club this season, oldest first. Matched on full name, or on the short code when the feed spells names differently. */
export function fixturesOf(row: StandingRow, fixtures: Match[]): Match[] {
  const name = norm(row.team);
  const short = row.short ? norm(row.short) : '';
  const is = (n: string, s?: string) => norm(n) === name || (!!short && !!s && norm(s) === short);
  return fixtures.filter((m) => is(m.home, m.homeShort) || is(m.away, m.awayShort)).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export function teamPaths() {
  const out: Array<{ params: { slug: string; team: string }; props: { comp: Competition; row: StandingRow; stageName: string; groupName: string } }> = [];
  for (const comp of COMPETITIONS) {
    const data = getLeague(comp);
    if (!data) continue;
    const seen = new Set<string>();
    for (const stage of data.stages) for (const g of stage.groups) for (const row of g.rows) {
      const team = teamSlug(row.team);
      if (seen.has(team)) continue;
      seen.add(team);
      out.push({ params: { slug: comp.slug, team }, props: { comp, row, stageName: stage.name, groupName: g.name } });
    }
  }
  return out;
}
