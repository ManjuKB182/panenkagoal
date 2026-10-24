import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyNews, iflKickoff, isIslHighlight, parseNewsSitemap, parseRss, toNewsItems, parseAiffArticles, parseAiffFixtures, parseAiffPointsTable, parseIflFixtures, parseIslFixtures,
  parseIslStandings, parseKhelNowFeed, parseYouTubeFeed, seasonFromLabel,
  parseAiffMatchDetail, parseAiffTournamentSchedule, sumScorers, teamNamesFromTable, parseTransfermarktTable, latestSeasonMatches, stagesFromFixtures,
} from '../scripts/ingest/parsers';

const fx = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
const json = (name: string) => JSON.parse(fx(name));

describe('YouTube', () => {
  it('parses entries from a channel feed', () => {
    const videos = parseYouTubeFeed(fx('youtube.xml'), 'isl');
    expect(videos.length).toBe(3);
    for (const v of videos) {
      expect(v.id).toMatch(/^[\w-]{11}$/);
      expect(v.title.length).toBeGreaterThan(0);
      expect(Date.parse(v.publishedAt)).not.toBeNaN();
    }
  });
  it('recognises ISL highlight uploads and skips live streams', () => {
    expect(isIslHighlight('Messi Bouli’s Brace Wins It Late! | Punjab FC 2-1 Odisha FC | Quick Highlights | MG ISL 2026-27')).toBe(true);
    expect(isIslHighlight('LIVE: Punjab FC vs Mumbai City FC | MG ISL 2026-27 | Gameweek 2')).toBe(false);
    expect(isIslHighlight("Do you agree with Carlos Fortes' blind ranking? 🤔")).toBe(false);
  });
});

describe('KhelNow', () => {
  it('keeps Indian football and drops the Premier League', () => {
    const items = parseKhelNowFeed(fx('khelnow.xml'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'KhelNow', category: 'ISL- Indian Super League', section: 'mens' });
    expect(items[0].url).toMatch(/^https:\/\/khelnow\.com\//);
  });
});

describe('AIFF news', () => {
  const items = parseAiffArticles(fx('aiff-articles.html'));
  it('parses article cards with full titles and dates', () => {
    expect(items.length).toBeGreaterThan(10);
    for (const n of items) {
      expect(n.source).toBe('AIFF');
      expect(n.url).toMatch(/^https:\/\/www\.the-aiff\.com\/article\//);
      expect(n.title).not.toMatch(/\.\.\.$/);
      expect(Number.isNaN(Date.parse(n.publishedAt))).toBe(false);
    }
  });
  it('files women\'s team stories under wofo', () => {
    const n = items.find((i) => i.url.endsWith('new-look-india-go-down-to-russia-in-kolkata-friendly'));
    expect(n).toMatchObject({ title: 'New-look India go down to Russia in Kolkata friendly', section: 'wofo', publishedAt: '2026-10-07T18:30:00.000Z' });
  });
});

describe('ISL', () => {
  it('parses the standings table', () => {
    const [stage] = parseIslStandings(json('isl-standings.json'));
    for (const row of stage.groups[0].rows) {
      expect(row.played).toBe(row.won + row.drawn + row.lost); // draws must not be double counted
      expect(row.gd).toBe(row.gf - row.ga);
    }
    expect(stage.groups[0].rows.some((r) => r.drawn > 0)).toBe(true);
  });
  it('gives scores only to finished matches', () => {
    const [done, upcoming] = parseIslFixtures(json('isl-fixtures.json'));
    expect(done.status).toBe('ft');
    expect(typeof done.homeScore).toBe('number');
    expect(upcoming.status).toBe('scheduled');
    expect(upcoming.homeScore).toBeUndefined();
    expect(upcoming.kickoff).toMatch(/\+05:30$/);
  });
});

describe('AIFF and IFL', () => {
  it('parses grouped stages (IWL 2)', () => {
    const stages = parseAiffPointsTable(json('aiff-iwl2-table.json'));
    expect(stages.length).toBeGreaterThan(0);
    expect(stages[0].groups.length).toBeGreaterThan(1);
    expect(stages[0].groups[0].name).toMatch(/group/i);
  });
  it('reads the season label from fixtures', () => {
    const { seasonLabel, matches } = parseAiffFixtures(json('aiff-fixtures.json'));
    expect(seasonFromLabel(seasonLabel)).toMatch(/^\d{4}-\d{2}$/);
    expect(matches[0].id).toMatch(/^aiff-\d+$/);
  });
  it('converts IFL dates and 12-hour times to IST', () => {
    expect(iflKickoff('27-02-26', '04:00 PM')).toBe('2026-02-27T16:00:00+05:30');
    expect(iflKickoff('01-03-26', '12:30 AM')).toBe('2026-03-01T00:30:00+05:30');
    expect(iflKickoff('01-03-26', '12:30 PM')).toBe('2026-03-01T12:30:00+05:30');
    expect(parseIflFixtures(json('ifl-fixtures.json'))[0].kickoff).toMatch(/^2026-02-27T16:00/);
  });
});

describe('news: Indian football only', () => {
  const item = (title: string, summary = '') => ({ title, summary, url: 'https://example.com/sports/football/x', publishedAt: '2026-10-15T00:00:00.000Z', categories: [] });

  it('keeps Indian football and files it by section', () => {
    expect(classifyNews(item('ISL: Bouli’s brace helps Punjab edge Odisha'), true)).toBe('mens');
    expect(classifyNews(item('Bengaluru FC bests a stubborn SC Delhi'), true)).toBe('karnataka');
    expect(classifyNews(item('Russian women hand India a 4-0 defeat'), true)).toBe('wofo');
    expect(classifyNews(item('India U-17 squad named for Asian Cup qualifiers'), true)).toBe('youth');
  });
  it('drops world football and other sports', () => {
    expect(classifyNews(item('PSG downs Man City 4-2 in pulsating Champions League clash'), true)).toBeNull();
    expect(classifyNews(item('India vs New Zealand: Indore Test, day two'), false)).toBeNull();
    expect(classifyNews(item('India beat Australia in the T20 decider'), true)).toBeNull();
  });
  it('reads The Hindu football feed', () => {
    const items = toNewsItems(parseRss(fx('thehindu.xml')), 'The Hindu', () => true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'The Hindu', section: 'karnataka' });
  });
  it('reads the Deccan Herald news sitemap and keeps only Indian football links', () => {
    const raw = parseNewsSitemap(fx('dh-news-sitemap.xml'));
    expect(raw).toHaveLength(3);
    const items = toNewsItems(raw.filter((r) => /\/football\//.test(r.url)), 'Deccan Herald', () => true);
    expect(items.map((i) => i.title)).toEqual(['Bengaluru FC beat SC Delhi in ISL opener']);
  });
});

describe('AIFF state league (tournament id)', () => {
  const table = { stages: [{ groups: [{ points_table: [{ team_id: 1, team_name: 'UNITED STARS FOOTBALL CLUB ' }, { team_id: 2, team_name: 'Roots Football Club' }] }] }] };
  const names = teamNamesFromTable(table);
  it('tidies club names and reads IST kickoffs, fixing the "04:00 AM" 4 pm quirk', () => {
    const cal = { events: [
      { id: 10, date: '2026-09-10', time: '04:00 AM', team1_id: 2, team2_id: 1, t1_name: 'x', t2_name: 'y', venue: ' Ground ', st_name: 'League ' },
      { id: 11, date: '2026-09-10', time: '01:30 PM', team1_id: 1, team2_id: 2, t1_name: 'x', t2_name: 'y' },
      { id: 12, date: '2026-09-10', time: '11:00 AM', team1_id: 1, team2_id: 2, t1_name: 'x', t2_name: 'y' },
    ] };
    const ms = parseAiffTournamentSchedule(cal, names);
    expect(ms.map((m) => m.kickoff.slice(11, 16))).toEqual(['16:00', '13:30', '11:00']);
    expect(ms[0]).toMatchObject({ id: 'aiff-10', home: 'Roots Football Club', away: 'United Stars Football Club', venue: 'Ground', status: 'scheduled' });
  });
  it('counts only normal goals, strips markers and sums scorers', () => {
    const detail = parseAiffMatchDetail({
      fixture: { ft: true }, team1_score: 2, team2_score: 0,
      events: [
        { type: 1, goal_type: 1, team_id: 2, player_name: 'Ribhav Sardesai (.)' },
        { type: 1, goal_type: 1, team_id: 2, player_name: 'Ribhav Sardesai (.)' },
        { type: 1, goal_type: 2, team_id: 1, player_name: 'Own Goal (loc)*' },
        { type: 4, goal_type: 0, team_id: 1, player_name: 'Booked' },
      ],
    }, names);
    expect(detail).toMatchObject({ homeScore: 2, awayScore: 0, finished: true });
    expect(sumScorers(detail.goals)).toEqual([{ player: 'Ribhav Sardesai', team: 'Roots Football Club', goals: 2 }]);
  });
});

describe('parseTransfermarktTable', () => {
  const row = (pos: number, team: string, short: string, rec: string) =>
    `<tr> <td class="rechts hauptlink">${pos} </td><td class="zentriert no-border-rechts"><a title="${team}"><img src="https://img/wappen/small/${pos}.png" title="${team}"/></a></td> <td class="no-border-links hauptlink"> <a title="${team}">${short}</a> </td>` +
    rec.split(' ').map((v) => `<td class="zentriert">${v}</td>`).join('') + '</tr>';
  const page = (year: number, body: string) =>
    `<select><option  selected="selected"value="${year}">x</option></select><div class="content-box-headline ">Table Group A</div><table class="items"><tbody>${body}</tbody></table>`;

  it('reads the season from the page and zeroed rows', () => {
    const t = parseTransfermarktTable(page(2026, row(1, 'United SC', 'United SC', '0 0 0 0 0:0 0 0') + row(1, 'SC de Goa', 'SC Goa', '0 0 0 0 0:0 0 0')));
    expect(t.season).toBe('2026-27');
    expect(t.stages[0].groups[0].rows.map((r) => r.team)).toEqual(['United SC', 'SC de Goa']);
    expect(t.stages[0].groups[0].rows[1].short).toBe('SC Goa');
  });
  it('reads results', () => {
    const r = parseTransfermarktTable(page(2025, row(1, 'TRAU FC', 'TRAU FC', '4 3 1 0 7:3 4 10'))).stages[0].groups[0].rows[0];
    expect([r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd, r.points]).toEqual([4, 3, 1, 0, 7, 3, 4, 10]);
  });
});

describe('latestSeasonMatches', () => {
  const m = (id: string, kickoff: string) => ({ id, kickoff, home: 'A', away: 'B', status: 'scheduled' as const });
  it('keeps only the newest season', () => {
    const r = latestSeasonMatches([m('1', '2026-04-10T16:00:00+05:30'), m('2', '2026-10-12T16:00:00+05:30'), m('3', '2026-11-01T16:00:00+05:30')]);
    expect(r.season).toBe('2026-27');
    expect(r.matches.map((x) => x.id)).toEqual(['2', '3']);
  });
  it('is empty with no fixtures', () => expect(latestSeasonMatches([]).season).toBe(''));
});

describe('tables built from fixtures', () => {
  const m = (home: string, away: string, hs?: number, as?: number) => ({
    id: `${home}-${away}`, kickoff: '2026-10-24T16:00:00+05:30', home, away,
    homeScore: hs, awayScore: as, status: hs === undefined ? ('scheduled' as const) : ('ft' as const),
  });
  it('splits teams that never meet into separate groups and tallies only their own results', () => {
    const stages = stagesFromFixtures([m('A1', 'A2', 2, 0), m('A2', 'A3'), m('B1', 'B2', 0, 0), m('B1', 'B3', 1, 0)]);
    expect(stages[0].name).toBe('Group Stage');
    const [a, b] = stages[0].groups;
    expect(a.name).toBe('Group A');
    expect(a.rows.map((r) => r.team).sort()).toEqual(['A1', 'A2', 'A3']);
    expect(a.rows[0]).toMatchObject({ team: 'A1', points: 3, played: 1 });
    expect(b.rows.find((r) => r.team === 'B1')).toMatchObject({ points: 4, played: 2 });
  });
  it('with no results every team is listed at zero', () => {
    const [st] = stagesFromFixtures([m('X', 'Y'), m('Z', 'W')]);
    expect(st.groups.flatMap((g) => g.rows).every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });
});
