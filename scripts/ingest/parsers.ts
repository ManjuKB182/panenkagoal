// Pure functions: raw source payload in, normalised shape out. Unit-tested in tests/parsers.test.ts.
import { XMLParser } from 'fast-xml-parser';
import type { Match, MatchStatus, NewsItem, Scorer, Stage, StandingRow, Video } from '../../src/lib/types';
import type { SectionKey } from '../../src/config/site';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text' });
const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const num = (x: unknown) => (x === null || x === undefined || x === '' ? 0 : Number(x));
const text = (x: unknown): string => (typeof x === 'object' && x !== null ? String((x as any)['#text'] ?? '') : String(x ?? ''));

// ---------- YouTube RSS ----------

export function parseYouTubeFeed(body: string, channel: Video['channel']): Video[] {
  const feed = xml.parse(body).feed ?? {};
  return arr(feed.entry).map((e: any) => {
    const group = e['media:group'] ?? {};
    return {
      id: text(e['yt:videoId']),
      title: text(e.title),
      publishedAt: new Date(text(e.published)).toISOString(),
      thumbnail: `https://i.ytimg.com/vi/${text(e['yt:videoId'])}/hqdefault.jpg`,
      channel,
      views: num(group['media:community']?.['media:statistics']?.['@views']) || undefined,
      description: text(group['media:description']).slice(0, 400) || undefined,
    };
  });
}

/** Official ISL uploads that are match highlights (not live streams, reels or shorts). */
export const isIslHighlight = (title: string) => /highlights/i.test(title) && !/^live\b/i.test(title);

// ---------- News: one filter for "our domain" across every outlet ----------

/** Indian football: leagues, federation, national teams, clubs, people and Karnataka football. */
const INDIAN_FOOTBALL = new RegExp(
  [
    String.raw`\b(isl|ifl|i-?league|iwl|aiff|santosh trophy|super cup|durand cup|blue tig(ers|resses)|indian (football|super league|women'?s league))\b`,
    String.raw`\bindia(n)?\b`,
    String.raw`\b(bengaluru fc|bfc|mohun bagan|east bengal|kerala blasters|fc goa|mumbai city|chennaiyin|odisha fc|jamshedpur fc|punjab fc|northeast united|hyderabad fc|sc delhi|sporting club delhi|inter kashi|churchill brothers|gokulam|real kashmir|shillong lajong|aizawl|dempo|sreenidi|namdhari|diamond harbour|sc bengaluru|kickstart|kemp fc|south united|fc bengaluru united)\b`,
    String.raw`\b(bdfa|ksfa|karnataka (football|women'?s league|super division)|kanteerava|bangalore football stadium)\b`,
    String.raw`\b(sunil chhetri|khalid jamil|gurpreet|sandesh jhingan|lallianzuala chhangte)\b`,
  ].join('|'),
  'i',
);
/** Stories that mention India but are about another sport. */
const NOT_FOOTBALL = /\b(cricket|ipl|test match|odi|t20|wpl|kabaddi|hockey|badminton|tennis|chess|wwe|f1|formula)\b/i;

const NEWS_SECTIONS: Array<[RegExp, SectionKey]> = [
  [/\b(women'?s?|girls|iwl|wofo|blue tigresses|kwl|kemp fc|kickstart)\b/i, 'wofo'],
  [/\b(youth|u-?1[3-9]|u-?2[0-3]|under-?1[3-9]|under-?2[0-3]|rfdl|development league|academy|junior|elite league)\b/i, 'youth'],
  [/\b(karnataka|bengaluru|bangalore|bfc|bdfa|ksfa|kanteerava|sc bengaluru|south united)\b/i, 'karnataka'],
];

export interface RawNews { title: string; summary?: string; url: string; publishedAt: string; categories: string[] }

/**
 * Keeps a story only if it is football AND Indian football, and files it under a section.
 * `footballScoped` is true when the feed or URL already guarantees football (a football feed or a /football/ link).
 */
export function classifyNews(item: RawNews, footballScoped: boolean): SectionKey | null {
  const hay = `${item.title} ${item.summary ?? ''} ${item.categories.join(' ')}`;
  if (!footballScoped && !/football|soccer/i.test(hay)) return null;
  if (NOT_FOOTBALL.test(item.title)) return null;
  if (!INDIAN_FOOTBALL.test(hay)) return null;
  return NEWS_SECTIONS.find(([re]) => re.test(hay))?.[1] ?? 'mens';
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Any RSS 2.0 feed (KhelNow, The Hindu, Times of India). */
export function parseRss(body: string): RawNews[] {
  const channel = xml.parse(body).rss?.channel ?? {};
  return arr(channel.item).map((it: any) => ({
    title: stripHtml(text(it.title)),
    summary: stripHtml(text(it.description)).slice(0, 220) || undefined,
    url: text(it.link).trim(),
    publishedAt: new Date(text(it.pubDate)).toISOString(),
    categories: arr(it.category).map(text),
  }));
}

/** Google News sitemap (Deccan Herald publishes no section RSS). */
export function parseNewsSitemap(body: string): RawNews[] {
  return arr(xml.parse(body).urlset?.url).map((u: any) => ({
    title: stripHtml(text(u['news:news']?.['news:title'])),
    url: text(u.loc).trim(),
    publishedAt: new Date(text(u['news:news']?.['news:publication_date'])).toISOString(),
    categories: [],
  }));
}

export function toNewsItems(raw: RawNews[], source: NewsItem['source'], footballScoped: (r: RawNews) => boolean): NewsItem[] {
  return raw.flatMap((r) => {
    if (!r.title || !r.url || Number.isNaN(Date.parse(r.publishedAt))) return [];
    const section = classifyNews(r, footballScoped(r));
    return section ? [{ id: r.url, source, title: r.title, summary: r.summary, url: r.url, publishedAt: r.publishedAt, category: r.categories[0], section }] : [];
  });
}

/** KhelNow tags every item, so its categories decide what is Indian football. */
const KHELNOW_INDIAN = /^(ISL|Indian Football|Indian Football League|Indian Football Team|I-League|IWL|Indian Women|Santosh Trophy|Super Cup|Durand Cup|AFC Challenge|AFC Champions League Two)/i;
export const parseKhelNowFeed = (body: string): NewsItem[] =>
  toNewsItems(
    parseRss(body).filter((r) => r.categories.some((c) => KHELNOW_INDIAN.test(c))),
    'KhelNow',
    () => true,
  );

// ---------- ISL (indiansuperleague.com) ----------

export function parseIslStandings(json: any): Stage[] {
  const groups = arr(json?.standings?.groups).map((g: any) => ({
    name: g.name ?? '',
    rows: arr(g.teams?.team).map(
      (t: any): StandingRow => ({
        pos: num(t.position),
        prevPos: num(t.prev_position) || undefined,
        team: t.team_name,
        short: t.team_short_name,
        played: num(t.played),
        won: num(t.wins),
        // The ISL feed repeats draws in both `draws` and `tied`; count them once.
        drawn: Math.max(num(t.draws), num(t.tied)),
        lost: num(t.lost),
        gf: num(t.gf ?? t.points_scored),
        ga: num(t.ga ?? t.points_conceded),
        gd: num(t.score_diff),
        points: num(t.points),
        form: arr(t.match_result?.match)
          .map((m: any) => m.result)
          .filter(Boolean)
          .join('')
          .slice(-5),
      }),
    ),
  }));
  return [{ name: 'League', groups }];
}

const islStatus = (state: string, status: string): MatchStatus =>
  state === 'R' ? 'ft' : state === 'L' ? 'live' : /postpon|abandon/i.test(status) ? 'postponed' : 'scheduled';

export function parseIslFixtures(json: any): Match[] {
  return arr(json?.matches).map((m: any) => {
    const [h, a] = m.participants ?? [];
    const status = islStatus(m.event_state, m.event_status ?? '');
    const played = status === 'ft' || status === 'live';
    return {
      id: `isl-${m.game_id}`,
      kickoff: m.start_date,
      home: h?.name,
      away: a?.name,
      homeShort: h?.short_name,
      awayShort: a?.short_name,
      homeScore: played ? num(h?.value) : undefined,
      awayScore: played ? num(a?.value) : undefined,
      status,
      venue: m.venue_name,
      round: m.event_name,
    };
  });
}

export function parseIslScorers(json: any): Scorer[] {
  return arr(json?.data).map((p: any) => ({ player: p.player_name, team: p.team_name, goals: num(p.value) }));
}

// ---------- AIFF (the-aiff.com) and IFL (same backend, different wrapper) ----------

function aiffRows(rows: any[]): StandingRow[] {
  return rows.map((r: any, i: number) => ({
    pos: num(r.position) || i + 1,
    team: r.team_name,
    logo: r.team_logo || undefined,
    played: num(r.played),
    won: num(r.won),
    drawn: num(r.draw),
    lost: num(r.lost),
    gf: num(r.goal_for),
    ga: num(r.goal_against),
    gd: num(r.goal_difference),
    points: num(r.points),
    form: Array.isArray(r.last_results) ? r.last_results.join('') : undefined,
  }));
}

export function parseAiffPointsTable(json: any): Stage[] {
  const stages = json?.points_table?.stages ?? json?.points_table ?? [];
  return arr(stages).map((s: any) => ({
    name: String(s.stage_name ?? '').trim(),
    groups: arr(s.groups).map((g: any) => ({ name: String(g.group_name ?? '').trim(), rows: aiffRows(arr(g.points_table)) })),
  }));
}

export function parseAiffFixtures(json: any): { seasonLabel: string; matches: Match[] } {
  const list = arr(json?.fixtures);
  return {
    seasonLabel: list[0]?.tournament_name ?? '',
    matches: list.map((f: any) => ({
      id: `aiff-${f.match_id}`,
      kickoff: f.timestamp ? new Date(f.timestamp * 1000).toISOString() : `${f.match_date}T${f.time || '00:00'}:00+05:30`,
      home: f.team1_name,
      away: f.team2_name,
      homeScore: f.ft ? num(f.team1_score) : undefined,
      awayScore: f.ft ? num(f.team2_score) : undefined,
      status: f.ft || f.over ? 'ft' : 'scheduled',
      venue: f.venue || undefined,
    })),
  };
}

export function parseAiffScorers(json: any): Scorer[] {
  return arr(json?.top_scorers).map((p: any) => ({ player: p.player_name, team: p.team_name, goals: num(p.total_goals) }));
}

/** IFL dates come as "27-02-26" and "04:00 PM" in IST. */
export function iflKickoff(date: string, time: string): string {
  const [d, m, y] = date.split('-');
  const t = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(time ?? '');
  let hh = t ? Number(t[1]) : 0;
  if (t?.[3]?.toUpperCase() === 'PM' && hh < 12) hh += 12;
  if (t?.[3]?.toUpperCase() === 'AM' && hh === 12) hh = 0;
  const mm = t ? t[2] : '00';
  return `20${y}-${m}-${d}T${String(hh).padStart(2, '0')}:${mm}:00+05:30`;
}

export function parseIflFixtures(json: any): Match[] {
  return arr(json?.fixtures?.stages).flatMap((s: any) =>
    arr(s.fixtures).map((f: any) => {
      const played = f.team1_score !== null && f.team1_score !== undefined;
      return {
        id: `ifl-${f.id}`,
        kickoff: iflKickoff(f.date, f.time),
        home: f.t1_name,
        away: f.t2_name,
        homeScore: played ? num(f.team1_score) : undefined,
        awayScore: played ? num(f.team2_score) : undefined,
        status: (played ? 'ft' : 'scheduled') as MatchStatus,
        venue: f.venue || undefined,
        round: s.stage_name,
      };
    }),
  );
}

export function parseIflScorers(json: any): Scorer[] {
  return arr(json?.stats?.goals_player).map((p: any) => ({ player: p.player_name, team: p.team_name, goals: num(p.total_goals ?? p.value) }));
}

/** "IWL 2025-26" → "2025-26". Falls back to the label itself. */
export const seasonFromLabel = (label: string) => /(\d{4}-\d{2})/.exec(label)?.[1] ?? label;
