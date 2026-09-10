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
  const homeP = winProbHome(game.spread);
  if (abbr === game.homeAbbr) return homeP;
  if (abbr === game.awayAbbr) return 1 - homeP;
  return null;
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

export function isUpcoming(game: Game, now = Date.now()): boolean {
  const t = kickoffMs(game.startTime);
  return t === 0 || t > now - 15 * 60 * 1000;
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
