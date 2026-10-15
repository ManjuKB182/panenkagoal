import type { SectionKey } from './site';

// Every league the Stats section tracks. A rename or a new season is an edit here, not a code change.
export type Source =
  | { kind: 'isl'; seriesId: number; tournament: string }
  | { kind: 'aiff'; type: number }
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
    source: { kind: 'ifl', slug: 'i-league' },
    sourceLabel: 'Indian Football League',
    sourceUrl: 'https://indianfootballleague.in/',
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
    slug: 'iwl',
    name: "Indian Women's League",
    short: 'IWL',
    section: 'wofo',
    gender: 'women',
    source: { kind: 'aiff', type: 11 },
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
    source: { kind: 'aiff', type: 69 },
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
    name: 'BDFA Super Division',
    short: 'BDFA SD',
    section: 'karnataka',
    gender: 'men',
    source: { kind: 'manual', file: 'data/manual/bdfa-sd.json' },
    sourceLabel: 'Panenka Goal (entered from KSFA / club posts)',
    sourceUrl: 'https://www.instagram.com/ksfaofficial',
    zones: { top: 1 },
  },
];

// The six leagues shown first in the homepage table switcher.
export const HOME_TABLES = ['isl', 'ifl', 'iwl', 'iwl-2', 'i-league-2', 'bdfa-sd'];

export const getCompetition = (slug: string) => COMPETITIONS.find((c) => c.slug === slug);
