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
