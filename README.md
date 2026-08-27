## Draft Cheat Sheet

A live fantasy football draft cheat sheet: your rankings are pulled from a Google Sheet, and it auto-crosses off players as they're picked during a live Sleeper draft.

### Usage

1. `npm install`
2. `npm run dev`, open [http://localhost:3000](http://localhost:3000)
3. On the setup page, enter your Sleeper league ID (from the league URL). Your rankings load automatically from the configured Google Sheet — a manual CSV paste/upload is available as a fallback (columns `rank, name, pos, team`, plus optional `tier, bye`).
4. Click **Go to Draft Board**. It polls Sleeper's live draft picks every few seconds and marks matched players as drafted.

Everything (rankings, league ID, your team selection) is stored in the browser only — there's no backend database.

### Rankings source

Rankings live in a Google Sheet, published as CSV (`File > Share > Publish to web > CSV`), and fetched server-side via `RANKINGS_SHEET_CSV_URL` (see `.env.local` / Vercel project env vars). Edit the sheet any time — the setup page re-fetches on every visit (and has a manual **Refresh** button).

### Deploy on Vercel

```bash
npx vercel
```

or connect the repo at [vercel.com/new](https://vercel.com/new). Set `RANKINGS_SHEET_CSV_URL` in the project's environment variables — Sleeper's API itself needs no configuration.
