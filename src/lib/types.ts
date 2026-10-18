// Normalised shapes shared by the ingest scripts (writers) and the site (reader).
import type { SectionKey } from '../config/site';

export interface Video {
  id: string; // YouTube video id
  title: string;
  publishedAt: string; // ISO
  thumbnail: string;
  channel: 'panenka' | 'isl';
  show?: string; // show slug for Panenka videos
  short?: boolean; // YouTube Short (checked once per video at ingest)
  views?: number;
  description?: string;
}

export interface NewsItem {
  id: string;
  source: 'KhelNow' | 'The Hindu' | 'Deccan Herald' | 'Times of India' | 'AIFF' | 'X' | 'Instagram' | 'Panenka';
  title: string;
  summary?: string;
  url: string;
  publishedAt: string;
  category?: string;
  section: SectionKey | null;
}

export interface StandingRow {
  pos: number;
  prevPos?: number;
  team: string;
  short?: string;
  logo?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form?: string; // most recent last, e.g. "WWDLW"
}

export interface StandingsGroup {
  name: string; // "" when the stage has a single table
  rows: StandingRow[];
}

export interface Stage {
  name: string;
  groups: StandingsGroup[];
}

export type MatchStatus = 'scheduled' | 'live' | 'ft' | 'postponed';

export interface Match {
  id: string;
  kickoff: string; // ISO with +05:30 offset
  home: string;
  away: string;
  homeShort?: string;
  awayShort?: string;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
  venue?: string;
  round?: string;
  goals?: { player: string; team: string }[]; // scorers, when the source publishes them
}

export interface Scorer {
  player: string;
  team: string;
  goals: number;
}

export interface LeagueSnapshot {
  slug: string;
  season: string; // e.g. "2026-27"
  seasonLabel: string; // as published, e.g. "IWL 2025-26"
  updatedAt: string;
  stages: Stage[];
  fixtures: Match[];
  scorers: Scorer[];
}

// ---------- Match centre (one match, in detail) ----------
// Built on demand by src/lib/match.ts from whatever the match's source publishes. Every part is optional:
// the match page shows a tab only when its data exists, and never invents anything.

export type Side = 'home' | 'away';

export interface Player {
  name: string;
  number?: number;
  position?: 'GK' | 'DEF' | 'MID' | 'FWD';
  captain?: boolean;
  /** Minute they were replaced, e.g. "58'" (starters) or came on (bench). */
  off?: string;
  on?: string;
  yellow?: boolean;
  red?: boolean;
  goals?: number;
}

export interface Lineup {
  formation?: string; // "4-3-3"
  coach?: string;
  starters: Player[]; // goalkeeper first, then defenders to forwards
  bench: Player[];
}

export interface MatchEvent {
  minute: string; // "23'", "45+2'", "HT"
  order: number; // sort key (minutes * 100 + stoppage)
  side: Side;
  type: 'goal' | 'penalty' | 'own-goal' | 'yellow' | 'red' | 'sub';
  player: string;
  assist?: string;
  playerOut?: string; // for substitutions, `player` is the one coming on
  note?: string; // e.g. "Second yellow"
}

export interface TeamStat {
  label: string;
  home: number;
  away: number;
  percent?: boolean;
}

export interface MatchTeam {
  name: string;
  short?: string;
  logo?: string;
  score?: number;
}

export interface MatchDetail {
  id: string;
  competition: string; // display name, e.g. "Indian Super League"
  status: MatchStatus;
  clock?: string; // "61'", "HT" while live
  kickoff: string;
  venue?: string;
  round?: string;
  home: MatchTeam;
  away: MatchTeam;
  events: MatchEvent[];
  lineups?: { home: Lineup; away: Lineup };
  stats?: TeamStat[];
  playerOfTheMatch?: string;
  updatedAt: string;
}
