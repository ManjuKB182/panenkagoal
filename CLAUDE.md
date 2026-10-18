# panenkagoal

## Release flow: Local → Staging → Main

Every change follows this order. Do not skip a stage.

1. **Local.** Make and test the change (`npm test`, `npm run check`, `npm run dev`).
2. **Staging.** Commit to the `staging` branch and push. CI deploys it to https://staging.panenkagoal.pages.dev. Report the URL and wait for the user to confirm it looks right.
3. **Main.** Only after that confirmation, merge `staging` into `main`. CI deploys to https://panenkagoal.com.

Never push straight to `main` unless the user explicitly says to. Never push or merge without being asked.

Notes:
- Staging and production share the same Neon database and R2 bucket.
- The scheduled ingest workflow deploys `main` only, so staging does not receive data refreshes.
- Never read, print or commit `.env`; it holds real credentials.
