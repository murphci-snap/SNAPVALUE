import { NFL_ABBR } from "./constants";
import {
  formatPct,
  formatSpread,
  isHome,
  otherTeam,
  poolPickPct,
  teamSpread,
  teamWinProb,
} from "./markets";
import type { Game } from "./types";
export type { PoolSize } from "./pool-size";
export { poolSizeSteep, poolSizeMods } from "./pool-size";
import { poolSizeSteep, poolSizeMods, type PoolSize } from "./pool-size";
export type {
  PoolKind,
  EntryStyle,
  PoolPick,
  PoolWatch,
  PoolPlan,
  FutureSpot,
} from "./pool-helpers";
export { loadRemainingSchedule } from "./pool-helpers";
import {
  type PoolKind,
  type EntryStyle,
  type PoolPick,
  type PoolWatch,
  type PoolPlan,
  type FutureSpot,
  styleFor,
  gameOf,
  upcomingGames,
  skinnyFav,
  skinnyDog,
  teamRating,
  futureWin,
  scoreSurvivor,
  scoreLoser,
  whySurvivor,
  whyLoser,
  playWhySurvivor,
  playWhyLoser,
  publicNote,
} from "./pool-helpers";

function buildHammers(
  kind: PoolKind,
  live: Game[],
  usedSet: Set<string>,
  future: FutureSpot[],
  week: number,
  steep = 1,
): PoolWatch[] {
  const ratings = teamRating(live);
  if (kind === "survivor") {
    const rows: Array<PoolWatch & { score: number }> = [];
    for (const team of NFL_ABBR) {
      if (usedSet.has(team)) continue;
      const spots = future.filter((f) => f.team === team && f.week > week);
      if (spots.length) {
        const wins = spots.map((sp) => futureWin(team, sp, ratings));
        const best = Math.max(...wins);
        const avg = wins.reduce((a, b) => a + b, 0) / wins.length;
        const bestSpot = spots[wins.indexOf(best)]!;
        const score = 0.58 * best + 0.42 * avg;
        if (best < 0.68 && avg < 0.58) continue;
        rows.push({
          team,
          opponent: bestSpot.opponent,
          spread: null,
          rate: best,
          score,
          publicPct: poolPickPct(best, "survivor", steep),
          why: `Save for later — leftover schedule still has a cleaner lock (best remaining ~${formatPct(best)} vs ${bestSpot.opponent} in week ${bestSpot.week}; avg leftover ${formatPct(avg)}).`,
        });
        continue;
      }
      const g = gameOf(live, team);
      if (!g) continue;
      const win = teamWinProb(g, team);
      const spread = teamSpread(g, team);
      if (win == null || win < 0.78 || spread == null || spread > -7) continue;
      rows.push({
        team,
        opponent: otherTeam(g, team),
        spread,
        rate: win,
        score: win,
        publicPct: poolPickPct(win, "survivor", steep),
        why: `True leftover hammer — ${formatSpread(spread)} this week and still unused. Hold unless the board is empty.`,
      });
    }
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, 3);
  }
  const dogs: PoolWatch[] = [];
  for (const g of live) {
    for (const team of [g.awayAbbr, g.homeAbbr]) {
      if (!team || usedSet.has(team)) continue;
      const win = teamWinProb(g, team);
      if (win == null) continue;
      const lose = 1 - win;
      if (lose < 0.74) continue;
      const spread = teamSpread(g, team);
      dogs.push({
        team,
        opponent: otherTeam(g, team),
        spread,
        rate: lose,
        publicPct: poolPickPct(lose, "loser", steep),
        why: `${team} is a true dog (${formatPct(lose)} to lose). Do not stack every ticket here.`,
      });
    }
  }
  dogs.sort((a, b) => b.rate - a.rate);
  return dogs.slice(0, 3);
}

export function buildPoolPlan(
  kind: PoolKind,
  games: Game[],
  entryCount: number,
  used: string[],
  week = 1,
  future: FutureSpot[] = [],
  poolSize: PoolSize = "medium",
): PoolPlan {
  const steep = poolSizeSteep(poolSize);
  const mods = poolSizeMods(poolSize);
  const live = upcomingGames(games);
  const earliest = live.reduce((min, g) => {
    const t = Date.parse(g.startTime);
    return Number.isFinite(t) && t < min ? t : min;
  }, Number.POSITIVE_INFINITY);

  function late(iso: string): boolean {
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || !Number.isFinite(earliest)) return false;
    if (t - earliest > 32 * 3600 * 1000) return true;
    const d = new Date(t);
    const dow = d.getUTCDay();
    const h = d.getUTCHours();
    return (dow === 1 && h < 8) || (dow === 2 && h < 8);
  }
  const usedSet = new Set(used.filter((t) => NFL_ABBR.includes(t)));
  const n = Math.max(1, Math.min(10, Math.floor(entryCount) || 1));
  const picks: PoolPick[] = [];
  const takenTeams = new Set<string>();
  const takenGames = new Set<number>();

  const hammerPool = buildHammers(kind, live, usedSet, future, week, steep);
  const hammerTeams = new Set(hammerPool.map((h) => h.team));

  const candidates = (): string[] => {
    const out: string[] = [];
    for (const g of live) {
      for (const abbr of [g.awayAbbr, g.homeAbbr]) {
        if (!abbr || usedSet.has(abbr) || takenTeams.has(abbr)) continue;
        if (teamWinProb(g, abbr) == null) continue;
        out.push(abbr);
      }
    }
    return out;
  };

  for (let i = 0; i < n; i++) {
    const style = styleFor(i, n);
    const pool = candidates();
    if (!pool.length) break;
    const chalkTicket = style === "chalk";
    const hasSafeFav = pool.some((team) => {
      const g = gameOf(live, team);
      if (!g) return false;
      const spread = teamSpread(g, team);
      const win = teamWinProb(g, team) ?? 0;
      return kind === "survivor" ? !skinnyFav(spread) && win >= 0.62 : !skinnyDog(spread) && 1 - win >= 0.66;
    });
    let best: { team: string; score: number } | null = null;
    for (const team of pool) {
      const g = gameOf(live, team);
      if (!g) continue;
      const win = teamWinProb(g, team);
      if (win == null) continue;
      const spread = teamSpread(g, team);
      if (kind === "survivor" && chalkTicket && skinnyFav(spread) && hasSafeFav) continue;
      if (kind === "loser" && chalkTicket && skinnyDog(spread) && hasSafeFav) continue;
      const uniqueGame = !takenGames.has(g.id);
      const pickPct = poolPickPct(kind === "survivor" ? win : 1 - win, kind, steep);
      const uniqueSide = pickPct < 0.16;
      const score =
        kind === "survivor"
          ? scoreSurvivor(win, style, uniqueGame, uniqueSide, {
              hammer: hammerTeams.has(team),
              week,
              skinny: skinnyFav(spread),
              pickPct,
              mods,
            })
          : scoreLoser(1 - win, style, uniqueGame, {
              skinny: skinnyDog(spread),
              chalkTicket,
              pickPct,
              mods,
            });
      if (!best || score > best.score) best = { team, score };
    }
    if (!best) break;
    const g = gameOf(live, best.team);
    if (!g) break;
    const win = teamWinProb(g, best.team) ?? 0.5;
    const spread = teamSpread(g, best.team);
    const opp = otherTeam(g, best.team);
    const home = isHome(g, best.team);
    const pickPct = poolPickPct(kind === "survivor" ? win : 1 - win, kind, steep);
    const isLate = late(g.startTime);
    takenTeams.add(best.team);
    takenGames.add(g.id);

    const remaining = candidates();
    let backup: string | null = null;
    let backupWhy: string | null = null;
    let backupScore = -Infinity;
    for (const team of remaining) {
      const bg = gameOf(live, team);
      if (!bg || bg.id === g.id) continue;
      const w = teamWinProb(bg, team);
      if (w == null) continue;
      const sc = kind === "survivor" ? w : 1 - w;
      if (sc > backupScore) {
        backupScore = sc;
        backup = team;
        const bs = teamSpread(bg, team);
        backupWhy =
          kind === "survivor"
            ? `${team} ${bs == null ? "" : formatSpread(bs)} if ${best.team} gets news`
            : `${team} ${bs == null ? "" : formatSpread(bs)} as the pivot`;
      }
    }
    if (isLate && backup) {
      backupWhy = `${backupWhy ?? backup} · late kickoff, hold as pivot`;
    }

    picks.push({
      entry: i + 1,
      style,
      team: best.team,
      opponent: opp,
      home,
      spread,
      winProb: win,
      loseProb: 1 - win,
      gameId: g.id,
      kickoff: g.startTime,
      why:
        kind === "survivor"
          ? whySurvivor(
              best.team,
              opp,
              home,
              spread,
              win,
              style,
              week > 2 && hammerTeams.has(best.team) && style !== "chalk",
              pickPct,
            )
          : whyLoser(best.team, opp, home, spread, 1 - win, style, pickPct),
      backup,
      backupWhy,
      publicNote: publicNote(kind, pickPct, best.team),
      publicPct: pickPct,
      late: isLate,
      playWhy:
        kind === "survivor"
          ? playWhySurvivor(week, best.team, opp, home, spread, win, style, isLate)
          : playWhyLoser(week, best.team, opp, home, spread, 1 - win, style, isLate),
    });
  }

  const leftover = NFL_ABBR.filter((t) => !usedSet.has(t) && !takenTeams.has(t));
  const hammers = hammerPool.filter((h) => !takenTeams.has(h.team)).slice(0, 3);
  const traps: PoolWatch[] = [];
  if (kind === "survivor") {
    for (const g of live) {
      for (const team of [g.awayAbbr, g.homeAbbr]) {
        if (!team || usedSet.has(team) || takenTeams.has(team) || hammerTeams.has(team)) continue;
        const win = teamWinProb(g, team);
        if (win == null) continue;
        const spread = teamSpread(g, team);
        const skinny = skinnyFav(spread);
        const soft = win >= 0.52 && win <= 0.65;
        if (!skinny && !soft) continue;
        traps.push({
          team,
          opponent: otherTeam(g, team),
          spread,
          rate: win,
          publicPct: poolPickPct(win, "survivor", steep),
          why: skinny
            ? `${team} ${formatSpread(spread!)} is a skinny favorite. Looks safe, dies in pools. Sit it out.`
            : `${team} at ${formatPct(win)} is a soft spot, not a hammer. Don't force it.`,
        });
      }
    }
    traps.sort((a, b) => a.rate - b.rate);
  } else {
    for (const team of leftover) {
      const g = gameOf(live, team);
      if (!g) continue;
      const win = teamWinProb(g, team);
      if (win == null) continue;
      const spread = teamSpread(g, team);
      const lose = 1 - win;
      if (skinnyDog(spread) || (lose >= 0.52 && lose <= 0.6)) {
        traps.push({
          team,
          opponent: otherTeam(g, team),
          spread,
          rate: lose,
          publicPct: poolPickPct(lose, "loser", steep),
          why: `${team} is a skinny dog. Loser pools bleed out on these.`,
        });
      }
    }
    traps.sort((a, b) => a.rate - b.rate);
  }

  const sizeNote =
    poolSize === "large"
      ? " Large pool: steeper public chalk penalties, stronger uniqueness / hammer reserve."
      : poolSize === "small"
        ? " Small pool: chalkier Ticket 1, lighter uniqueness push."
        : "";
  const note =
    kind === "survivor"
      ? week <= 2
        ? `Week ${week}: early season. Cash Ticket 1. Hammers are leftover-schedule locks, not every 75% favorite. Skinny 3-point favorites are traps.${sizeNote}`
        : n === 1
          ? `One ticket: take the safest win this week. Saved hammers stay on the bench unless the board is ugly.${sizeNote}`
          : `${n} tickets: different teams every time. Ticket 1 is this week's safest win. Later tickets stay unique. Don't spend leftover-schedule hammers unless you have to.${sizeNote}`
      : week <= 2
        ? `Week ${week}: take the most likely loss. Skip skinny dogs on Ticket 1.${sizeNote}`
        : n === 1
          ? `One ticket: pick the team most likely to lose. Do not get cute.${sizeNote}`
          : `${n} tickets: never double a team. Split games so one upset cannot wipe every entry.${sizeNote}`;

  return { kind, entries: picks, leftover, hammers, traps: traps.slice(0, 5), note };
}
