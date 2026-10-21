import { describe, expect, it } from 'vitest';
import { activeLeagues } from '../scripts/ingest/gate.mjs';
import { currentSeason, parseAiffFixtures, zeroStages } from '../scripts/ingest/parsers';
import { parseAiffLive } from '../src/lib/live';

const at = (iso: string) => Date.parse(iso);
const rows = [
  { key: 'leagues/isl', ks: ['2026-10-17T17:00:00+05:30', '2026-10-17T19:30:00+05:30'] },
  { key: 'leagues/iwl', ks: ['2026-10-17T09:00:00+05:30'] },
  { key: 'leagues/bdfa-sd', ks: [] },
];

describe('match-day gate', () => {
  it('is quiet on a day with no match in play', () => {
    expect(activeLeagues(rows, at('2026-10-17T12:00:00+05:30'))).toEqual([]);
  });
  it('opens 15 min before kickoff', () => {
    expect(activeLeagues(rows, at('2026-10-17T16:45:00+05:30'))).toEqual(['isl']);
    expect(activeLeagues(rows, at('2026-10-17T16:44:00+05:30'))).toEqual([]);
  });
  it('stays open until 2 h 30 after the last kickoff, then closes', () => {
    expect(activeLeagues(rows, at('2026-10-17T22:00:00+05:30'))).toEqual(['isl']);
    expect(activeLeagues(rows, at('2026-10-17T22:01:00+05:30'))).toEqual([]);
  });
});

describe('season guard helpers', () => {
  it('rolls the season over in July', () => {
    expect(currentSeason(new Date('2026-10-21T00:00:00Z'))).toBe('2026-27');
    expect(currentSeason(new Date('2026-06-30T00:00:00Z'))).toBe('2025-26');
  });
  it('zeroes a stale table but keeps the teams', () => {
    const z = zeroStages([
      { name: 'Group Stage', groups: [{ name: 'A', rows: [{ pos: 1, team: 'X', played: 9, won: 7, drawn: 1, lost: 1, gf: 20, ga: 5, gd: 15, points: 22 }] }] },
      { name: 'Final Round', groups: [] },
    ]);
    expect(z).toHaveLength(1);
    expect(z[0].groups[0].rows[0]).toMatchObject({ team: 'X', played: 0, points: 0, gd: 0 });
  });
  it('keeps only the newest season when AIFF mixes two', () => {
    const f = (id: number, t: string) => ({ match_id: id, tournament_name: t, team1_name: 'A', team2_name: 'B', match_date: '2026-10-26', time: '15:00', ft: false });
    const { seasonLabel, matches } = parseAiffFixtures({ fixtures: [f(1, 'I-League 3 2025-26'), f(2, 'I-League 3 2026-27')] });
    expect(seasonLabel).toBe('I-League 3 2026-27');
    expect(matches.map((m) => m.id)).toEqual(['aiff-2']);
  });
});

describe('AIFF live', () => {
  const f = { match_id: 7, match_date: '2026-10-21', time: '16:00', timestamp: at('2026-10-21T16:00:00+05:30') / 1000, ft: false, team1_score: 1, team2_score: 0 };
  it('is live after kickoff with a score, ft once flagged', () => {
    expect(parseAiffLive({ fixtures: [f] }, at('2026-10-21T16:40:00+05:30'))[0]).toMatchObject({ id: 'aiff-7', state: 'live', homeScore: 1 });
    expect(parseAiffLive({ fixtures: [{ ...f, ft: true, team2_score: 2 }] }, at('2026-10-21T18:00:00+05:30'))[0]).toMatchObject({ state: 'ft', awayScore: 2 });
  });
});
