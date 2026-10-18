// Match centre data. One function turns a match id into a MatchDetail, fetched live from the match's own source
// and normalised, so any match works without a rebuild. Used by the Pages Function GET /api/match?id=...
//
//   isl-<n>          the official ISL site: a per-game feed with starting XIs, formation, team stats, goals, cards, substitutions.
//   aiff-<n> / ifl-<n>  the AIFF match record (IFL fixtures use AIFF ids too): lineups with positions, goals, cards, substitutions.
//                       It has no team stats; we only count cards and substitutions from the events.
//
// Anything a source does not publish stays undefined; the page then hides that tab. Nothing is estimated.
import { FEED } from './live';
import type { Lineup, MatchDetail, MatchEvent, MatchStatus, Player, Side, TeamStat } from './types';

const UA = 'PanenkaGoalBot/0.1 (+https://panenkagoal.com/about)';
const ISL_GAME = (id: string) => `https://www.indiansuperleague.com/football/live/india_sl/json/${id}.json`;
const AIFF_MATCH = (id: string) => `https://www.the-aiff.com/api/fixtures/cms/${id}`;

export const MATCH_ID = /^(isl|aiff|ifl)-(\d{1,9})$/;

const arr = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const num = (x: unknown) => (x === null || x === undefined || x === '' || Number.isNaN(Number(x)) ? 0 : Number(x));

/** Tidy a player name from the sources: "Kunal Kundaikar (.)", "Kabir T (loc)*", "ARUNA BAG". */
export function cleanName(n: unknown): string {
  const t = String(n ?? '').replace(/\s*\((?:\.|loc|local)\)\*?/gi, '').replace(/\*/g, '').replace(/\s+/g, ' ').replace(/\s+\.$/, '').trim();
  return t && t === t.toUpperCase() && /[A-Z]{2}/.test(t) ? t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : t;
}

const minuteLabel = (min: number, plus: number) => `${min}${plus > 0 ? `+${plus}` : ''}'`;

export class NotFound extends Error {}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (res.status === 404 || res.status === 403 || res.status === 500) throw new NotFound(`upstream ${res.status}`);
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

// ---------- shared helpers ----------

/** Rows from a formation like "4-3-3" and the shirt slots 2..11 (slot 1 is the goalkeeper). */
function formationRows(formation: string): number[] | null {
  const parts = formation.split('-').map(Number);
  return parts.length >= 2 && parts.every((n) => n > 0) && parts.reduce((a, b) => a + b, 0) === 10 ? parts : null;
}

// ---------- ISL ----------

const islPos = (p: any): Player['position'] => (p.is_goalkeeper ? 'GK' : ({ DEF: 'DEF', MF: 'MID', MID: 'MID', FWD: 'FWD' } as const)[p.position_short as string]);

export function parseIslGame(game: any, listing?: any): MatchDetail {
  const md = game?.match_detail ?? {};
  const [t1, t2] = arr<any>(game?.teams);
  if (!t1 || !t2) throw new NotFound('no teams');
  const [home, away] = t1.is_home_team === false ? [t2, t1] : [t1, t2];
  const sideOf = (teamId: unknown): Side => (String(teamId) === String(home.id) ? 'home' : 'away');
  const raw: any[] = arr(game.events);

  const evs: MatchEvent[] = [];
  const marks = new Map<string, { yellow?: boolean; red?: boolean; goals: number; off?: string; on?: string }>();
  const mark = (id: unknown) => { const k = String(id); if (!marks.has(k)) marks.set(k, { goals: 0 }); return marks.get(k)!; };
  for (const e of raw) {
    const t = e.time ?? {};
    const minute = minuteLabel(num(t.minutes), num(t.additional_minutes));
    const order = num(t.minutes) * 100 + num(t.additional_minutes);
    const side = sideOf(e.team_id);
    const who = cleanName(e.offensive_player?.player_short_name ?? e.offensive_player?.display_name ?? e.offensive_player?.player_name);
    const name = String(e.event ?? '');
    if (/^goal(?!\s*kick)/i.test(name)) {
      evs.push({ minute, order, side, type: /penalty/i.test(name) ? 'penalty' : 'goal', player: who, assist: e.assisting_player ? cleanName(e.assisting_player.player_short_name ?? e.assisting_player.full_name) : undefined });
      mark(e.offensive_player?.player_id).goals++;
    } else if (/own goal/i.test(name)) {
      // The ISL feed already files an own goal under the team that benefits (checked against the final score).
      evs.push({ minute, order, side, type: 'own-goal', player: who });
    } else if (/yellow/i.test(name)) {
      evs.push({ minute, order, side, type: 'yellow', player: who });
      mark(e.offensive_player?.player_id).yellow = true;
    } else if (/red card|second yellow/i.test(name)) {
      evs.push({ minute, order, side, type: 'red', player: who, note: /second/i.test(name) ? 'Second yellow' : undefined });
      mark(e.offensive_player?.player_id).red = true;
    } else if (/^substitution/i.test(name) && e.substitution) {
      const inn = e.substitution.player_in ?? {}, out = e.substitution.player_out ?? {};
      evs.push({ minute, order, side, type: 'sub', player: cleanName(inn.player_display_name ?? inn.player_full_name ?? inn.player_name), playerOut: cleanName(out.player_display_name ?? out.player_full_name ?? out.player_name) });
      mark(inn.player_id).on = minute; mark(out.player_id).off = minute;
    }
  }
  evs.sort((a, b) => a.order - b.order);

  const lineup = (team: any): Lineup | null => {
    const all: any[] = arr(team.players);
    const started = all.filter((p) => p.is_started).sort((a, b) => num(a.formation) - num(b.formation));
    if (started.length < 11) return null;
    const toPlayer = (p: any): Player => {
      const m = marks.get(String(p.id));
      return {
        name: cleanName(p.display_name ?? p.short_name ?? p.name), number: num(p.jersey_no) || undefined, position: islPos(p),
        captain: p.is_captain || undefined, off: m?.off, on: m?.on, yellow: m?.yellow, red: m?.red, goals: m?.goals || undefined,
      };
    };
    const coach = arr<any>(team.support_staff).find((s) => /head coach/i.test(s.support_staff_type))?.name;
    return {
      formation: formationRows(String(team.formation ?? '')) ? String(team.formation) : undefined,
      coach: coach ? cleanName(coach) : undefined,
      starters: started.map(toPlayer),
      bench: all.filter((p) => !p.is_started).sort((a, b) => num(a.jersey_no) - num(b.jersey_no)).map(toPlayer),
    };
  };
  const lh = lineup(home), la = lineup(away);

  // Team stats come as nested objects; show the rows that have a number for at least one side.
  const sh = home.stats ?? {}, sa = away.stats ?? {};
  const pick = (label: string, f: (s: any) => unknown, percent = false): TeamStat => ({ label, home: num(f(sh)), away: num(f(sa)), percent: percent || undefined });
  const stats = [
    pick('Possession', (s) => s.possession_percentage, true),
    pick('Shots', (s) => s.events?.shots),
    pick('Shots on target', (s) => s.events?.shots_on_target),
    pick('Corners', (s) => s.events?.corner_kicks),
    pick('Fouls', (s) => s.events?.fouls_committed),
    pick('Offsides', (s) => s.events?.offsides),
    pick('Passes', (s) => s.touches?.total_passes),
    pick('Pass accuracy', (s) => s.touches?.pass_accuracy_percentage, true),
    pick('Tackles', (s) => s.touches?.tackles),
    pick('Saves', (s) => s.touches?.saves),
    pick('Yellow cards', (s) => s.events?.yellow_cards),
    pick('Red cards', (s) => s.events?.red_cards),
  ].filter((r) => r.home > 0 || r.away > 0);

  // State and clock: the fixtures listing knows it best; fall back to the events.
  const state = listing?.event_state;
  const finished = raw.some((e) => /match completed/i.test(e.event));
  const status: MatchStatus = state === 'R' || (!state && finished) ? 'ft' : state === 'L' || (!state && raw.length > 0) ? 'live' : /postpon|abandon/i.test(listing?.event_status ?? '') ? 'postponed' : 'scheduled';
  const lStatus = String(listing?.short_event_status ?? listing?.event_status ?? '');
  const lastMin = raw.length ? raw[raw.length - 1].time : null;
  const clock = status !== 'live' ? undefined : /half/i.test(lStatus) ? 'HT' : String(listing?.event_sub_status ?? '').replace(/\s+/g, '') || (lastMin ? minuteLabel(num(lastMin.minutes), num(lastMin.additional_minutes)) : undefined);

  const [dd, mm, yy] = String(md.matchdate_ist ?? md.date ?? '').split('/');
  const kickoff = listing?.start_date ?? (yy ? `${yy}-${mm}-${dd}T${md.matchtime_ist ?? md.start_time ?? '00:00'}:00+05:30` : '');
  const played = status === 'ft' || status === 'live';
  const team = (t: any) => ({ name: t.name, short: t.short_name || undefined, score: played ? num(t.score) : undefined });
  return {
    id: `isl-${md.match_id}`,
    competition: String(md.series?.name ?? 'Indian Super League').replace(/,\s*\d{4}-\d{2,4}$/, ''),
    status, clock, kickoff,
    venue: md.venue?.name || listing?.venue_name || undefined,
    round: md.match_number || undefined,
    home: team(home), away: team(away),
    events: evs,
    lineups: lh && la ? { home: lh, away: la } : undefined,
    stats: played && stats.length ? stats : undefined,
    updatedAt: new Date().toISOString(),
  };
}

async function islMatch(gameId: string): Promise<MatchDetail> {
  const [game, listing] = await Promise.all([
    getJson(ISL_GAME(gameId)),
    getJson(FEED).then((j) => arr<any>(j?.matches).find((m) => String(m.game_id) === gameId)).catch(() => undefined),
  ]);
  return parseIslGame(game, listing);
}

// ---------- AIFF (state leagues, youth leagues, women's leagues, I-League 2, IFL) ----------

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "10 September 2026," + "04:00 AM" -> ISO in IST. The record prints some 4 pm kickoffs as "04:00 AM"; nothing kicks off before 8 am. */
export function aiffKickoff(date: string, time: string): string {
  const d = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(date ?? '');
  if (!d) return '';
  const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec((time ?? '').trim());
  let h = t ? Number(t[1]) : 16;
  const pm = /pm/i.test(t?.[3] ?? '') || (/am/i.test(t?.[3] ?? '') && h < 8);
  if (pm && h < 12) h += 12;
  const mo = MONTHS.indexOf(d[2].toLowerCase()) + 1;
  return `${d[3]}-${String(mo).padStart(2, '0')}-${d[1].padStart(2, '0')}T${String(h).padStart(2, '0')}:${t ? t[2] : '00'}:00+05:30`;
}

export function parseAiffMatch(j: any, id: string, now = Date.now()): MatchDetail {
  const f = j?.fixture;
  if (!f?.id) throw new NotFound('no fixture');
  const teams = j.teams_data ?? {};
  const t1: number = f.team1_id, t2: number = f.team2_id;
  const sideOf = (teamId: unknown): Side => (String(teamId) === String(t1) ? 'home' : 'away');
  const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
  const kickoff = aiffKickoff(f.date, f.time);

  const evs: MatchEvent[] = [];
  const marks = new Map<number, { yellow?: boolean; red?: boolean; goals: number; off?: string; on?: string }>();
  const mark = (id: number) => { if (!marks.has(id)) marks.set(id, { goals: 0 }); return marks.get(id)!; };
  for (const e of arr<any>(j.events)) {
    const half = e.minute === 'HT' || e.bm_am === 1;
    const minute = half ? 'HT' : minuteLabel(num(e.minute), num(e.plus_time));
    const order = half ? 4500 : num(e.minute) * 100 + num(e.plus_time);
    const side = sideOf(e.team_id);
    const player = cleanName(e.player_name);
    if (e.type === 1) {
      // goal_type: 1 goal, 2 penalty, 3 own goal (credited to the other side). Checked against final scores.
      if (e.goal_type === 3) evs.push({ minute, order, side: other(side), type: 'own-goal', player });
      else { evs.push({ minute, order, side, type: e.goal_type === 2 ? 'penalty' : 'goal', player }); mark(e.aiff_player_id).goals++; }
    } else if (e.type === 2) {
      if (e.second_yellow) { evs.push({ minute, order, side, type: 'red', player, note: 'Second yellow' }); mark(e.aiff_player_id).red = true; }
      else { evs.push({ minute, order, side, type: 'yellow', player }); mark(e.aiff_player_id).yellow = true; }
    } else if (e.type === 3) {
      evs.push({ minute, order, side, type: 'red', player }); mark(e.aiff_player_id).red = true;
    } else if (e.type === 4) {
      // player_name comes on, sub_player_name goes off (a substitute who scored later is the "player_name" side).
      evs.push({ minute, order, side, type: 'sub', player, playerOut: cleanName(e.sub_player_name) });
      mark(e.aiff_player_id).on = minute; if (e.sub_aiff_player_id) mark(e.sub_aiff_player_id).off = minute;
    }
  }
  evs.sort((a, b) => a.order - b.order);

  const coachOf = (o: any) => (o?.official_name ? cleanName(o.official_name) : undefined);
  const lineup = (players: any[], coach?: string): Lineup | null => {
    const started = arr<any>(players).filter((p) => p.status === 1);
    if (started.length < 11) return null; // not published (or not a full XI)
    const pos = (p: any): Player['position'] => ({ 2: 'GK', 4: 'DEF', 3: 'MID', 1: 'FWD' } as const)[p.playing_position as 1 | 2 | 3 | 4];
    const toPlayer = (p: any): Player => {
      const m = marks.get(p.aiff_id);
      return { name: cleanName(p.player_name), number: p.jersey_no || undefined, position: pos(p), captain: p.captain ? true : undefined, off: m?.off, on: m?.on, yellow: m?.yellow, red: m?.red, goals: m?.goals || undefined };
    };
    // Order: keeper, defenders, midfielders, forwards. A starter with no listed position goes with the midfielders.
    const rank = (p: Player) => (p.position === 'GK' ? 0 : p.position === 'DEF' ? 1 : p.position === 'FWD' ? 3 : 2);
    const xi = started.map(toPlayer).sort((a, b) => rank(a) - rank(b) || (a.number ?? 0) - (b.number ?? 0));
    const count = (r: number) => xi.filter((p) => rank(p) === r).length;
    const formation = count(0) === 1 ? `${count(1)}-${count(2)}-${count(3)}` : undefined;
    return {
      formation: formation && formationRows(formation) ? formation : undefined, coach,
      starters: xi,
      bench: arr<any>(players).filter((p) => p.status === 2).sort((a, b) => num(a.jersey_no) - num(b.jersey_no)).map(toPlayer),
    };
  };
  const lh = lineup(j.team1_players, coachOf(j.official1)), la = lineup(j.team2_players, coachOf(j.official2));

  const ft = !!f.ft;
  const sinceKo = now - Date.parse(kickoff);
  const status: MatchStatus = ft ? 'ft' : evs.length && sinceKo > 0 && sinceKo < 3.5 * 3600_000 ? 'live' : 'scheduled';
  const played = status !== 'scheduled';

  // The record has no team statistics; cards and substitutions can be counted from the events.
  const count = (type: MatchEvent['type'], side: Side) => evs.filter((e) => e.type === type && e.side === side).length;
  const stats: TeamStat[] = ([['Yellow cards', 'yellow'], ['Red cards', 'red'], ['Substitutions', 'sub']] as const)
    .map(([label, type]) => ({ label, home: count(type, 'home'), away: count(type, 'away') }))
    .filter((r) => r.home > 0 || r.away > 0);

  const logo = (u: unknown) => (typeof u === 'string' && u ? u : undefined);
  const team = (tid: number, name: string, lg: unknown, score: unknown) => ({
    name: cleanName(teams[tid]?.name ?? name), short: teams[tid]?.short_name && teams[tid].short_name !== '0' ? teams[tid].short_name : undefined,
    logo: logo(lg), score: played ? num(score) : undefined,
  });
  return {
    id,
    competition: String(j.tournament?.name ?? f.tournament_name ?? '').replace(/\s+/g, ' ').trim(),
    status, kickoff,
    venue: String(f.venue ?? '').trim() || undefined,
    home: team(t1, f.t1_name, f.team1_logo, j.team1_score),
    away: team(t2, f.t2_name, f.team2_logo, j.team2_score),
    events: evs,
    lineups: (ft || evs.length) && lh && la ? { home: lh, away: la } : undefined,
    stats: played && stats.length ? stats : undefined,
    playerOfTheMatch: j.mvp?.player_name ? cleanName(j.mvp.player_name) : undefined,
    updatedAt: new Date().toISOString(),
  };
}

// ---------- entry point ----------

export async function fetchMatch(id: string): Promise<MatchDetail> {
  const m = MATCH_ID.exec(id);
  if (!m) throw new NotFound('unknown match');
  return m[1] === 'isl' ? islMatch(m[2]) : parseAiffMatch(await getJson(AIFF_MATCH(m[2])), id);
}

export async function matchResponse(id: string | null): Promise<Response> {
  const json = (body: unknown, status: number, cache: string) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
  if (!id || !MATCH_ID.test(id)) return json({ error: 'unknown match' }, 404, 'public, max-age=3600');
  try {
    const d = await fetchMatch(id);
    // Short cache while live, longer once the result is final.
    return json(d, 200, d.status === 'live' ? 'public, max-age=15, s-maxage=15' : d.status === 'ft' ? 'public, max-age=120, s-maxage=600' : 'public, max-age=30, s-maxage=60');
  } catch (e) {
    if (e instanceof NotFound) return json({ error: 'not found' }, 404, 'public, max-age=60');
    return json({ error: 'temporarily unavailable' }, 502, 'no-store');
  }
}
