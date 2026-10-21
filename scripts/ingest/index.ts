// Usage:
//   npm run ingest                    # every job
//   npm run ingest -- --job videos    # one job
//   npm run ingest -- --schedule "23 */2 * * *"   # jobs mapped to a GitHub Actions cron line
//   npm run ingest -- --leagues isl,iwl           # only those leagues (the match-day gate passes the ones in play)
import { appendFile } from 'node:fs/promises';
import { aiffIflJob, islJob, leaguesJob, newsJob, stateLeagueJob, videosJob, youthJob } from './jobs';
import { recordRun } from './store';

const JOBS: Record<string, () => Promise<boolean>> = {
  videos: videosJob,
  news: newsJob,
  isl: islJob,
  'aiff-ifl': aiffIflJob,
  youth: youthJob,
  karnataka: stateLeagueJob,
};

// Must match the cron lines in .github/workflows/ingest.yml
// League jobs no longer run on a blind timer: the match-day gate (scripts/ingest/gate.mjs) passes --leagues only while a match is in play.
const SCHEDULES: Record<string, string[]> = {
  '17,47 * * * *': ['videos', 'news'],
  '5 1 * * *': ['youth'],
  // 00:05 IST: refresh every fixture list (so the gate knows today's kickoffs) and rebuild so "Today" and the ticker move to the new day.
  '35 18 * * *': ['isl', 'aiff-ifl', 'karnataka'],
  // Every 5 min: the gate decides; this line only exists so the schedule is recognised.
  '*/5 * * * *': [],
};
const DAILY_REBUILD = '35 18 * * *';

function pickJobs(argv: string[]): string[] {
  const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const job = arg('job');
  const schedule = arg('schedule');
  if (arg('leagues') !== undefined) return arg('leagues') ? ['leagues'] : [];
  if (job && job !== 'auto' && job !== 'all') return [job];
  if (schedule && SCHEDULES[schedule]) return SCHEDULES[schedule];
  return Object.keys(JOBS);
}

const argv = process.argv.slice(2);
const leagueArg = argv.indexOf('--leagues') >= 0 ? (argv[argv.indexOf('--leagues') + 1] ?? '').split(',').filter(Boolean) : [];
JOBS.leagues = () => leaguesJob((c) => leagueArg.includes(c.slug));
const names = pickJobs(argv);
let anyChanged = argv.includes(DAILY_REBUILD) || argv.includes('--force');
let failed = false;

for (const name of names) {
  const run = JOBS[name];
  if (!run) {
    console.error(`Unknown job "${name}". Known: ${Object.keys(JOBS).join(', ')}`);
    process.exit(2);
  }
  const started = new Date();
  try {
    const changed = await run();
    anyChanged ||= changed;
    console.log(`✓ ${name}${changed ? ' (changed)' : ''} in ${Date.now() - started.getTime()} ms`);
    await recordRun(name, started, 'ok', changed);
  } catch (e) {
    failed = true;
    const changed = Boolean((e as any).changed);
    anyChanged ||= changed;
    console.error(`::error::${name} failed: ${(e as Error).message}`);
    await recordRun(name, started, 'error', changed, (e as Error).message).catch(() => {});
  }
}

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${anyChanged}\n`);
// Still deploy what changed, but mark the run red so the failure is visible.
process.exitCode = failed ? 1 : 0;
