// Live scores for ISL, the AIFF leagues (IFL, I-League 2/3, IWL, IWL 2) and the KSFA Super Division.
// The sources block browser (CORS) requests, so the page asks our own /api/live, which fetches them server-side and keeps the answer for a few seconds.
import { COMPETITIONS } from '../config/competitions';

export interface LiveMatch {
  id: string; // matches Match.id, e.g. "isl-194640"
  state: 'live' | 'ft' | 'scheduled';
  homeScore?: number;
  awayScore?: number;
  clock?: string; // "23'", "45+3'", "HT"
  scorers?: { side: 'home' | 'away'; name: string; minute: string }[];
}

const isl = COMPETITIONS.find((c) => c.source.kind === 'isl')!.source as { kind: 'isl'; tournament: string };
export const FEED = `https://www.indiansuperleague.com/default.aspx?methodtype=3&client=8&sport=2&league=0&timezone=0530&language=en&tournament=${isl.tournament}`;
const HEADERS = { 'User-Agent': 'PanenkaGoalBot/0.1 (+https://panenkagoal.com/about)', Accept: 'application/json' };
const istDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
// A match with no full-time flag counts as live from kickoff until 3 h later.
const LIVE_MS = 3 * 3600_000;

export function parseLive(json: any): LiveMatch[] {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return (json?.matches ?? [])
    .filter((m: any) => String(m.start_date).startsWith(today) || m.event_state === 'L')
    .map((m: any): LiveMatch => {
      const [h, a] = m.participants ?? [];
      const state = m.event_state === 'L' ? 'live' : m.event_state === 'R' ? 'ft' : 'scheduled';
      const status = String(m.short_event_status ?? m.event_status ?? '');
      const clock = state !== 'live' ? undefined : /half/i.test(status) ? 'HT' : String(m.event_sub_status ?? '').replace(/\s+/g, '') || 'LIVE';
      const scorers = (['home', 'away'] as const).flatMap((side) =>
        ((side === 'home' ? h : a)?.players_involved ?? [])
          .filter((p: any) => /goal/i.test(p.type))
          .map((p: any) => ({ side, name: p.name, minute: p.value })));
      return {
        id: `isl-${m.game_id}`, state,
        homeScore: state === 'scheduled' ? undefined : Number(h?.value ?? 0),
        awayScore: state === 'scheduled' ? undefined : Number(a?.value ?? 0),
        clock, scorers,
      };
    });
}

/** AIFF /api/competition/fixtures/<type>: today's matches. Scores show once the feed carries them; ft flips the match to full time. */
export function parseAiffLive(json: any, now = Date.now()): LiveMatch[] {
  const today = istDay(now);
  return (json?.fixtures ?? [])
    .filter((f: any) => f.match_date === today || (!f.ft && f.timestamp && now - f.timestamp * 1000 > 0 && now - f.timestamp * 1000 < LIVE_MS))
    .map((f: any): LiveMatch => {
      const ko = f.timestamp ? f.timestamp * 1000 : Date.parse(`${f.match_date}T${f.time || '00:00'}:00+05:30`);
      const hasScore = f.team1_score !== null && f.team1_score !== undefined;
      const state = f.ft ? 'ft' : now >= ko && now - ko < LIVE_MS && hasScore ? 'live' : 'scheduled';
      return {
        id: `aiff-${f.match_id}`, state,
        homeScore: state === 'scheduled' ? undefined : Number(f.team1_score ?? 0),
        awayScore: state === 'scheduled' ? undefined : Number(f.team2_score ?? 0),
        clock: state === 'live' ? 'LIVE' : undefined,
      };
    });
}

/** KSFA Super Division: today's events from the AIFF calendar, each scored from its match record. */
async function fetchKsfaLive(id: number): Promise<LiveMatch[]> {
  const now = Date.now();
  const today = istDay(now);
  const res = await fetch(`https://www.the-aiff.com/api/calendar/event/${id}`, {
    method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify({ month: 0, season_id: 0, event_type: 0, public: 1, year: new Date(now).getUTCFullYear(), competition_id: id, view_all: 1 }),
  });
  if (!res.ok) return [];
  const events = ((await res.json()) as any)?.events ?? [];
  const todays = events.filter((e: any) => e.date === today);
  const out = await Promise.all(todays.map(async (e: any): Promise<LiveMatch | null> => {
    const r = await fetch(`https://www.the-aiff.com/api/fixtures/cms/${e.id}`, { headers: HEADERS });
    if (!r.ok) return null;
    const j: any = await r.json();
    const ko = Date.parse(`${e.date}T${String(e.time ?? '00:00').slice(0, 5)}:00+05:30`);
    const ft = !!j?.fixture?.ft;
    const state = ft ? 'ft' : now >= ko && now - ko < LIVE_MS && j?.team1_score != null ? 'live' : 'scheduled';
    return { id: `aiff-${e.id}`, state, homeScore: state === 'scheduled' ? undefined : Number(j.team1_score ?? 0), awayScore: state === 'scheduled' ? undefined : Number(j.team2_score ?? 0), clock: state === 'live' ? 'LIVE' : undefined };
  }));
  return out.filter((m): m is LiveMatch => !!m);
}

export async function fetchLive(): Promise<LiveMatch[]> {
  const jobs: Promise<LiveMatch[]>[] = [];
  jobs.push(fetch(FEED, { headers: HEADERS }).then((r) => { if (!r.ok) throw new Error(`ISL feed ${r.status}`); return r.json(); }).then(parseLive));
  for (const c of COMPETITIONS) {
    if (c.source.kind === 'aiff' && c.section !== 'youth') {
      jobs.push(fetch(`https://www.the-aiff.com/api/competition/fixtures/${c.source.type}`, { headers: HEADERS }).then((r) => (r.ok ? r.json() : null)).then((j) => parseAiffLive(j)));
    } else if (c.source.kind === 'aiff-tournament') {
      jobs.push(fetchKsfaLive(c.source.id));
    }
  }
  // One broken source must not blank the others; only fail when every source failed.
  const settled = await Promise.allSettled(jobs);
  if (settled.every((r) => r.status === 'rejected')) throw (settled[0] as PromiseRejectedResult).reason;
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export async function liveResponse(): Promise<Response> {
  try {
    return new Response(JSON.stringify({ updatedAt: new Date().toISOString(), matches: await fetchLive() }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=15, s-maxage=15' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), matches: [] }), { status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}
