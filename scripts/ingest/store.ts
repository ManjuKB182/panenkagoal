// Datasets live as JSON snapshots in data/snapshots (what the site build reads).
// When DATABASE_URL is set, every write is also upserted into Neon, so data survives
// between GitHub Actions runs (each runner starts empty). `npm run snapshots:pull` restores them.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const ROOT = join(import.meta.dirname, '../../data/snapshots');
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

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

/** Writes the dataset. Returns true when the content changed. */
export async function writeDataset(key: string, data: unknown): Promise<boolean> {
  const hash = contentHash(data);
  const previous = await readDataset(key);
  const changed = previous === null || contentHash(previous) !== hash;
  if (changed) {
    await mkdir(dirname(fileFor(key)), { recursive: true });
    await writeFile(fileFor(key), JSON.stringify(data, null, 2) + '\n');
  }
  if (sql && changed) {
    await sql`
      insert into datasets (key, data, hash, updated_at)
      values (${key}, ${JSON.stringify(data)}::jsonb, ${hash}, now())
      on conflict (key) do update set data = excluded.data, hash = excluded.hash, updated_at = now()`;
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
  if (!sql) throw new Error('DATABASE_URL is not set');
  const rows = (await sql`select key, data from datasets`) as Array<{ key: string; data: unknown }>;
  for (const row of rows) {
    await mkdir(dirname(fileFor(row.key)), { recursive: true });
    await writeFile(fileFor(row.key), JSON.stringify(row.data, null, 2) + '\n');
  }
  return rows.length;
}
