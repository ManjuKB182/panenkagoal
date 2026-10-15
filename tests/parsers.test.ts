import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyNews, iflKickoff, isIslHighlight, parseNewsSitemap, parseRss, toNewsItems, parseAiffFixtures, parseAiffPointsTable, parseIflFixtures, parseIslFixtures,
  parseIslStandings, parseKhelNowFeed, parseYouTubeFeed, seasonFromLabel,
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
