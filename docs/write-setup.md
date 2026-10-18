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
6. **Writer login (second Access app, approved emails only).** Writers sign in with a one-time PIN sent to their email, so the site knows who wrote what. Only a signed-in writer can submit, and each writer sees their own pieces at `/armchair-gaffers/write/mine`, with the editor's note on sent-back pieces and a button to fix and resubmit.
   1. Zero Trust > Access controls > Applications > Add an application > Self-hosted. Name it `Panenka writers`.
   2. Public hostnames, on `panenkagoal.com`, `panenkagoal.pages.dev` and `staging.panenkagoal.pages.dev`: paths `armchair-gaffers/write/submit`, `armchair-gaffers/write/mine`, `api/write/submit` and `api/write/mine*`.
   3. Policy: Action `Allow`, Include > Emails > the approved writers' addresses. Login method: One-time PIN. To add or remove a writer, edit that email list; no redeploy needed.
   4. Copy this app's **AUD tag** and set it as `CF_ACCESS_WRITER_AUD` (Pages variable, Production and Preview). It must differ from `CF_ACCESS_AUD`: that difference is what keeps writers out of the editor tools.
7. Redeploy once so the variables and binding take effect.

## Editor workflow

Open `/armchair-gaffers/review`, sign in with your email code, then for each pending piece: **Read the piece**, then **Approve** (publishes instantly), **Send back** (type a note for the writer) or **Edit** (fix title, kind, text and captions, then Save). Each card has the writer's email as a link, so tell them when it is live or what to fix. There is no automatic email.

## Rules enforced by the server

- Up to 12 photos per piece (cover included), 5 MB each, JPG/PNG/WebP, checked from the file bytes. The browser also shrinks photos to 1600 px on the longest side before upload.
- Photos are stored with random names and served from `/api/write/photo/<key>` with a one-year cache.
- Photos stay the property of their owner. The credit (the writer's name, or the owner named on the form) prints under each photo.
