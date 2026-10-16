// Live ISL scores. The ISL site blocks browser (CORS) requests, so the page asks our own /api/live,
// which fetches the official feed server-side and keeps the answer for a few seconds.
export interface LiveMatch {
  id: string; // matches Match.id, e.g. "isl-194640"
  state: 'live' | 'ft' | 'scheduled';
  homeScore?: number;
  awayScore?: number;
  clock?: string; // "23'", "45+3'", "HT"
  scorers?: { side: 'home' | 'away'; name: string; minute: string }[];
}

const FEED = 'https://www.indiansuperleague.com/default.aspx?methodtype=3&client=8&sport=2&league=0&timezone=0530&language=en&tournament=india_sl_2026';

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

export async function fetchLive(): Promise<LiveMatch[]> {
  const res = await fetch(FEED, { headers: { 'User-Agent': 'PanenkaGoalBot/0.1 (+https://panenkagoal.com/about)', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ISL feed ${res.status}`);
  return parseLive(await res.json());
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
