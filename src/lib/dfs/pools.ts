import { NFL_ABBR } from "./constants";
import {
  formatPct,
  formatSpread,
  isHome,
  isUpcoming,
  otherTeam,
  teamSpread,
  teamWinProb,
} from "./markets";
import type { Game } from "./types";

export type PoolKind = "survivor" | "loser";
export type EntryStyle = "chalk" | "value" | "ladder" | "contrarian";

export interface PoolPick {
  entry: number;
  style: EntryStyle;
  team: string;
  opponent: string;
  home: boolean;
  spread: number | null;
  winProb: number;
  loseProb: number;
  gameId: number;
  kickoff: string;
  why: string;
  backup: string | null;
  backupWhy: string | null;
  publicNote: string;
  late: boolean;
  playWhy: string;
}

export interface PoolWatch {
  team: string;
  opponent: string;
  spread: number | null;
  rate: number;
  why: string;
}

export interface PoolPlan {
  kind: PoolKind;
  entries: PoolPick[];
  leftover: string[];
  hammers: PoolWatch[];
  traps: PoolWatch[];
  note: string;
}

const STYLE_CYCLE: EntryStyle[] = ["chalk", "value", "ladder", "contrarian", "value"];

function styleFor(i: number, n: number): EntryStyle {
  if (n === 1) return "value";
  if (i === 0) return "chalk";
  if (i === n - 1 && n >= 3) return "contrarian";
  return STYLE_CYCLE[i % STYLE_CYCLE.length] ?? "ladder";
}

function gameOf(games: Game[], abbr: string): Game | undefined {
  return games.find((g) => g.homeAbbr === abbr || g.awayAbbr === abbr);
}

function upcomingGames(games: Game[]): Game[] {
  return games.filter((g) => isUpcoming(g) && g.spread != null);
}

function scoreSurvivor(win: number, style: EntryStyle, uniqueGame: boolean, uniqueSide: boolean): number {
  let s = win;
  if (style === "chalk") s = win;
  if (style === "value") {
    s = win - (win > 0.76 ? 0.1 : 0) + (win > 0.62 && win < 0.74 ? 0.04 : 0);
  }
  if (style === "ladder") s = win - (win > 0.8 ? 0.06 : 0);
  if (style === "contrarian") {
    const sweet = 1 - Math.abs(win - 0.64) * 2.2;
    s = sweet * 0.55 + win * 0.45;
  }
  if (uniqueGame) s += 0.035;
  if (uniqueSide) s += 0.01;
  return s;
}

function scoreLoser(lose: number, style: EntryStyle, uniqueGame: boolean): number {
  let s = lose;
  if (style === "chalk") s = lose;
  if (style === "value") s = lose - (lose > 0.78 ? 0.08 : 0);
  if (style === "ladder") s = lose;
  if (style === "contrarian") {
    const sweet = 1 - Math.abs(lose - 0.62) * 2;
    s = sweet * 0.5 + lose * 0.5;
  }
  if (uniqueGame) s += 0.04;
  return s;
}

function whySurvivor(
  team: string,
  opp: string,
  home: boolean,
  spread: number | null,
  win: number,
  style: EntryStyle,
  isHammer: boolean,
): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  if (style === "chalk") {
    return `${team}${line} ${loc} vs ${opp} is the cleanest win rate this week (${formatPct(win)}). Ticket 1 is about surviving, not saving.`;
  }
  if (style === "contrarian") {
    return `${team}${line} is a playable favorite (${formatPct(win)}) that most pools will skip while they pile on bigger names. Unique tickets matter if you last.`;
  }
  if (isHammer) {
    return `${team}${line} ${loc} vs ${opp} is a top leftover hammer (${formatPct(win)}). You’re spending bench equity — only if this ticket needs the floor.`;
  }
  return `${team}${line} ${loc} vs ${opp} is a real favorite this week (${formatPct(win)}) without sitting in the top leftover hammers.`;
}

function whyLoser(team: string, opp: string, home: boolean, spread: number | null, lose: number, style: EntryStyle): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  if (style === "chalk") {
    return `${team}${line} ${loc} vs ${opp} is the most likely loss (${formatPct(lose)}). This is the ticket you need to cash.`;
  }
  if (style === "contrarian") {
    return `${team}${line} is a softer dog (${formatPct(lose)} lose). If the chalk dog sneaks a win, this ticket is still alive.`;
  }
  return `${team}${line} ${loc} against ${opp} profiles as a loss without doubling the same game as ticket 1.`;
}

function playWhySurvivor(
  week: number,
  team: string,
  opp: string,
  home: boolean,
  spread: number | null,
  win: number,
  style: EntryStyle,
): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  const wk = `Week ${week}`;
  if (style === "chalk") {
    return `${wk}: ${team}${line} ${loc} vs ${opp}. Win rate ${formatPct(win)}. Cash this ticket now.`;
  }
  if (style === "contrarian") {
    return `${wk}: ${team}${line} vs ${opp} at ${formatPct(win)} — quieter than the pile-on chalk. Play it for uniqueness.`;
  }
  return `${wk}: ${team}${line} ${loc} vs ${opp}. ${formatPct(win)} to win on this spread. Play it this week.`;
}

function playWhyLoser(
  week: number,
  team: string,
  opp: string,
  home: boolean,
  spread: number | null,
  lose: number,
  style: EntryStyle,
): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  const wk = `Week ${week}`;
  if (style === "chalk") {
    return `${wk}: ${team}${line} ${loc} vs ${opp}. ${formatPct(lose)} to lose. This is the ticket that has to cash.`;
  }
  if (style === "contrarian") {
    return `${wk}: ${team}${line} at ${formatPct(lose)} to lose — softer dog, different game from ticket 1.`;
  }
  return `${wk}: ${team}${line} ${loc} against ${opp}. ${formatPct(lose)} to lose. Split it off the chalk dog.`;
}

function publicNote(kind: PoolKind, winOrLose: number, team: string): string {
  if (kind === "survivor") {
    if (winOrLose >= 0.78) return `Street chalk — a huge share of survivor entries will be on ${team}.`;
    if (winOrLose >= 0.7) return `Popular but not consensus. Fine on a second ticket.`;
    return `Quieter than the chalk. Good for uniqueness if you trust the spot.`;
  }
  if (winOrLose >= 0.78) return `Public loser-pool chalk. Diversify other tickets off this game.`;
  return `Less crowded than the obvious dogs.`;
}

export function buildPoolPlan(
  kind: PoolKind,
  games: Game[],
  entryCount: number,
  used: string[],
  week = 1,
): PoolPlan {
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

  const survivorHammerPool: PoolWatch[] = [];
  if (kind === "survivor") {
    for (const g of live) {
      for (const team of [g.awayAbbr, g.homeAbbr]) {
        if (!team || usedSet.has(team)) continue;
        const win = teamWinProb(g, team);
        if (win == null || win < 0.72) continue;
        const spread = teamSpread(g, team);
        survivorHammerPool.push({
          team,
          opponent: otherTeam(g, team),
          spread,
          rate: win,
          why: "",
        });
      }
    }
    survivorHammerPool.sort((a, b) => b.rate - a.rate);
    survivorHammerPool.splice(3);
    const rankWord = ["highest", "second-highest", "third-highest"] as const;
    survivorHammerPool.forEach((row, i) => {
      row.why = `Top leftover hammer — ${rankWord[i] ?? "high"} win rate still on your bench this week (${formatPct(row.rate)}${row.spread == null ? "" : ` · ${formatSpread(row.spread)}`} vs ${row.opponent}).`;
    });
  }
  const hammerTeams = new Set(survivorHammerPool.map((h) => h.team));

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
    let best: { team: string; score: number } | null = null;
    for (const team of pool) {
      const g = gameOf(live, team);
      if (!g) continue;
      const win = teamWinProb(g, team);
      if (win == null) continue;
      const uniqueGame = !takenGames.has(g.id);
      const score =
        kind === "survivor"
          ? scoreSurvivor(win, style, uniqueGame, true)
          : scoreLoser(1 - win, style, uniqueGame);
      if (!best || score > best.score) best = { team, score };
    }
    if (!best) break;
    const g = gameOf(live, best.team);
    if (!g) break;
    const win = teamWinProb(g, best.team) ?? 0.5;
    const spread = teamSpread(g, best.team);
    const opp = otherTeam(g, best.team);
    const home = isHome(g, best.team);
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
            )
          : whyLoser(best.team, opp, home, spread, 1 - win, style),
      backup,
      backupWhy,
      publicNote: publicNote(kind, kind === "survivor" ? win : 1 - win, best.team),
      late: late(g.startTime),
      playWhy:
        kind === "survivor"
          ? playWhySurvivor(week, best.team, opp, home, spread, win, style)
          : playWhyLoser(week, best.team, opp, home, spread, 1 - win, style),
    });
  }

  const leftover = NFL_ABBR.filter((t) => !usedSet.has(t) && !takenTeams.has(t));
  const hammers: PoolWatch[] = [];
  const traps: PoolWatch[] = [];
  if (kind === "survivor") {
    hammers.push(...survivorHammerPool.filter((h) => !takenTeams.has(h.team)));
    for (const g of live) {
      for (const team of [g.awayAbbr, g.homeAbbr]) {
        if (!team || usedSet.has(team) || takenTeams.has(team) || hammerTeams.has(team)) continue;
        const win = teamWinProb(g, team);
        if (win == null) continue;
        const spread = teamSpread(g, team);
        const skinny = spread != null && spread <= -2.5 && spread >= -3.5;
        const soft = win >= 0.52 && win <= 0.65;
        if (!skinny && !soft) continue;
        traps.push({
          team,
          opponent: otherTeam(g, team),
          spread,
          rate: win,
          why: skinny
            ? `${team} ${formatSpread(spread!)} is a skinny favorite. Looks safe, dies in pools. Sit it out.`
            : `${team} at ${formatPct(win)} is a soft spot, not a hammer. Don’t force it.`,
        });
      }
    }
    traps.sort((a, b) => a.rate - b.rate);
  } else {
    const dogs: PoolWatch[] = [];
    for (const team of leftover) {
      const g = gameOf(live, team);
      if (!g) continue;
      const win = teamWinProb(g, team);
      if (win == null) continue;
      const spread = teamSpread(g, team);
      const lose = 1 - win;
      const opp = otherTeam(g, team);
      if (lose >= 0.72) {
        dogs.push({
          team,
          opponent: opp,
          spread,
          rate: lose,
          why: `${team} is a true dog. If you have multiple tickets, do not put every entry here.`,
        });
      } else if (lose >= 0.52 && lose <= 0.6) {
        traps.push({
          team,
          opponent: opp,
          spread,
          rate: lose,
          why: `${team} is a skinny dog. Loser pools bleed out on these.`,
        });
      }
    }
    dogs.sort((a, b) => b.rate - a.rate);
    hammers.push(...dogs.slice(0, 3));
    traps.sort((a, b) => a.rate - b.rate);
  }

  const note =
    kind === "survivor"
      ? week <= 2
        ? `Week ${week}: early season. Don’t hoard every favorite — you need to cash tickets now. Ticket 1 chalk is allowed. True hammers are only the top leftover names still on the bench.`
        : n === 1
          ? "One ticket: take the safest win this week. True leftover hammers stay on the bench unless the board is ugly."
          : `${n} tickets: different teams every time. Ticket 1 is this week’s safest win. Later tickets stay unique. Only the top leftover hammers are saved.`
      : week <= 2
        ? `Week ${week}: take the most likely loss. Don’t get cute just because it’s early.`
        : n === 1
          ? "One ticket: pick the team most likely to lose. Do not get cute."
          : `${n} tickets: never double a team. Split games so one upset cannot wipe every entry.`;

  return { kind, entries: picks, leftover, hammers: hammers.slice(0, 3), traps: traps.slice(0, 5), note };
}

