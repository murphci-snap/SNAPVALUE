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
}

export interface PoolPlan {
  kind: PoolKind;
  entries: PoolPick[];
  leftover: string[];
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

function whySurvivor(team: string, opp: string, home: boolean, spread: number | null, win: number, style: EntryStyle): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  if (style === "chalk") {
    return `${team}${line} ${loc} vs ${opp} is the cleanest win rate this week (${formatPct(win)}). Ticket 1 is about surviving, not saving.`;
  }
  if (style === "contrarian") {
    return `${team}${line} is a playable favorite (${formatPct(win)}) that most pools will skip while they hammer bigger names. Unique tickets matter if you last.`;
  }
  if (win > 0.76) {
    return `${team}${line} ${loc} should win, but burning a hammer this early costs you later. Only use it if you need the floor.`;
  }
  return `${team}${line} ${loc} vs ${opp} is strong enough (${formatPct(win)}) without spending LAC/JAX-tier leftovers.`;
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

function publicNote(kind: PoolKind, winOrLose: number, team: string): string {
  if (kind === "survivor") {
    if (winOrLose >= 0.78) return `Street chalk — a huge share of survivor entries will be on ${team}.`;
    if (winOrLose >= 0.7) return `Popular but not consensus. Fine on a second ticket.`;
    return `Quieter than the hammers. Good for uniqueness if you trust the spot.`;
  }
  if (winOrLose >= 0.78) return `Public loser-pool chalk. Diversify other tickets off this game.`;
  return `Less crowded than the obvious dogs.`;
}

export function buildPoolPlan(
  kind: PoolKind,
  games: Game[],
  entryCount: number,
  used: string[],
): PoolPlan {
  const live = upcomingGames(games);
  const usedSet = new Set(used.filter((t) => NFL_ABBR.includes(t)));
  const n = Math.max(1, Math.min(10, Math.floor(entryCount) || 1));
  const picks: PoolPick[] = [];
  const takenTeams = new Set<string>();
  const takenGames = new Set<number>();

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
          ? whySurvivor(best.team, opp, home, spread, win, style)
          : whyLoser(best.team, opp, home, spread, 1 - win, style),
      backup,
      backupWhy,
      publicNote: publicNote(kind, kind === "survivor" ? win : 1 - win, best.team),
    });
  }

  const leftover = NFL_ABBR.filter((t) => !usedSet.has(t) && !takenTeams.has(t));
  const note =
    kind === "survivor"
      ? n === 1
        ? "One ticket: take the win you trust, but try not to spend a future hammer unless the spot is clean."
        : `${n} tickets: different teams every time. Ticket 1 is the floor. Later tickets trade a little win rate for uniqueness and leftover value.`
      : n === 1
        ? "One ticket: pick the team most likely to lose. Do not get cute."
        : `${n} tickets: never double a team. Split games so one upset cannot wipe every entry.`;

  return { kind, entries: picks, leftover, note };
}
