import type { TdParlay } from "./desk";
import { gamePhase } from "./markets";
import type { Game, Player } from "./types";
import type { StampedBet } from "./bet-stamp";

export type GradeResult = "win" | "loss" | "push" | "void";

function gameOfTeam(games: Game[], team: string): Game | undefined {
  return games.find((g) => g.homeAbbr === team || g.awayAbbr === team);
}

function gameFinal(g: Game): boolean {
  if (g.homeScore == null || g.awayScore == null) return gamePhase(g.startTime) === "final";
  return gamePhase(g.startTime) === "final";
}

function playerByName(players: Player[], name: string): Player | undefined {
  const n = name.trim().toLowerCase();
  return (
    players.find((p) => p.showdownRole !== "CPT" && p.name.toLowerCase() === n) ??
    players.find((p) => p.showdownRole !== "CPT" && p.name.toLowerCase().includes(n))
  );
}

function tds(p: Player): number {
  const b = p.actualBox;
  if (!b) return 0;
  return (b.rushTd ?? 0) + (b.recTd ?? 0);
}

export function gradeSpread(bet: { pick: string }, games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^([A-Z]{2,3})\s+([+-]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const team = m[1]!;
  const line = Number.parseFloat(m[2]!);
  const g = gameOfTeam(games, team);
  if (!g || !gameFinal(g) || g.homeScore == null || g.awayScore == null) return null;
  const margin = team === g.homeAbbr ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
  const cover = margin + line;
  if (Math.abs(cover) < 0.05) return "push";
  return cover > 0 ? "win" : "loss";
}

export function gradeTotal(bet: { pick: string; line?: string; id?: string }, games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^(over|under)\s+(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const side = m[1]!.toLowerCase();
  const line = Number.parseFloat(m[2]!);
  const g =
    games.find((x) => (bet.line ?? "").includes(x.awayAbbr) && (bet.line ?? "").includes(x.homeAbbr)) ??
    games.find((x) => (bet.id ?? "").includes(String(x.id)));
  if (!g || !gameFinal(g) || g.homeScore == null || g.awayScore == null) return null;
  const tot = g.homeScore + g.awayScore;
  if (Math.abs(tot - line) < 0.05) return "push";
  if (side === "over") return tot > line ? "win" : "loss";
  return tot < line ? "win" : "loss";
}

export function gradeMl(bet: { pick: string; title?: string }, games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^([A-Z]{2,3})\s+/);
  const team = m?.[1] ?? (bet.title ?? "").replace(/\s+ML.*/, "");
  const g = gameOfTeam(games, team);
  if (!g || !gameFinal(g) || g.homeScore == null || g.awayScore == null) return null;
  if (g.homeScore === g.awayScore) return "push";
  const won = team === g.homeAbbr ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
  return won ? "win" : "loss";
}

export function gradeProp(bet: { pick: string }, players: Player[], games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^(.*?)\s+([ou])(\d+(?:\.\d+)?)\s+(pass|rush|rec)\s+yds/i);
  if (!m) return null;
  const p = playerByName(players, m[1]!);
  if (!p) return null;
  const g = gameOfTeam(games, p.team);
  if (!g || !gameFinal(g)) return null;
  const box = p.actualBox;
  // Wait for box score — don't settle props as 0 yds when box missing
  if (!box) return null;
  const actual =
    m[4]!.toLowerCase() === "pass" ? box.passYds : m[4]!.toLowerCase() === "rush" ? box.rushYds : box.recYds;
  const line = Number.parseFloat(m[3]!);
  const over = m[2]!.toLowerCase() === "o";
  if (Math.abs(actual - line) < 0.05) return "push";
  return over ? (actual > line ? "win" : "loss") : actual < line ? "win" : "loss";
}

export function gradeParlayLegs(
  legs: Array<{ name: string; team?: string; kind?: "multi_td" | "atd" }>,
  players: Player[],
  games: Game[],
  twoPlus: boolean,
): GradeResult | null {
  const results: GradeResult[] = [];
  for (const leg of legs) {
    const p = playerByName(players, leg.name);
    if (!p) return null;
    const g = gameOfTeam(games, p.team);
    if (!g || !gameFinal(g)) return null;
    // TD legs need box data
    if (!p.actualBox) return null;
    const n = tds(p);
    const need = twoPlus && leg.kind !== "atd" ? 2 : 1;
    results.push(n >= need ? "win" : "loss");
  }
  if (results.some((r) => r === "loss")) return "loss";
  if (results.every((r) => r === "win")) return "win";
  return "push";
}

export function gradeParlay(parlay: TdParlay, players: Player[], games: Game[], twoPlus: boolean): GradeResult | null {
  return gradeParlayLegs(
    parlay.legs.map((l) => ({ name: l.name, team: l.team, kind: l.kind })),
    players,
    games,
    twoPlus,
  );
}

export function pnlOf(result: GradeResult, unit: number): number {
  if (result === "win") return unit;
  if (result === "loss") return -unit;
  return 0;
}

export function gradeNflStamped(s: StampedBet, games: Game[], players: Player[]): GradeResult | null {
  if (s.market === "spread") return gradeSpread(s, games);
  if (s.market === "total") return gradeTotal(s, games);
  if (s.market === "moneyline") return gradeMl(s, games);
  if (s.market === "prop") return gradeProp(s, players, games);
  if (s.market === "atd" || s.market === "atd3" || s.market === "lotto") {
    if (!s.legs?.length) return null;
    return gradeParlayLegs(s.legs, players, games, false);
  }
  if (s.market === "multi_td") {
    if (!s.legs?.length) return null;
    return gradeParlayLegs(s.legs, players, games, true);
  }
  return null;
}
