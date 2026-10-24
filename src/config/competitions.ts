import type { SectionKey } from './site';

// Every league the Stats section tracks. A rename or a new season is an edit here, not a code change.
export type Source =
  | { kind: 'isl'; seriesId: number; tournament: string }
  // tableFromFixtures: the feed's points table is another competition's, so the table is built from the fixtures instead.
  | { kind: 'aiff'; type: number; tableFromFixtures?: boolean }
  | { kind: 'aiff-tournament'; id: number } // AIFF state leagues, by tournament id (the AIFF app's competition id)
  | { kind: 'ifl'; slug: string }
  | { kind: 'manual'; file: string };

export type Fallback = { kind: 'ifl'; slug: string } | { kind: 'transfermarkt'; code: string };

export interface Competition {
  slug: string;
  name: string;
  short: string;
  section: SectionKey;
  gender: 'men' | 'women';
  source: Source;
  sourceLabel: string;
  sourceUrl: string;
  // Tried in order, and only while the main source still publishes last season (AIFF lags at season start).
  // A fallback is accepted only if its own data is for the current season. Never overrides a current-season source.
  fallbacks?: Fallback[];
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
    fallbacks: [{ kind: 'ifl', slug: 'i-league' }, { kind: 'transfermarkt', code: 'INIL' }],
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
    fallbacks: [{ kind: 'ifl', slug: 'ileague-2' }, { kind: 'transfermarkt', code: 'IND2' }],
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
    fallbacks: [{ kind: 'ifl', slug: '3rd-division-league' }, { kind: 'transfermarkt', code: 'IN4L' }],
  },
  {
    slug: 'iwl',
    name: "Indian Women's League",
    short: 'IWL',
    section: 'wofo',
    gender: 'women',
    // AIFF type 11 has the IWL top division's points table, but its fixtures are IWL 2 2026-27. Top division stays hand-kept until verified.
    source: { kind: 'manual', file: 'data/manual/iwl.json' },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/iwl',
    fallbacks: [{ kind: 'ifl', slug: 'iwl' }],
    zones: { top: 1 },
  },
  {
    slug: 'iwl-2',
    name: "Indian Women's League 2",
    short: 'IWL 2',
    section: 'wofo',
    gender: 'women',
    // Type 11's points table is the IWL top division, so the table comes from these fixtures. Type 69 is the finished 2025-26 IWL 2.
    source: { kind: 'aiff', type: 11, tableFromFixtures: true },
    sourceLabel: 'AIFF',
    sourceUrl: 'https://www.the-aiff.com/competitions/iwl-2',
    fallbacks: [{ kind: 'ifl', slug: 'iwl-2' }],
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
