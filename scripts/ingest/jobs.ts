import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COMPETITIONS, type Competition } from '../../src/config/competitions';
import { SITE } from '../../src/config/site';
import type { LeagueSnapshot, Match, NewsItem, Video } from '../../src/lib/types';
import { get, getJson, postForm } from './http';
import {
  isIslHighlight, parseNewsSitemap, parseRss, toNewsItems, parseAiffFixtures, parseAiffPointsTable, parseAiffScorers, parseIflFixtures, parseIflScorers,
  parseIslFixtures, parseIslScorers, parseIslStandings, parseKhelNowFeed, parseYouTubeFeed, seasonFromLabel,
} from './parsers';
import { readDataset, writeDataset } from './store';

const now = () => new Date().toISOString();

/** Merge by id; newer fetch wins. Keeps items older fetches saw but the source no longer returns. */
function mergeById<T extends { id: string }>(previous: T[] = [], fresh: T[]): T[] {
  const map = new Map(previous.map((x) => [x.id, x]));
  for (const x of fresh) map.set(x.id, { ...map.get(x.id), ...x });
  return [...map.values()];
}

const newestFirst = <T extends { publishedAt: string }>(xs: T[]) => xs.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

// ---------- videos ----------

interface Show { slug: string; name: string; nameKn?: string; playlistId: string; titleMatch?: string }

/** youtube.com/shorts/<id> answers 200 for a Short and redirects (303) for a normal video. */
async function checkShort(id: string): Promise<boolean | undefined> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    return res.status === 200 ? true : res.status >= 300 && res.status < 400 ? false : undefined;
  } catch {
    return undefined; // try again next run
  }
}

export async function videosJob(): Promise<boolean> {
  const { shows }: { shows: Show[] } = JSON.parse(await readFile(join(import.meta.dirname, '../../data/shows.json'), 'utf8'));
  const feed = (q: string) => get(`https://www.youtube.com/feeds/videos.xml?${q}`);

  const latest = parseYouTubeFeed(await feed(`channel_id=${SITE.youtubeChannelId}`), 'panenka');
  const showOf = new Map<string, string>();
  const fromPlaylists: Video[] = [];
  for (const show of shows) {
    for (const v of parseYouTubeFeed(await feed(`playlist_id=${show.playlistId}`), 'panenka')) {
      showOf.set(v.id, show.slug);
      fromPlaylists.push(v);
    }
  }
  const prev = await readDataset<{ panenka: Video[]; isl: Video[] }>('videos');
  // Playlist feeds only return 15 entries, so newer episodes are matched to a show by title too.
  const byTitle = (title: string) => shows.find((s) => s.titleMatch && new RegExp(s.titleMatch, 'i').test(title))?.slug;
  const panenka = newestFirst(
    mergeById(prev?.panenka, [...fromPlaylists, ...latest]).map((v) => ({ ...v, show: showOf.get(v.id) ?? v.show ?? byTitle(v.title) })),
  ).slice(0, 400);
  for (const v of panenka) if (v.short === undefined) v.short = await checkShort(v.id);

  const islAll = parseYouTubeFeed(await feed(`channel_id=${SITE.islChannelId}`), 'isl');
  const isl = newestFirst(mergeById(prev?.isl, islAll.filter((v) => isIslHighlight(v.title)))).slice(0, 60);

  return writeDataset('videos', { updatedAt: now(), panenka, isl });
}

// ---------- news ----------

const FOOTBALL_URL = (r: { url: string }) => /\/(sports?\/)?football\//.test(r.url);

// Every outlet goes through the same Indian-football filter (parsers.classifyNews).
const NEWS_SOURCES: Array<{ source: NewsItem['source']; fetch: () => Promise<NewsItem[]> }> = [
  { source: 'KhelNow', fetch: async () => parseKhelNowFeed(await get('https://khelnow.com/feed')) },
  {
    source: 'The Hindu',
    fetch: async () => toNewsItems(parseRss(await get('https://www.thehindu.com/sport/football/feeder/default.rss')), 'The Hindu', () => true),
  },
  {
    // TOI has no football-only feed: take the sports feed and keep /sports/football/ links.
    source: 'Times of India',
    fetch: async () =>
      toNewsItems(parseRss(await get('https://timesofindia.indiatimes.com/rssfeeds/4719148.cms')).filter(FOOTBALL_URL), 'Times of India', () => true),
  },
  {
    // Deccan Herald has no section RSS; its Google News sitemap lists the last 48 hours.
    source: 'Deccan Herald',
    fetch: async () =>
      toNewsItems(parseNewsSitemap(await get('https://www.deccanherald.com/news_sitemap.xml')).filter(FOOTBALL_URL), 'Deccan Herald', () => true),
  },
];

export async function newsJob(): Promise<boolean> {
  const results = await Promise.allSettled(NEWS_SOURCES.map((s) => s.fetch()));
  const fresh = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${NEWS_SOURCES[i].source}: ${(r.reason as Error).message}`] : []));
  const prev = await readDataset<{ items: NewsItem[] }>('news');
  // Keep 30 days of headlines, newest first.
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
  const items = newestFirst(mergeById(prev?.items, fresh)).filter((n) => n.publishedAt >= cutoff).slice(0, 300);
  const changed = await writeDataset('news', { updatedAt: now(), items });
  if (failed.length) throw Object.assign(new Error(failed.join('; ')), { changed });
  return changed;
}

// ---------- leagues ----------

function seasonFromMatches(matches: Match[]): string {
  const first = matches.map((m) => m.kickoff).sort()[0];
  if (!first) return '';
  const d = new Date(first);
  const start = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

async function fetchLeague(c: Competition, prev: LeagueSnapshot | null): Promise<Omit<LeagueSnapshot, 'updatedAt'> | null> {
  const s = c.source;
  if (s.kind === 'isl') {
    const base = 'https://www.indiansuperleague.com/football';
    const [table, fixtures, scorers] = await Promise.all([
      getJson(`${base}/live/india_sl/json/${s.seriesId}_standings.json`),
      getJson(`https://www.indiansuperleague.com/default.aspx?methodtype=3&client=8&sport=2&league=0&timezone=0530&language=en&tournament=${s.tournament}`),
      getJson(`${base}/static/india_sl/json/15_${s.seriesId}_138_stats.json`),
    ]);
    const label = fixtures?.matches?.[0]?.series_name ?? 'Indian Super League';
    return {
      slug: c.slug, seasonLabel: label, season: seasonFromLabel(label),
      stages: parseIslStandings(table), fixtures: parseIslFixtures(fixtures), scorers: parseIslScorers(scorers),
    };
  }
  if (s.kind === 'aiff') {
    const api = 'https://www.the-aiff.com/api/competition';
    const [table, fixtures, stats] = await Promise.all([
      getJson(`${api}/points-table/${s.type}`),
      getJson(`${api}/fixtures/${s.type}`),
      getJson(`${api}/stats/${s.type}`),
    ]);
    const { seasonLabel, matches } = parseAiffFixtures(fixtures);
    const season = seasonFromLabel(seasonLabel);
    // AIFF returns only the latest 10 fixtures, so accumulate across runs within the same season.
    const keep = prev && prev.season === season ? prev.fixtures : [];
    return {
      slug: c.slug, seasonLabel, season,
      stages: parseAiffPointsTable(table), fixtures: mergeById(keep, matches), scorers: parseAiffScorers(stats),
    };
  }
  if (s.kind === 'ifl') {
    const url = 'https://indianfootballleague.in/wp-admin/admin-ajax.php';
    const [table, fixtures, stats] = await Promise.all([
      postForm(url, { action: 'points_table', league_slug: s.slug }),
      postForm(url, { action: 'fixtures', league_slug: s.slug }),
      postForm(url, { action: 'stats', league_slug: s.slug }),
    ]);
    const matches = parseIflFixtures(fixtures);
    const season = seasonFromMatches(matches);
    return {
      slug: c.slug, seasonLabel: `${c.name} ${season}`, season,
      stages: parseAiffPointsTable(table), fixtures: matches, scorers: parseIflScorers(stats),
    };
  }
  return null; // manual leagues are computed at build time from data/manual
}

export async function leaguesJob(only?: (c: Competition) => boolean): Promise<boolean> {
  let changed = false;
  const errors: string[] = [];
  for (const c of COMPETITIONS.filter(only ?? (() => true))) {
    try {
      const key = `leagues/${c.slug}`;
      const prev = await readDataset<LeagueSnapshot>(key);
      const snap = await fetchLeague(c, prev);
      if (!snap) continue;
      if (prev && prev.season && snap.season && prev.season !== snap.season) {
        // New season detected: archive the old one before overwriting.
        await writeDataset(`leagues/archive/${c.slug}-${prev.season}`, prev);
        console.log(`::notice::${c.short}: new season ${snap.season} (archived ${prev.season})`);
      }
      changed = (await writeDataset(key, { ...snap, updatedAt: now() })) || changed;
    } catch (e) {
      // One broken source must not stop the others.
      errors.push(`${c.short}: ${(e as Error).message}`);
    }
  }
  if (errors.length) throw Object.assign(new Error(errors.join('; ')), { changed });
  return changed;
}

export const islJob = () => leaguesJob((c) => c.source.kind === 'isl');
export const aiffIflJob = () => leaguesJob((c) => c.source.kind === 'ifl' || (c.source.kind === 'aiff' && c.section !== 'youth'));
export const youthJob = () => leaguesJob((c) => c.source.kind === 'aiff' && c.section === 'youth');
