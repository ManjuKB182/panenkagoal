import { describe, expect, it } from 'vitest';
import { to24 } from '../src/lib/kickoff';
import { parseAiffTournamentSchedule } from '../scripts/ingest/parsers';

describe('to24', () => {
  it('reads 12-hour kickoffs as 24-hour', () => {
    expect(to24('04:00 PM')).toBe('16:00');
    expect(to24('05:00 PM')).toBe('17:00');
    expect(to24('12:30 PM')).toBe('12:30');
  });
  it('treats an early-hour AM label as a pm kickoff', () => {
    expect(to24('04:00 AM')).toBe('16:00');
  });
});

describe('parseAiffTournamentSchedule', () => {
  it('skips calendar events without a date instead of writing a null kickoff', () => {
    const json = { events: [
      { id: 1, date: null, time: '04:00 PM', team1_id: 1, team2_id: 2, t1_name: 'A', t2_name: 'B' },
      { id: 2, date: '2026-10-22', time: '04:00 PM', team1_id: 1, team2_id: 2, t1_name: 'A', t2_name: 'B' },
    ] };
    const matches = parseAiffTournamentSchedule(json, new Map());
    expect(matches.map((m) => m.id)).toEqual(['aiff-2']);
    expect(matches[0].kickoff).toBe('2026-10-22T16:00:00+05:30');
  });
});
