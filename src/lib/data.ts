// Build-time data access. Pages call these; nothing here runs in the browser.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPETITIONS, type Competition } from '../config/competitions';
import type { SectionKey } from '../config/site';
import { computeTable, type ResultInput } from './standings';
import type { LeagueSnapshot, Match, NewsItem, Video } from './types';

const ROOT = process.cwd();
const read = <T>(rel: string, fallback: T): T => {
  const p = join(ROOT, rel);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
};

export interface Show { slug: string; name: string; nameKn?: string; playlistId: string; titleMatch?: string; blurb: string }
export const getShows = () => read<{ shows: Show[] }>('data/shows.json', { shows: [] }).shows;

export function getVideos() {
  const v = read<{ updatedAt?: string; panenka: Video[]; isl: Video[] }>('data/snapshots/videos.json', { panenka: [], isl: [] });
  return { panenka: v.panenka, isl: v.isl, updatedAt: v.updatedAt };
}

export const isShort = (v: Video) => v.short === true;

/** Videos for a section: pinned ones first (data/section-videos.json), then title matches, newest first. */
export function getSectionVideos(section: SectionKey, pattern: RegExp, limit = 8): Video[] {
  const all = getVideos().panenka;
  const pins = read<Partial<Record<SectionKey, string[]>>>('data/section-videos.json', {})[section] ?? [];
  const pinned = pins.map((id) => all.find((v) => v.id === id)).filter((v): v is Video => !!v);
  const matched = all.filter((v) => !pins.includes(v.id) && pattern.test(v.title.replace(/#\w+/g, ' ')));
  return [...pinned, ...matched].slice(0, limit);
}

export function getNews(section?: SectionKey): NewsItem[] {
  const fetched = read<{ items: NewsItem[] }>('data/snapshots/news.json', { items: [] }).items;
  const curated = read<{ posts: Array<{ url: string; text: string; handle: string; postedAt: string; section?: SectionKey }> }>('data/x-posts.json', { posts: [] }).posts.map(
    (p): NewsItem => ({ id: p.url, source: 'X', title: p.text, url: p.url, publishedAt: p.postedAt, section: p.section ?? null, category: `@${p.handle}` }),
  );
  const all = [...fetched, ...curated].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return section ? all.filter((n) => n.section === section) : all;
}

interface ManualLeague {
  season: string;
  seasonLabel: string;
  teams: string[];
  results: Array<ResultInput & { date: string; venue?: string }>;
  fixtures: Array<{ date: string; time?: string; home: string; away: string; venue?: string }>;
  scorers: Array<{ player: string; team: string; goals: number }>;
}

function manualSnapshot(c: Competition, file: string): LeagueSnapshot {
  const m = read<ManualLeague>(file, { season: '', seasonLabel: c.name, teams: [], results: [], fixtures: [], scorers: [] });
  const played: Match[] = m.results.map((r, i) => ({
    id: `${c.slug}-r${i}`, kickoff: `${r.date}T16:00:00+05:30`, home: r.home, away: r.away,
    homeScore: r.homeScore, awayScore: r.awayScore, status: 'ft', venue: r.venue,
  }));
  const upcoming: Match[] = m.fixtures.map((f, i) => ({
    id: `${c.slug}-f${i}`, kickoff: `${f.date}T${f.time ?? '16:00'}:00+05:30`, home: f.home, away: f.away, status: 'scheduled', venue: f.venue,
  }));
  return {
    slug: c.slug,
    season: m.season,
    seasonLabel: m.seasonLabel,
    // Manual tables are as fresh as their latest entered result ('' when nothing is entered yet).
    updatedAt: lastDate(m.results) ? `${lastDate(m.results)}T22:00:00+05:30` : '',
    stages: [{ name: 'League', groups: [{ name: '', rows: computeTable(m.teams, m.results) }] }],
    fixtures: [...played, ...upcoming],
    scorers: [...m.scorers].sort((a, b) => b.goals - a.goals),
  };
}

const lastDate = (results: Array<{ date: string }>) => results.map((r) => r.date).sort().at(-1);

/** Fixture feeds rarely carry crests, but the league table does: look each side up there by team name. */
function withLogos(snap: LeagueSnapshot | null): LeagueSnapshot | null {
  if (!snap) return snap;
  const logos = new Map<string, string>();
  for (const st of snap.stages) for (const g of st.groups) for (const r of g.rows) if (r.logo) logos.set(r.team, r.logo);
  if (!logos.size) return snap;
  return { ...snap, fixtures: snap.fixtures.map((m) => ({ ...m, homeLogo: m.homeLogo ?? logos.get(m.home), awayLogo: m.awayLogo ?? logos.get(m.away) })) };
}

export function getLeague(c: Competition): LeagueSnapshot | null {
  if (c.source.kind === 'manual') return manualSnapshot(c, c.source.file);
  return withLogos(read<LeagueSnapshot | null>(`data/snapshots/leagues/${c.slug}.json`, null));
}

export function getArchivedSeasons(slug: string): string[] {
  const dir = join(ROOT, 'data/snapshots/leagues/archive');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${slug}-`)).map((f) => f.slice(slug.length + 1, -5));
}

export const getAllLeagues = () =>
  COMPETITIONS.map((c) => ({ comp: c, data: getLeague(c) })).filter((x): x is { comp: Competition; data: LeagueSnapshot } => !!x.data);

/** Matches from every league, for the fixtures strip and ticker. */
export function getAllMatches() {
  return getAllLeagues().flatMap(({ comp, data }) => data.fixtures.map((m) => ({ ...m, comp })));
}

export interface MerchItem {
  slug: string; name: string; price: number | null; status: 'coming-soon' | 'pre-order' | 'live' | 'sold-out';
  sizes: string[]; colour: 'yellow' | 'red' | 'ink' | 'paper'; blurb: string; order: number;
}
export function getMerch(): MerchItem[] {
  const dir = join(ROOT, 'data/merch');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => read<MerchItem>(`data/merch/${f}`, null as any))
    .sort((a, b) => a.order - b.order);
}
