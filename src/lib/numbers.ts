// "Numbers" shown under a league table, worked out from that league's own table, results and scorers.
import type { LeagueSnapshot, Match, StandingRow } from './types';

export interface Stat { label: string; team: string; value: string; note?: string }

const played = (r: StandingRow) => r.played > 0;
const best = <T,>(xs: T[], key: (x: T) => number, dir: 1 | -1 = 1) => xs.reduce<T | undefined>((a, x) => (a === undefined || (key(x) - key(a)) * dir > 0 ? x : a), undefined);

export function teamStats(data: LeagueSnapshot | null): Stat[] {
  const rows = (data?.stages[0]?.groups.flatMap((g) => g.rows) ?? []).filter(played);
  if (rows.length < 2) return [];
  const out: Stat[] = [];
  const atk = best(rows, (r) => r.gf);
  const def = best(rows, (r) => r.ga, -1);
  const wins = best(rows, (r) => r.won);
  const gd = best(rows, (r) => r.gd);
  const draws = best(rows, (r) => r.drawn);
  if (atk) out.push({ label: 'Best attack', team: atk.team, value: `${atk.gf} goals`, note: `${(atk.gf / atk.played).toFixed(1)} per match` });
  if (def) out.push({ label: 'Best defence', team: def.team, value: `${def.ga} conceded`, note: `${(def.ga / def.played).toFixed(1)} per match` });
  if (wins) out.push({ label: 'Most wins', team: wins.team, value: `${wins.won} wins`, note: `from ${wins.played} played` });
  if (gd) out.push({ label: 'Best goal difference', team: gd.team, value: gd.gd > 0 ? `+${gd.gd}` : String(gd.gd) });
  if (draws && draws.drawn > 0) out.push({ label: 'Most draws', team: draws.team, value: `${draws.drawn} draws` });
  return out;
}

export function matchStats(data: LeagueSnapshot | null) {
  const done = (data?.fixtures ?? []).filter((m): m is Match & { homeScore: number; awayScore: number } => m.status === 'ft' && m.homeScore != null && m.awayScore != null);
  const total = done.reduce((n, m) => n + m.homeScore + m.awayScore, 0);
  const biggest = [...done].sort((a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore) || b.homeScore + b.awayScore - (a.homeScore + a.awayScore)).slice(0, 3);
  const topScoring = [...done].sort((a, b) => b.homeScore + b.awayScore - (a.homeScore + a.awayScore)).slice(0, 3);
  return { count: done.length, goals: total, perMatch: done.length ? total / done.length : 0, biggest, topScoring };
}
