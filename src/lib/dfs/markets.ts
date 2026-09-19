import type { Game } from "./types";

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Home win probability from home spread (negative = home favorite). */
export function winProbHome(homeSpread: number): number {
  return clamp(1 / (1 + Math.exp(homeSpread / 5.4)), 0.08, 0.92);
}

export function teamWinProb(game: Game, abbr: string): number | null {
  if (game.spread == null || !Number.isFinite(game.spread)) return null;
  let homeP = winProbHome(game.spread);
  const hi = game.homeImplied;
  const ai = game.awayImplied;
  if (hi != null && ai != null && hi + ai >= 20) {
    const implied = clamp(hi / (hi + ai), 0.08, 0.92);
    homeP = 0.68 * homeP + 0.32 * implied;
  }
  homeP = clamp(homeP + 0.014, 0.08, 0.92);
  if (abbr === game.homeAbbr) return homeP;
  if (abbr === game.awayAbbr) return 1 - homeP;
  return null;
}

/** Estimated survivor/loser pool share from a chalk curve — not raw win%.
 *  `steep` > 1 concentrates share on chalk (large pools); < 1 softens it. */
export function poolPickPct(
  rate: number,
  kind: "survivor" | "loser" = "survivor",
  steep = 1,
): number {
  const center = kind === "survivor" ? 0.72 : 0.7;
  const k = 16 * Math.max(0.5, Math.min(2, steep));
  const raw = 1 / (1 + Math.exp(-(rate - center) * k));
  return clamp(raw * (kind === "survivor" ? 0.5 : 0.46), 0.02, 0.52);
}

export function formatSpread(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export function formatAmerican(american: number): string {
  if (!Number.isFinite(american)) return "—";
  const n = Math.round(american);
  return n > 0 ? `+${n}` : String(n);
}

export function probToAmerican(p: number): number {
  const x = clamp(p, 0.05, 0.95);
  if (x >= 0.5) return Math.round((-100 * x) / (1 - x));
  return Math.round((100 * (1 - x)) / x);
}

export function parlayProb(legs: number[]): number {
  return legs.reduce((acc, p) => acc * clamp(p, 0.02, 0.98), 1);
}

export function kickoffMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function gamePhase(startTime: string, now = Date.now()): "pre" | "live" | "final" {
  const t = kickoffMs(startTime);
  if (t === 0) return "pre";
  if (now < t + 8 * 60 * 1000) return "pre";
  if (now < t + 3.75 * 3600 * 1000) return "live";
  return "final";
}

export function isUpcoming(game: Game, now = Date.now()): boolean {
  return gamePhase(game.startTime, now) === "pre";
}

export function otherTeam(game: Game, abbr: string): string {
  return abbr === game.homeAbbr ? game.awayAbbr : game.homeAbbr;
}

export function isHome(game: Game, abbr: string): boolean {
  return game.homeAbbr === abbr;
}

export function teamSpread(game: Game, abbr: string): number | null {
  if (game.spread == null) return null;
  return abbr === game.homeAbbr ? game.spread : -game.spread;
}
