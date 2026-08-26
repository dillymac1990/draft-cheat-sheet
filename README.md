## Draft Cheat Sheet

A live fantasy football draft cheat sheet: load your own rankings as a CSV, point it at a Sleeper league, and it auto-crosses off players as they're picked during a live draft.

### Usage

1. `npm install`
2. `npm run dev`, open [http://localhost:3000](http://localhost:3000)
3. On the setup page, enter your Sleeper league ID (from the league URL) and upload/paste your rankings CSV — columns `rank, name, pos, team`, plus optional `tier, bye`.
4. Click **Go to Draft Board**. It polls Sleeper's live draft picks every few seconds and marks matched players as drafted.

Everything (rankings, league ID, your team selection) is stored in the browser only — there's no backend database.

### Deploy on Vercel

```bash
npx vercel
```

or connect the repo at [vercel.com/new](https://vercel.com/new). No environment variables are required — Sleeper's API is public and unauthenticated.
