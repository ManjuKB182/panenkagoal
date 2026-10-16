# panenkagoal.com

The website for Panenka Goal: podcasts, Indian football tables, and news, in red and yellow.

Static site (Astro) on Cloudflare Pages. Data is fetched on a schedule by GitHub Actions, stored in Neon Postgres,
and baked into the pages at build time. Running cost: ₹0 beyond the domain.

## Run it locally

```sh
npm install
npm run ingest        # fetch live data into data/snapshots (no database needed locally)
npm run dev           # http://localhost:4321
```

Other commands:

| Command | Does |
|---|---|
| `npm test` | Unit tests (standings calculator, data parsers) |
| `npm run check` | Type-check |
| `npm run validate:data` | Check hand-edited files in `data/` |
| `npm run ingest -- --job isl` | Run one job: `videos`, `news`, `isl`, `aiff-ifl`, `youth` |
| `npm run build` | Build the static site into `dist/` |

## How data flows

```
GitHub Actions cron ──► scripts/ingest ──► Neon (datasets table) + data/snapshots/*.json
                                                    │
                    npm run snapshots:pull ◄────────┘  (CI restores snapshots before building)
                                │
                          astro build ──► wrangler pages deploy ──► panenkagoal.com
```

| Data | Source | Schedule (IST) |
|---|---|---|
| Panenka videos, ISL highlights | YouTube RSS | every 30 min |
| News | KhelNow RSS, The Hindu football RSS, Times of India sports RSS (`/sports/football/` links), Deccan Herald news sitemap; all filtered to Indian football by `classifyNews` | every 30 min |
| ISL table, fixtures, scorers | indiansuperleague.com public JSON | every 2 h |
| IFL | indianfootballleague.in | every 6 h |
| IWL, IWL 2, I-League 2 | the-aiff.com API | every 6 h |
| AIFF youth (U18, U15, U13) | the-aiff.com API | daily, 06:35 |
| BDFA Super Division (Karnataka Men's Super Division) | AIFF tournament 2148 (table, calendar, per-match scores and scorers) | every 2 h |
| X posts | pasted into `/admin` | any time |

Jobs deploy only when data actually changed. A rebuild at 00:05 IST moves "Today" on the homepage to the new day.
When a league's season label changes (e.g. "IWL 2025-26" → "IWL 2026-27"), the old season is archived
under `leagues/archive/` automatically.

## Where things live

| Path | What |
|---|---|
| `src/config/site.ts` | Brand, nav, social links, WhatsApp number for merch |
| `src/config/competitions.ts` | Every league: source, zones, labels. A rename is an edit here. |
| `data/manual/bdfa-sd.json` | BDFA teams, results, fixtures (edit via `/admin`) |
| `data/shows.json` | YouTube shows → playlist IDs |
| `data/merch/*.json` | Merch products |
| `data/snapshots/` | Fetched data (seed copy committed; CI refreshes from Neon) |
| `scripts/ingest/` | Fetchers and parsers |
| `db/schema.sql` | Neon tables |

## One-time setup

1. **GitHub**: push this repo as a **public** repo (free unlimited Actions minutes). Protect `main`: require the `check` job.
2. **Neon** (free): create a project in `aws-ap-southeast-1` (Singapore). Copy the *pooled* connection string.
3. **Cloudflare** (free):
   - Pages → Create project → *Direct upload* → name it `panenkagoal`.
   - Add custom domains `panenkagoal.com` and `www.panenkagoal.com`.
   - Create an API token with *Cloudflare Pages: Edit*.
4. **GitHub secrets and variables** (Settings → Secrets and variables → Actions):

   | Name | Kind | Value |
   |---|---|---|
   | `DATABASE_URL` | secret | Neon pooled connection string |
   | `NEON_API_KEY` | secret | Neon API key (for PR database branches) |
   | `NEON_PROJECT_ID` | variable | Neon project ID |
   | `CLOUDFLARE_API_TOKEN` | secret | Pages: Edit token |
   | `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare account ID |
   | `YT_API_KEY` | secret | optional, not used yet |

5. Run **Actions → ingest → Run workflow** once to fill Neon, then push to `main` to deploy.
6. **Admin** (`/admin`): set `repo` in `public/admin/config.yml`, deploy the free
   [Sveltia CMS Authenticator](https://github.com/sveltia/sveltia-cms-auth) Worker, set `base_url`, and protect
   `/admin` with Cloudflare Access (free for up to 50 users).

## Being a polite client

Every request sends `User-Agent: PanenkaGoalBot (+https://panenkagoal.com/about)`. Sources are fetched a few times
a day at most, every table credits its source, and headlines link to the publisher. If a source asks us to stop,
switch that league to `kind: 'manual'` in `src/config/competitions.ts`.

## Keep the schedules alive

GitHub disables scheduled workflows in public repos after 60 days with no commits. Admin edits are commits, so
regular use keeps them running. If they ever stop, re-enable them under Actions → ingest.
