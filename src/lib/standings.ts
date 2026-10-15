import type { StandingRow } from './types';

export interface ResultInput {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  date?: string;
}

export interface TableRules {
  win: number;
  draw: number;
  // AIFF competitions rank level teams by head-to-head before goal difference.
  tiebreak: 'h2h-first' | 'gd-first';
}

export const AIFF_RULES: TableRules = { win: 3, draw: 1, tiebreak: 'h2h-first' };

interface Acc extends Omit<StandingRow, 'pos'> {}

function blank(team: string): Acc {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: '' };
}

function tally(teams: string[], results: ResultInput[], rules: TableRules): Map<string, Acc> {
  const table = new Map<string, Acc>(teams.map((t) => [t, blank(t)]));
  const sorted = [...results].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  for (const r of sorted) {
    for (const t of [r.home, r.away]) if (!table.has(t)) table.set(t, blank(t));
    const h = table.get(r.home)!;
    const a = table.get(r.away)!;
    h.played++; a.played++;
    h.gf += r.homeScore; h.ga += r.awayScore;
    a.gf += r.awayScore; a.ga += r.homeScore;
    if (r.homeScore > r.awayScore) {
      h.won++; a.lost++; h.points += rules.win; h.form += 'W'; a.form += 'L';
    } else if (r.homeScore < r.awayScore) {
      a.won++; h.lost++; a.points += rules.win; a.form += 'W'; h.form += 'L';
    } else {
      h.drawn++; a.drawn++; h.points += rules.draw; a.points += rules.draw; h.form += 'D'; a.form += 'D';
    }
  }
  for (const row of table.values()) {
    row.gd = row.gf - row.ga;
    row.form = row.form!.slice(-5);
  }
  return table;
}

const byGoals = (x: Acc, y: Acc) => y.gd - x.gd || y.gf - x.gf;

/** Order teams that are level on points. Head-to-head is computed only among the tied teams. */
function breakTie(tied: Acc[], results: ResultInput[], rules: TableRules): Acc[] {
  if (tied.length < 2) return tied;
  if (rules.tiebreak === 'gd-first') return [...tied].sort((x, y) => byGoals(x, y) || x.team.localeCompare(y.team));

  const names = new Set(tied.map((t) => t.team));
  const mini = tally(
    [...names],
    results.filter((r) => names.has(r.home) && names.has(r.away)),
    rules,
  );
  return [...tied].sort((x, y) => {
    const mx = mini.get(x.team)!;
    const my = mini.get(y.team)!;
    return my.points - mx.points || my.gd - mx.gd || my.gf - mx.gf || byGoals(x, y) || x.team.localeCompare(y.team);
  });
}

export function computeTable(teams: string[], results: ResultInput[], rules: TableRules = AIFF_RULES): StandingRow[] {
  const table = [...tally(teams, results, rules).values()];
  const byPoints = new Map<number, Acc[]>();
  for (const row of table) byPoints.set(row.points, [...(byPoints.get(row.points) ?? []), row]);
  const ordered = [...byPoints.keys()]
    .sort((a, b) => b - a)
    .flatMap((pts) => breakTie(byPoints.get(pts)!, results, rules));
  return ordered.map((row, i) => ({ ...row, pos: i + 1 }));
}
