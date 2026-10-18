// Build-time index of every known match (score, scorers where published). The match page reads it only when the
// live /api/match answer is unavailable or the match has no detailed source (e.g. leagues entered by hand).
import { getAllMatches } from '../../lib/data';

export function GET() {
  const byId: Record<string, unknown> = {};
  for (const m of getAllMatches()) {
    byId[m.id] = {
      id: m.id, competition: m.comp.name, status: m.status, kickoff: m.kickoff, venue: m.venue, round: m.round,
      home: { name: m.home, short: m.homeShort, score: m.homeScore }, away: { name: m.away, short: m.awayShort, score: m.awayScore },
      goals: m.goals,
    };
  }
  return new Response(JSON.stringify(byId), { headers: { 'content-type': 'application/json' } });
}
