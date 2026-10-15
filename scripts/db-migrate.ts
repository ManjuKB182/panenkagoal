import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set; skipping migration.');
  process.exit(0);
}
const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(join(import.meta.dirname, '../db/schema.sql'), 'utf8');
// Split on ";" at line ends; the schema has no functions or quoted semicolons.
for (const stmt of schema.split(/;\s*$/m).map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) {
  await sql.query(stmt);
}
console.log('Schema is up to date.');
