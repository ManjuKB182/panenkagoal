import type { SectionKey } from './site';

// Every league the Stats section tracks. A rename or a new season is an edit here, not a code change.
export type Source =
  | { kind: 'isl'; seriesId: number; tournament: string }
  | { kind: 'aiff'; type: number }
  | { kind: 'aiff-tournament'; id: number } // AIFF state leagues, by tournament id (the AIFF app's competition id)
  | { kind: 'ifl'; slug: string }
  | { kind: 'manual'; file: string };

export interface Competition {
  slug: string;
  name: string;
  short: string;
  section: SectionKey;
  gender: 'men' | 'women';
  source: Source;
  sourceLabel: string;
  sourceUrl: string;
  // Rows coloured by zone on the table. Positions are 1-based and inclusive.
  zones?: { top?: number; promotion?: number; relegation?: number };
}

export const COMPETITIONS: Competition[] = [
  {
    slug: 'isl',
    name: 'Indian Super League',
    short: 'ISL',
    section: 'mens',
    gender: 'men',
    source: { kind: 'isl', seriesId: 944, tournament: 'india_sl_2026' },
    sourceLabel: 'Indian Super League',
    sourceUrl: 'https://www.indiansuperleague.com/standings',
    zones: { top: 6 },
  },
  {
    slug: 'ifl',
    name: 'Indian Football League',
    short: 'IFL',
    section: 'mens',
    gender: 'men',
    source: { kind: 'aiff', type: 1 }, // the AIFF feed already carries the 2026-27 table; indianfootballleague.in is still on 2025-26
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/i-league',
    zones: { promotion: 1 },
  },
  {
    slug: 'i-league-2',
    name: 'I-League 2',
    short: 'IL2',
    section: 'mens',
    gender: 'men',
    source: { kind: 'aiff', type: 6 },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/2nd-division-league',
    zones: { promotion: 2 },
  },
  {
    slug: 'i-league-3',
    name: 'I-League 3',
    short: 'IL3',
    section: 'mens',
    gender: 'men',
    source: { kind: 'aiff', type: 67 },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/i-league-3',
  },
  {
    slug: 'iwl',
    name: "Indian Women's League",
    short: 'IWL',
    section: 'wofo',
    gender: 'women',
    // AIFF's IWL feed (type 11) now carries IWL 2 2026-27, so the top division has no 2026-27 source yet:
    // teams listed by hand with zero results. Switch to an 'aiff' source once AIFF publishes it.
    source: { kind: 'manual', file: 'data/manual/iwl.json' },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/iwl',
    zones: { top: 1 },
  },
  {
    slug: 'iwl-2',
    name: "Indian Women's League 2",
    short: 'IWL 2',
    section: 'wofo',
    gender: 'women',
    source: { kind: 'aiff', type: 11 }, // type 69 is the finished 2025-26 IWL 2
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/iwl-2',
  },
  {
    slug: 'elite-u18',
    name: 'AIFF Elite Youth League (U18)',
    short: 'U18',
    section: 'youth',
    gender: 'men',
    source: { kind: 'aiff', type: 3 },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/elite-league',
  },
  {
    slug: 'junior-u15',
    name: 'AIFF Junior League (U15)',
    short: 'U15',
    section: 'youth',
    gender: 'men',
    source: { kind: 'aiff', type: 4 },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/junior-league',
  },
  {
    slug: 'sub-junior-u13',
    name: 'AIFF Sub-Junior League (U13)',
    short: 'U13',
    section: 'youth',
    gender: 'men',
    source: { kind: 'aiff', type: 5 },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/sub-junior-league',
  },
  {
    slug: 'bdfa-sd',
    name: 'KSFA Super Division',
    short: 'KSFA SD',
    section: 'karnataka',
    gender: 'men',
    source: { kind: 'aiff-tournament', id: 2148 },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/calendar?competition_id=2148',
    zones: { top: 1 },
  },
];

// The leagues shown first in the homepage table switcher.
export const HOME_TABLES = ['isl', 'ifl', 'iwl', 'iwl-2', 'i-league-2', 'i-league-3', 'bdfa-sd'];

export const getCompetition = (slug: string) => COMPETITIONS.find((c) => c.slug === slug);
