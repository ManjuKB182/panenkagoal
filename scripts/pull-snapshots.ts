import { neonEnabled, pullAll } from './ingest/store';

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set; building from the snapshots in the repo.');
  process.exit(0);
}
const n = await pullAll();
console.log(neonEnabled() ? `Restored ${n} newer datasets from Neon.` : 'Neon unavailable; building from the snapshots in the repo.');
