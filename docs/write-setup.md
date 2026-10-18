# Write tab setup (Armchair Gaffers → Write)

Fans and analysts submit pieces with photos at `/armchair-gaffers/write/submit`. Nothing is public until an editor approves it at `/armchair-gaffers/review`.
Published pieces load live from Neon through Cloudflare Pages Functions, so approving a piece needs no site rebuild.

## One-time setup

1. **Database.** Run `npm run db:migrate` (CI already does on every deploy). It creates the `posts` and `write_submissions` tables. It is safe to run repeatedly.
2. **Photo storage (R2).** Cloudflare dashboard > R2 > Create bucket (e.g. `panenka-posts`, free tier is plenty). Then Pages project > Settings > Bindings > Add > R2 bucket, variable name `POSTS_BUCKET`, for both Production and Preview.
   Do not add a `wrangler.toml`: the deploy uses `wrangler pages deploy dist` and a config file would override the dashboard settings.
3. **Pages variables.** Pages project > Settings > Variables and Secrets (Production and Preview): `DATABASE_URL` (the Neon pooled string, as a secret). Without it, the Write tab shows an empty list and submissions are refused.
4. **Spam check (Turnstile).** Dashboard > Turnstile > Add widget for `panenkagoal.com`. Set `PUBLIC_TURNSTILE_SITE_KEY` (variable) and `TURNSTILE_SECRET` (secret). If either is missing the check is skipped, which is how local dev works. A hidden honeypot field and a limit of 5 submissions per IP per hour are always on.
5. **Editor login (Cloudflare Access, free for up to 50 users).**
   1. Dashboard > Zero Trust > Access > Applications > Add an application > Self-hosted.
   2. Add two public hostnames/paths on `panenkagoal.com`: `armchair-gaffers/review` and `api/write/review` (a trailing wildcard `api/write/review*` is fine).
   3. Policy: Action `Allow`, Include > Emails > the editors' addresses. Login method: One-time PIN (email code), no password or identity provider needed.
   4. Open the application's overview and copy the **Application Audience (AUD) tag**. Your team domain is `<team>.cloudflareaccess.com` (Zero Trust > Settings > Custom pages).
   5. Set `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` (e.g. `myteam.cloudflareaccess.com`) as Pages variables. With these set, the Functions verify the Access token's signature, audience and expiry. Without them they only check that the header exists, which is not safe on its own, so set them before launch.
6. Redeploy once so the variables and binding take effect.

## Editor workflow

Open `/armchair-gaffers/review`, sign in with your email code, then for each pending piece: **Read the piece**, then **Approve** (publishes instantly), **Send back** (type a note for the writer) or **Edit** (fix title, kind, text and captions, then Save). Each card has the writer's email as a link, so tell them when it is live or what to fix. There is no automatic email.

## Rules enforced by the server

- Up to 12 photos per piece (cover included), 5 MB each, JPG/PNG/WebP, checked from the file bytes. The browser also shrinks photos to 1600 px on the longest side before upload.
- Photos are stored with random names and served from `/api/write/photo/<key>` with a one-year cache.
- Photos stay the property of their owner. The credit (the writer's name, or the owner named on the form) prints under each photo.
