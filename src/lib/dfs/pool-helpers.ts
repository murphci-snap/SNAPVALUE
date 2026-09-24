import { NFL_ABBR } from "./constants";
import {
  formatPct,
  formatSpread,
  isHome,
  isUpcoming,
  otherTeam,
  poolPickPct,
  teamSpread,
  teamWinProb,
  winProbHome,
} from "./markets";
import type { Game } from "./types";

export type PoolKind = "survivor" | "loser";
export type EntryStyle = "chalk" | "value" | "ladder" | "contrarian";
export type { PoolSize } from "./pool-size";
export { poolSizeSteep, poolSizeMods } from "./pool-size";
import { poolSizeSteep, poolSizeMods, type PoolSize } from "./pool-size";

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
  publicPct: number;
  late: boolean;
  playWhy: string;
}

export interface PoolWatch {
  team: string;
  opponent: string;
  spread: number | null;
  rate: number;
  why: string;
  publicPct?: number;
}

export interface PoolPlan {
  kind: PoolKind;
  entries: PoolPick[];
  leftover: string[];
  hammers: PoolWatch[];
  traps: PoolWatch[];
  note: string;
}

export interface FutureSpot {
  week: number;
  team: string;
  opponent: string;
  home: boolean;
}

const ESPN_ABBR: Record<string, string> = { WSH: "WAS", JAC: "JAX", ARZ: "ARI" };

function mapAbbr(raw: string): string {
  const u = raw.toUpperCase();
  return ESPN_ABBR[u] ?? u;
}

export async function loadRemainingSchedule(season: number, fromWeek: number): Promise<FutureSpot[]> {
  const end = 18;
  const weeks: number[] = [];
  for (let w = fromWeek + 1; w <= end; w++) weeks.push(w);
  const spots: FutureSpot[] = [];
  const settled = await Promise.allSettled(
    weeks.map(async (week) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?lang=en&region=us&calendartype=blacklist&limit=100&seasontype=2&dates=${season}&week=${week}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [] as FutureSpot[];
      const json = (await res.json()) as {
        events?: Array<{
          competitions?: Array<{
            competitors?: Array<{ homeAway?: string; team?: { abbreviation?: string } }>;
          }>;
        }>;
      };
      const out: FutureSpot[] = [];
      for (const ev of json.events ?? []) {
        const comps = ev.competitions?.[0]?.competitors ?? [];
        const home = comps.find((c) => c.homeAway === "home")?.team?.abbreviation;
        const away = comps.find((c) => c.homeAway === "away")?.team?.abbreviation;
        if (!home || !away) continue;
        const h = mapAbbr(home);
        const a = mapAbbr(away);
        out.push({ week, team: h, opponent: a, home: true });
        out.push({ week, team: a, opponent: h, home: false });
      }
      return out;
    }),
  );
  for (const row of settled) {
    if (row.status === "fulfilled") spots.push(...row.value);
  }
  return spots;
}

export function styleFor(i: number, n: number): EntryStyle {
  if (n === 1) return "value";
  if (i === 0) return "chalk";
  if (i === n - 1 && n >= 3) return "contrarian";
  const mid: EntryStyle[] = ["value", "ladder", "value"];
  return mid[(i - 1) % mid.length] ?? "ladder";
}

export function gameOf(games: Game[], abbr: string): Game | undefined {
  return games.find((g) => g.homeAbbr === abbr || g.awayAbbr === abbr);
}

export function upcomingGames(games: Game[]): Game[] {
  return games.filter((g) => isUpcoming(g) && g.spread != null);
}

export function skinnyFav(spread: number | null): boolean {
  return spread != null && spread <= -2.5 && spread >= -3.5;
}

export function skinnyDog(spread: number | null): boolean {
  return spread != null && spread >= 2.5 && spread <= 3.5;
}

export function teamRating(games: Game[]): Map<string, number> {
  const r = new Map<string, number>();
  for (const g of games) {
    if (g.spread == null) continue;
    r.set(g.homeAbbr, -(g.spread) + 1.6);
    r.set(g.awayAbbr, g.spread - 1.6);
  }
  return r;
}

export function futureWin(team: string, spot: FutureSpot, ratings: Map<string, number>): number {
  const us = ratings.get(team) ?? 0;
  const them = ratings.get(spot.opponent) ?? 0;
  const hfa = spot.home ? 2.2 : -2.2;
  const spread = them - us - hfa;
  return winProbHome(spread);
}

export function scoreSurvivor(
  win: number,
  style: EntryStyle,
  uniqueGame: boolean,
  uniqueSide: boolean,
  opts: {
    hammer: boolean;
    week: number;
    skinny: boolean;
    pickPct: number;
    mods: ReturnType<typeof poolSizeMods>;
  },
): number {
  const m = opts.mods;
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
  if (uniqueGame) s += 0.035 * m.uniqueBonus;
  if (uniqueSide) s += 0.02 * m.uniqueBonus;
  if (opts.skinny && style === "chalk") s -= 0.24;
  if (opts.hammer && style !== "chalk") s -= (opts.week <= 2 ? 0.035 : 0.14) * m.hammerReserve;
  if (opts.hammer && style === "chalk" && opts.week > 2 && win < 0.84) s -= 0.06 * m.hammerReserve;
  if (style !== "chalk") s -= Math.max(0, opts.pickPct - 0.2) * 0.18 * m.publicPenalty;
  else s += Math.min(0.04, opts.pickPct * 0.08) * m.chalkBoost;
  return s;
}

export function scoreLoser(
  lose: number,
  style: EntryStyle,
  uniqueGame: boolean,
  opts: {
    skinny: boolean;
    chalkTicket: boolean;
    pickPct: number;
    mods: ReturnType<typeof poolSizeMods>;
  },
): number {
  const m = opts.mods;
  let s = lose;
  if (style === "chalk") s = lose;
  if (style === "value") s = lose - (lose > 0.78 ? 0.08 : 0);
  if (style === "ladder") s = lose;
  if (style === "contrarian") {
    const sweet = 1 - Math.abs(lose - 0.62) * 2;
    s = sweet * 0.5 + lose * 0.5;
  }
  if (uniqueGame) s += 0.04 * m.uniqueBonus;
  if (opts.chalkTicket && opts.skinny) s -= 0.22;
  if (style !== "chalk") s -= Math.max(0, opts.pickPct - 0.22) * 0.12 * m.publicPenalty;
  else s += Math.min(0.03, opts.pickPct * 0.06) * m.chalkBoost;
  return s;
}

export function whySurvivor(
  team: string,
  opp: string,
  home: boolean,
  spread: number | null,
  win: number,
  style: EntryStyle,
  isHammer: boolean,
  pickPct: number,
): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  const own = `est. ${formatPct(pickPct)} of pools`;
  if (style === "chalk") {
    return `${team}${line} ${loc} vs ${opp} is the cleanest win rate this week (${formatPct(win)}, ${own}). Ticket 1 is about surviving, not saving.`;
  }
  if (style === "contrarian") {
    return `${team}${line} is a playable favorite (${formatPct(win)}) that most pools will skip (${own}). Unique tickets matter if you last.`;
  }
  if (isHammer) {
    return `${team}${line} ${loc} vs ${opp} is a leftover hammer (${formatPct(win)}). You're spending bench equity — only if this ticket needs the floor.`;
  }
  return `${team}${line} ${loc} vs ${opp} is a real favorite this week (${formatPct(win)}, ${own}) without sitting in the saved-hammer set.`;
}

export function whyLoser(team: string, opp: string, home: boolean, spread: number | null, lose: number, style: EntryStyle, pickPct: number): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  const own = `est. ${formatPct(pickPct)} of loser pools`;
  if (style === "chalk") {
    return `${team}${line} ${loc} vs ${opp} is the most likely loss (${formatPct(lose)}, ${own}). This is the ticket you need to cash.`;
  }
  if (style === "contrarian") {
    return `${team}${line} is a softer dog (${formatPct(lose)} lose, ${own}). If the chalk dog sneaks a win, this ticket is still alive.`;
  }
  return `${team}${line} ${loc} against ${opp} profiles as a loss without doubling the same game as ticket 1.`;
}

export function playWhySurvivor(
  week: number,
  team: string,
  opp: string,
  home: boolean,
  spread: number | null,
  win: number,
  style: EntryStyle,
  late: boolean,
): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  const wk = `Week ${week}`;
  const lateBit = late ? " Late kickoff — hold as a pivot if an early ticket dies." : "";
  if (style === "chalk") {
    return `${wk}: ${team}${line} ${loc} vs ${opp}. Win rate ${formatPct(win)}. Cash this ticket now.${lateBit}`;
  }
  if (style === "contrarian") {
    return `${wk}: ${team}${line} vs ${opp} at ${formatPct(win)} — quieter than the pile-on chalk. Play it for uniqueness.${lateBit}`;
  }
  return `${wk}: ${team}${line} ${loc} vs ${opp}. ${formatPct(win)} to win on this spread. Play it this week.${lateBit}`;
}

export function playWhyLoser(
  week: number,
  team: string,
  opp: string,
  home: boolean,
  spread: number | null,
  lose: number,
  style: EntryStyle,
  late: boolean,
): string {
  const loc = home ? "at home" : "on the road";
  const line = spread == null ? "" : ` ${formatSpread(spread)}`;
  const wk = `Week ${week}`;
  const lateBit = late ? " Late kickoff — hold as a pivot if an early dog covers." : "";
  if (style === "chalk") {
    return `${wk}: ${team}${line} ${loc} vs ${opp}. ${formatPct(lose)} to lose. This is the ticket that has to cash.${lateBit}`;
  }
  if (style === "contrarian") {
    return `${wk}: ${team}${line} at ${formatPct(lose)} to lose — softer dog, different game from ticket 1.${lateBit}`;
  }
  return `${wk}: ${team}${line} ${loc} against ${opp}. ${formatPct(lose)} to lose. Split it off the chalk dog.${lateBit}`;
}

export function publicNote(kind: PoolKind, pickPct: number, team: string): string {
  if (kind === "survivor") {
    if (pickPct >= 0.28) return `Public chalk — est. ${formatPct(pickPct)} of survivor entries on ${team}.`;
    if (pickPct >= 0.16) return `Popular but not consensus (est. ${formatPct(pickPct)}). Fine on a second ticket.`;
    return `Quiet (est. ${formatPct(pickPct)}). Good uniqueness if you trust the spot.`;
  }
  if (pickPct >= 0.28) return `Public loser-pool chalk (est. ${formatPct(pickPct)}). Diversify other tickets.`;
  return `Less crowded (est. ${formatPct(pickPct)}).`;
}
