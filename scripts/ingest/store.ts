// Datasets live as JSON snapshots in data/snapshots (what the site build reads).
// When DATABASE_URL is set, every write is also upserted into Neon, so data survives
// between GitHub Actions runs (each runner starts empty). `npm run snapshots:pull` restores them.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { currentSeason } from './parsers';

const ROOT = join(import.meta.dirname, '../../data/snapshots');
const client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
// Neon is a mirror, never a requirement: the repo snapshots are the source of truth. After the first Neon failure
// (quota exceeded, outage, bad URL) it is switched off for the rest of the run so nothing waits on it or fails because of it.
let neonDown = false;
export function neonFailed(what: string, e: unknown) {
  if (!neonDown) console.warn(`::warning::Neon unavailable (${what}): ${(e as Error).message?.slice(0, 200)}. Continuing with the repo snapshots.`);
  neonDown = true;
}
const sql = client ? Object.assign(
  async (...a: Parameters<typeof client>) => {
    if (neonDown) return [] as any[];
    try { return await client(...a); } catch (e) { neonFailed('query', e); return [] as any[]; }
  },
  { query: async (q: string) => { if (!neonDown) { try { await client.query(q); } catch (e) { neonFailed('migrate', e); } } } },
) : null;
export const neonEnabled = () => Boolean(sql) && !neonDown;
export const neonSql = sql;

const fileFor = (key: string) => join(ROOT, `${key}.json`);

/** Hash ignores `updatedAt`, so a run that fetches identical data does not count as a change. */
export function contentHash(data: unknown): string {
  const stable = JSON.stringify(data, (k, v) => (k === 'updatedAt' ? undefined : v));
  return createHash('sha256').update(stable).digest('hex');
}

export async function readDataset<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(fileFor(key), 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Writes the dataset. Returns true when the content changed locally or in Neon.
 * Neon is compared by its own hash, not the local file: a local copy can match the new data while Neon holds an old row.
 */
export async function writeDataset(key: string, data: unknown): Promise<boolean> {
  const hash = contentHash(data);
  const previous = await readDataset(key);
  let changed = previous === null || contentHash(previous) !== hash;
  if (changed) {
    await mkdir(dirname(fileFor(key)), { recursive: true });
    await writeFile(fileFor(key), JSON.stringify(data, null, 2) + '\n');
  }
  if (sql) {
    const updated = await sql`
      insert into datasets (key, data, hash, updated_at)
      values (${key}, ${JSON.stringify(data)}::jsonb, ${hash}, now())
      on conflict (key) do update set data = excluded.data, hash = excluded.hash, updated_at = now()
      where datasets.hash <> excluded.hash
      returning key`;
    if (updated.length) changed = true;
  }
  return changed;
}

export async function recordRun(job: string, startedAt: Date, status: 'ok' | 'error', changed: boolean, error?: string) {
  if (!sql) return;
  await sql`
    insert into ingest_runs (job, started_at, finished_at, status, changed, error)
    values (${job}, ${startedAt.toISOString()}, now(), ${status}, ${changed}, ${error ?? null})`;
}

/** Restore every dataset from Neon into data/snapshots (used in CI before a build). */
export async function pullAll(): Promise<number> {
  if (!sql) return 0;
  const rows = (await sql`select key, data from datasets`) as Array<{ key: string; data: unknown }>;
  const cur = currentSeason();
  let n = 0;
  for (const row of rows) {
    // A stale writer (an older deploy's ingest) can leave last season's league table in Neon; keep the repo's current one.
    const season = (row.data as { season?: string } | null)?.season;
    if (row.key.startsWith('leagues/') && season && /^\d{4}-\d{2}$/.test(season) && season < cur) continue;
    // Newest wins: never replace a repo snapshot with an older copy from Neon (e.g. after Neon was unreachable for a while).
    const local = await readDataset<{ updatedAt?: string }>(row.key);
    const remoteAt = (row.data as { updatedAt?: string } | null)?.updatedAt ?? '';
    if (local?.updatedAt && local.updatedAt >= remoteAt) continue;
    n++;
    await mkdir(dirname(fileFor(row.key)), { recursive: true });
    await writeFile(fileFor(row.key), JSON.stringify(row.data, null, 2) + '\n');
  }
  return n;
}
