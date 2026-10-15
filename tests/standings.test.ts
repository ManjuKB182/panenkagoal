import { describe, expect, it } from 'vitest';
import { computeTable, type ResultInput } from '../src/lib/standings';

const r = (home: string, homeScore: number, awayScore: number, away: string, date = '2026-09-10'): ResultInput => ({ home, away, homeScore, awayScore, date });

describe('computeTable', () => {
  it('awards 3 for a win, 1 for a draw and counts goals', () => {
    const t = computeTable(['A', 'B', 'C'], [r('A', 2, 0, 'B'), r('B', 1, 1, 'C')]);
    expect(t.map((x) => [x.team, x.points, x.gd])).toEqual([['A', 3, 2], ['C', 1, 0], ['B', 1, -2]]);
    expect(t[0]).toMatchObject({ pos: 1, played: 1, won: 1, gf: 2, ga: 0 });
  });

  it('lists teams with no games played', () => {
    const t = computeTable(['A', 'B', 'Z'], [r('A', 1, 0, 'B')]);
    // Z (GD 0) ranks above B (GD -1) even without playing.
    expect(t.find((x) => x.team === 'Z')).toMatchObject({ played: 0, points: 0, pos: 2 });
  });

  // A and B finish level on 4 points. B has the better goal difference, but A won the head-to-head.
  const level = [r('A', 1, 0, 'B'), r('B', 4, 0, 'C'), r('A', 0, 0, 'D'), r('B', 0, 0, 'D')];

  it('breaks a points tie on head-to-head before goal difference (AIFF rule)', () => {
    const t = computeTable(['A', 'B', 'C', 'D'], level);
    expect(t.slice(0, 2).map((x) => [x.team, x.points])).toEqual([['A', 4], ['B', 4]]);
  });

  it('uses goal difference first when the rules say so', () => {
    const t = computeTable(['A', 'B', 'C', 'D'], level, { win: 3, draw: 1, tiebreak: 'gd-first' });
    expect(t.slice(0, 2).map((x) => x.team)).toEqual(['B', 'A']);
  });

  it('keeps the last five results as form, oldest first', () => {
    const games = ['01', '02', '03', '04', '05', '06'].map((d, i) => r('A', i % 2 ? 0 : 2, 1, 'B', `2026-09-${d}`));
    // A's six results in date order: W L W L W L. The last five are L W L W L.
    expect(computeTable(['A', 'B'], games).find((x) => x.team === 'A')!.form).toBe('LWLWL');
  });
});
