import { pullAll } from './ingest/store';

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set; building from the snapshots in the repo.');
  process.exit(0);
}
console.log(`Restored ${await pullAll()} datasets from Neon.`);
