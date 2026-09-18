import { americanToProb } from "@/lib/dfs/scoring";
import type { UfcFighter, UfcFight, UfcMethod } from "./types";

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function removeVigPair(a: number, b: number): { pa: number; pb: number } {
  const qa = americanToProb(a);
  const qb = americanToProb(b);
  const s = qa + qb;
  if (s <= 0) return { pa: 0.5, pb: 0.5 };
  return { pa: qa / s, pb: qb / s };
}

export function removeVigN(odds: number[]): number[] {
  const q = odds.map((o) => americanToProb(o));
  const s = q.reduce((a, b) => a + b, 0);
  if (s <= 0) return odds.map(() => 1 / Math.max(1, odds.length));
  return q.map((x) => x / s);
}

export function lastNameOf(name: string): string {
  const cleaned = name.replace(/\./g, " ").replace(/'/g, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || name;
}

export function parseRecord(raw: string | undefined): { wins: number; losses: number; draws: number } {
  const m = (raw ?? "").match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return { wins: 0, losses: 0, draws: 0 };
  return { wins: Number(m[1]), losses: Number(m[2]), draws: Number(m[3] ?? 0) };
}

/** DK MMA expected points from win/method probs. Win is the points; KO/sub smash. */
export function expectedDk(opts: {
  winProb: number;
  pKo: number;
  pSub: number;
  pDec: number;
  rounds: 3 | 5;
  slpm?: number;
}): { projection: number; floor: number; ceiling: number } {
  const win = clamp(opts.winProb, 0.04, 0.96);
  const ko = clamp(opts.pKo, 0, win);
  const sub = clamp(opts.pSub, 0, Math.max(0, win - ko));
  const dec = clamp(opts.pDec, 0, Math.max(0, win - ko - sub));
  const finish = ko + sub;
  const r1 = finish * 0.42;
  const r2 = finish * 0.32;
  const later = Math.max(0, finish - r1 - r2);
  const finishBonus = r1 * 90 + r2 * 70 + later * 45 + dec * 30;
  const minutes = opts.rounds === 5 ? 18 : 11;
  const liveMin = (1 - finish) * minutes + finish * 6.5;
  const slpm = opts.slpm ?? 3.8;
  const volume = liveMin * slpm * 0.42 + (opts.rounds === 5 ? 8 : 4);
  const projection = finishBonus + volume * win + 4;
  const floor = win * 38 + dec * 22 + volume * 0.35;
  const ceiling = ko * 125 + sub * 118 + dec * 55 + volume * 0.9 + 10;
  return { projection: round1(projection), floor: round1(floor), ceiling: round1(ceiling) };
}

export function cashScore(p: UfcFighter): number {
  return p.floor * 1.15 + p.winProb * 40 + (p.pDec > 0.22 && p.rounds === 5 ? 8 : 0);
}

export function gppScore(p: UfcFighter): number {
  return p.ceiling * 0.9 + (p.pKo + p.pSub) * 70 + (p.winProb < 0.42 ? 12 : 0);
}

export function isCashPlay(p: UfcFighter): boolean {
  return p.winProb >= 0.58 && p.floor >= 28;
}

export function isGppPlay(p: UfcFighter): boolean {
  return p.pKo + p.pSub >= 0.22 || (p.winProb <= 0.45 && p.ceiling >= 70);
}

export function methodLabel(m: UfcMethod): string {
  if (m === "ko") return "KO/TKO";
  if (m === "sub") return "Submission";
  return "Decision";
}

export function fightOf(fights: UfcFight[], id: string): UfcFight | undefined {
  return fights.find((f) => f.id === id);
}
