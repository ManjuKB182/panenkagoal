import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { neonEnabled, neonSql } from './ingest/store';

// Never fails the pipeline: if Neon is down or over quota, builds and ingests carry on from the repo snapshots.
if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set; skipping migration.');
  process.exit(0);
}
const schema = await readFile(join(import.meta.dirname, '../db/schema.sql'), 'utf8');
// Split on ";" at line ends; the schema has no functions or quoted semicolons.
for (const stmt of schema.split(/;\s*$/m).map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) {
  await neonSql!.query(stmt);
  if (!neonEnabled()) break;
}
console.log(neonEnabled() ? 'Schema is up to date.' : 'Neon unavailable; migration skipped.');
