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

function styleFor(i: number, n: number): EntryStyle {
  if (n === 1) return "value";
  if (i === 0) return "chalk";
  if (i === n - 1 && n >= 3) return "contrarian";
  const mid: EntryStyle[] = ["value", "ladder", "value"];
  return mid[(i - 1) % mid.length] ?? "ladder";
}

function gameOf(games: Game[], abbr: string): Game | undefined {
  return games.find((g) => g.homeAbbr === abbr || g.awayAbbr === abbr);
}

function upcomingGames(games: Game[]): Game[] {
  return games.filter((g) => isUpcoming(g) && g.spread != null);
}

function skinnyFav(spread: number | null): boolean {
  return spread != null && spread <= -2.5 && spread >= -3.5;
}

function skinnyDog(spread: number | null): boolean {
  return spread != null && spread >= 2.5 && spread <= 3.5;
}

function teamRating(games: Game[]): Map<string, number> {
  const r = new Map<string, number>();
  for (const g of games) {
    if (g.spread == null) continue;
    r.set(g.homeAbbr, -(g.spread) + 1.6);
    r.set(g.awayAbbr, g.spread - 1.6);
  }
  return r;
}

function futureWin(team: string, spot: FutureSpot, ratings: Map<string, number>): number {
  const us = ratings.get(team) ?? 0;
  const them = ratings.get(spot.opponent) ?? 0;
  const hfa = spot.home ? 2.2 : -2.2;
  const spread = them - us - hfa;
  return winProbHome(spread);
}

function scoreSurvivor(
  win: number,
  style: EntryStyle,
  uniqueGame: boolean,
  uniqueSide: boolean,
  opts: { hammer: boolean; week: number; skinny: boolean; pickPct: number },
): number {
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
  if (uniqueSide) s += 0.02;
  if (opts.skinny && style === "chalk") s -= 0.24;
  if (opts.hammer && style !== "chalk") s -= opts.week <= 2 ? 0.035 : 0.14;
  if (opts.hammer && style === "chalk" && opts.week > 2 && win < 0.84) s -= 0.06;
  if (style !== "chalk") s -= Math.max(0, opts.pickPct - 0.2) * 0.18;
  else s += Math.min(0.04, opts.pickPct * 0.08);
  return s;
}

function scoreLoser(
  lose: number,
  style: EntryStyle,
  uniqueGame: boolean,
  opts: { skinny: boolean; chalkTicket: boolean; pickPct: number },
): number {
  let s = lose;
  if (style === "chalk") s = lose;
  if (style === "value") s = lose - (lose > 0.78 ? 0.08 : 0);
  if (style === "ladder") s = lose;
  if (style === "contrarian") {
    const sweet = 1 - Math.abs(lose - 0.62) * 2;
    s = sweet * 0.5 + lose * 0.5;
  }
  if (uniqueGame) s += 0.04;
  if (opts.chalkTicket && opts.skinny) s -= 0.22;
  if (style !== "chalk") s -= Math.max(0, opts.pickPct - 0.22) * 0.12;
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
    return `${team}${line} ${loc} vs ${opp} is a leftover hammer (${formatPct(win)}). You’re spending bench equity — only if this ticket needs the floor.`;
  }
  return `${team}${line} ${loc} vs ${opp} is a real favorite this week (${formatPct(win)}, ${own}) without sitting in the saved-hammer set.`;
}

function whyLoser(team: string, opp: string, home: boolean, spread: number | null, lose: number, style: EntryStyle, pickPct: number): string {
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

function playWhySurvivor(
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

function playWhyLoser(
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

function publicNote(kind: PoolKind, pickPct: number, team: string): string {
  if (kind === "survivor") {
    if (pickPct >= 0.28) return `Public chalk — est. ${formatPct(pickPct)} of survivor entries on ${team}.`;
    if (pickPct >= 0.16) return `Popular but not consensus (est. ${formatPct(pickPct)}). Fine on a second ticket.`;
    return `Quiet (est. ${formatPct(pickPct)}). Good uniqueness if you trust the spot.`;
  }
  if (pickPct >= 0.28) return `Public loser-pool chalk (est. ${formatPct(pickPct)}). Diversify other tickets.`;
  return `Less crowded (est. ${formatPct(pickPct)}).`;
}

function buildHammers(
  kind: PoolKind,
  live: Game[],
  usedSet: Set<string>,
  future: FutureSpot[],
  week: number,
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
          publicPct: poolPickPct(best, "survivor"),
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
        publicPct: poolPickPct(win, "survivor"),
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
        publicPct: poolPickPct(lose, "loser"),
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

  const hammerPool = buildHammers(kind, live, usedSet, future, week);
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
      const pickPct = poolPickPct(kind === "survivor" ? win : 1 - win, kind);
      const uniqueSide = pickPct < 0.16;
      const score =
        kind === "survivor"
          ? scoreSurvivor(win, style, uniqueGame, uniqueSide, {
              hammer: hammerTeams.has(team),
              week,
              skinny: skinnyFav(spread),
              pickPct,
            })
          : scoreLoser(1 - win, style, uniqueGame, {
              skinny: skinnyDog(spread),
              chalkTicket,
              pickPct,
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
    const pickPct = poolPickPct(kind === "survivor" ? win : 1 - win, kind);
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
          publicPct: poolPickPct(win, "survivor"),
          why: skinny
            ? `${team} ${formatSpread(spread!)} is a skinny favorite. Looks safe, dies in pools. Sit it out.`
            : `${team} at ${formatPct(win)} is a soft spot, not a hammer. Don’t force it.`,
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
          publicPct: poolPickPct(lose, "loser"),
          why: `${team} is a skinny dog. Loser pools bleed out on these.`,
        });
      }
    }
    traps.sort((a, b) => a.rate - b.rate);
  }

  const note =
    kind === "survivor"
      ? week <= 2
        ? `Week ${week}: early season. Cash Ticket 1. Hammers are leftover-schedule locks, not every 75% favorite. Skinny 3-point favorites are traps.`
        : n === 1
          ? "One ticket: take the safest win this week. Saved hammers stay on the bench unless the board is ugly."
          : `${n} tickets: different teams every time. Ticket 1 is this week’s safest win. Later tickets stay unique. Don’t spend leftover-schedule hammers unless you have to.`
      : week <= 2
        ? `Week ${week}: take the most likely loss. Skip skinny dogs on Ticket 1.`
        : n === 1
          ? "One ticket: pick the team most likely to lose. Do not get cute."
          : `${n} tickets: never double a team. Split games so one upset cannot wipe every entry.`;

  return { kind, entries: picks, leftover, hammers, traps: traps.slice(0, 5), note };
}
