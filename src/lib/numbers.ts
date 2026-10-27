// "Numbers" shown under a league table, worked out from that league's own table, results and scorers.
import type { LeagueSnapshot, Match, StandingRow } from './types';
import { digits, t, type Locale } from '../i18n';

export interface Stat { label: string; team: string; value: string; note?: string }

const played = (r: StandingRow) => r.played > 0;
const best = <T,>(xs: T[], key: (x: T) => number, dir: 1 | -1 = 1) => xs.reduce<T | undefined>((a, x) => (a === undefined || (key(x) - key(a)) * dir > 0 ? x : a), undefined);

export function teamStats(data: LeagueSnapshot | null, locale: Locale = 'en'): Stat[] {
  const rows = (data?.stages[0]?.groups.flatMap((g) => g.rows) ?? []).filter(played);
  if (rows.length < 2) return [];
  const out: Stat[] = [];
  const n = (v: number | string) => digits(locale, v);
  const atk = best(rows, (r) => r.gf);
  const def = best(rows, (r) => r.ga, -1);
  const wins = best(rows, (r) => r.won);
  const gd = best(rows, (r) => r.gd);
  const draws = best(rows, (r) => r.drawn);
  const perMatch = (x: number) => t(locale, 'sections.stat.perMatch', { avg: n(x.toFixed(1)) });
  if (atk) out.push({ label: t(locale, 'sections.stat.bestAttack'), team: atk.team, value: t(locale, 'sections.stat.goals', { n: n(atk.gf) }), note: perMatch(atk.gf / atk.played) });
  if (def) out.push({ label: t(locale, 'sections.stat.bestDefence'), team: def.team, value: t(locale, 'sections.stat.conceded', { n: n(def.ga) }), note: perMatch(def.ga / def.played) });
  if (wins) out.push({ label: t(locale, 'sections.stat.mostWins'), team: wins.team, value: t(locale, 'sections.stat.wins', { n: n(wins.won) }), note: t(locale, 'sections.stat.fromPlayed', { n: n(wins.played) }) });
  if (gd) out.push({ label: t(locale, 'sections.stat.bestGd'), team: gd.team, value: n(gd.gd > 0 ? `+${gd.gd}` : String(gd.gd)) });
  if (draws && draws.drawn > 0) out.push({ label: t(locale, 'sections.stat.mostDraws'), team: draws.team, value: t(locale, 'sections.stat.draws', { n: n(draws.drawn) }) });
  return out;
}

export function matchStats(data: LeagueSnapshot | null) {
  const done = (data?.fixtures ?? []).filter((m): m is Match & { homeScore: number; awayScore: number } => m.status === 'ft' && m.homeScore != null && m.awayScore != null);
  const total = done.reduce((n, m) => n + m.homeScore + m.awayScore, 0);
  const biggest = [...done].sort((a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore) || b.homeScore + b.awayScore - (a.homeScore + a.awayScore)).slice(0, 3);
  const topScoring = [...done].sort((a, b) => b.homeScore + b.awayScore - (a.homeScore + a.awayScore)).slice(0, 3);
  return { count: done.length, goals: total, perMatch: done.length ? total / done.length : 0, biggest, topScoring };
}
