import { describe, expect, it } from 'vitest';
import { activeLeagues } from '../workers/match-gate/src/index';

const at = (iso: string) => Date.parse(iso);
const rows = [
  { key: 'leagues/isl', ks: ['2026-10-17T17:00:00+05:30', '2026-10-17T19:30:00+05:30'] },
  { key: 'leagues/iwl', ks: ['2026-10-17T09:00:00+05:30'] },
  { key: 'leagues/bdfa-sd', ks: [] },
];

describe('match-gate worker', () => {
  it('returns nothing when no match is in its window', () => {
    expect(activeLeagues(rows, at('2026-10-17T14:00:00+05:30'))).toEqual([]);
  });
  it('opens 15 min before kickoff', () => {
    expect(activeLeagues(rows, at('2026-10-17T16:45:00+05:30'))).toEqual(['isl']);
    expect(activeLeagues(rows, at('2026-10-17T16:44:00+05:30'))).toEqual([]);
  });
  it('stays open 4 h after the last kickoff', () => {
    expect(activeLeagues(rows, at('2026-10-17T23:30:00+05:30'))).toEqual(['isl']);
    expect(activeLeagues(rows, at('2026-10-17T23:31:00+05:30'))).toEqual([]);
  });
});
