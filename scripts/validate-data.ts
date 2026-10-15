// Checks hand-edited files in data/ before they reach the site. Runs in CI on every push.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA = join(import.meta.dirname, '../data');
const problems: string[] = [];
const load = async (rel: string) => JSON.parse(await readFile(join(DATA, rel), 'utf8'));
const isScore = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 50;
const isDate = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s));

// Manual leagues: every result must name known teams and have valid scores.
for (const file of await readdir(join(DATA, 'manual'))) {
  const league = await load(`manual/${file}`);
  const teams = new Set<string>(league.teams ?? []);
  if (teams.size < 2) problems.push(`manual/${file}: needs at least two teams`);
  (league.results ?? []).forEach((r: any, i: number) => {
    const where = `manual/${file} result #${i + 1}`;
    if (!teams.has(r.home)) problems.push(`${where}: unknown home team "${r.home}"`);
    if (!teams.has(r.away)) problems.push(`${where}: unknown away team "${r.away}"`);
    if (r.home === r.away) problems.push(`${where}: a team can't play itself`);
    if (!isScore(r.homeScore) || !isScore(r.awayScore)) problems.push(`${where}: scores must be whole numbers`);
    if (!isDate(r.date)) problems.push(`${where}: date must be YYYY-MM-DD`);
  });
}

// Shows: playlist IDs look like YouTube playlist IDs and slugs are unique.
const { shows } = await load('shows.json');
const slugs = new Set<string>();
for (const s of shows) {
  if (!/^PL[\w-]{16,40}$/.test(s.playlistId)) problems.push(`shows.json: "${s.name}" has an invalid playlistId`);
  if (slugs.has(s.slug)) problems.push(`shows.json: duplicate slug "${s.slug}"`);
  slugs.add(s.slug);
}

// Merch: status is one of the known values, prices are positive when set.
for (const file of await readdir(join(DATA, 'merch'))) {
  const m = await load(`merch/${file}`);
  if (!['coming-soon', 'pre-order', 'live', 'sold-out'].includes(m.status)) problems.push(`merch/${file}: unknown status "${m.status}"`);
  if (m.price !== null && !(typeof m.price === 'number' && m.price > 0)) problems.push(`merch/${file}: price must be a positive number or null`);
  if (`${m.slug}.json` !== file) problems.push(`merch/${file}: slug must match the file name`);
}

// X posts: only status URLs.
for (const p of (await load('x-posts.json')).posts ?? []) {
  if (!/^https:\/\/(x|twitter)\.com\/\w+\/status\/\d+/.test(p.url)) problems.push(`x-posts.json: not a post URL: ${p.url}`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('✓ data/ is valid');
