# SNAPVALUE

Weekly DraftKings Classic DFS football research, plus survivor / loser pool tickets and a weekly betting desk.

Vegas / FanDuel player props, consensus rankings, IT Factor smash spots, pts/$ value, random optimum $50k Classic lineups, multi-entry survivor and loser strategies, three best bets, a spread lock, and a two-player anytime TD.

**DFS stack:** QB + 2 RB + 3 WR + TE + FLEX + DST · $50,000 salary cap.

## What is in the app

- **Players** — slate by position, matchup, projections, value
- **Lineups** — random optimum Classic lineups
- **Pools** — survivor and loser pool, 1–10 tickets, used-team tracking
- **Bets** — 3 best bets, ATS lock, 2-leg anytime TD from live books + Grok

## Live data

No database and no API keys. The site pulls public slate data on a timer (about every two hours) from DraftKings, Vegas/Bovada props, FanDuel game totals, ESPN, RotoWire/Sleeper, and FantasyPros.

## Deploy on Vercel

1. Open [vercel.com/new](https://vercel.com/new)
2. Import this GitHub repo (`murphci-snap/SNAPVALUE`)
3. Leave every setting on default
4. **Do not add environment variables** (including `DATABASE_URL`)
5. Click Deploy

Framework detection may say “Other”. That is fine — `npm run build` in [package.json](package.json) is the production build.

| Vercel plan | Function time | Auto-refresh cron |
| --- | --- | --- |
| Hobby (free) | ~10 seconds (first load can be tight) | Daily |
| Pro | 60 seconds | Every 2 hours (`/api/slate`) |

Node 22 is required (see `.nvmrc`).

## Local

```bash
npm install
npm run dev
```

Opens on port 8080.
