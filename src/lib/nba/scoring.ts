import type { MatchupQuality } from "@/lib/dfs/types";
import { isSidelined as nflSidelined } from "@/lib/dfs/scoring";
import type { NbaBox, NbaPlayer } from "./types";

export function isSidelined(injury: string | null, status: string): boolean {
  return nflSidelined(injury, status);
}

export function dkFromBox(b: NbaBox): number {
  const gp = Math.max(1, b.gp || 1);
  const pts = b.pts / (b.gp ? gp : 1);
  const threes = b.threes / (b.gp ? gp : 1);
  const reb = b.reb / (b.gp ? gp : 1);
  const ast = b.ast / (b.gp ? gp : 1);
  const stl = b.stl / (b.gp ? gp : 1);
  const blk = b.blk / (b.gp ? gp : 1);
  const to = b.to / (b.gp ? gp : 1);
  const dd = b.dd / (b.gp ? gp : 1);
  const td = b.td / (b.gp ? gp : 1);
  return pts * 1 + threes * 0.5 + reb * 1.25 + ast * 1.5 + stl * 2 + blk * 2 + to * -0.5 + dd * 1.5 + td * 3;
}

export function dkFromPerGame(b: NbaBox): number {
  return b.pts * 1 + b.threes * 0.5 + b.reb * 1.25 + b.ast * 1.5 + b.stl * 2 + b.blk * 2 + b.to * -0.5 + b.dd * 1.5 + b.td * 3;
}

export function matchupMul(rank: number): number {
  if (rank >= 24) return 1.08;
  if (rank >= 20) return 1.04;
  if (rank <= 6) return 0.9;
  if (rank <= 10) return 0.94;
  return 1;
}

export function matchupQuality(rank: number): MatchupQuality {
  if (rank >= 24) return "High";
  if (rank <= 8) return "Low";
  if (rank >= 16) return "Medium";
  return "Unknown";
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isCashPlay(p: NbaPlayer): boolean {
  if (isSidelined(p.injury, p.status)) return false;
  return p.projection >= 28 || (p.salary >= 7000 && p.projection >= 32);
}

export function isGppPlay(p: NbaPlayer): boolean {
  if (isSidelined(p.injury, p.status)) return false;
  if (p.itFactor) return true;
  if (p.value >= 5.2 && p.salary <= 8500) return true;
  return p.projection >= 36;
}

export function cashScore(p: NbaPlayer): number {
  return p.projection * (p.salary >= 6500 ? 1.08 : 1) - (p.injury ? 4 : 0);
}

export function gppScore(p: NbaPlayer): number {
  const mid = p.salary >= 5000 && p.salary <= 8500 ? 1.16 : p.salary >= 10000 ? 0.88 : 1;
  return (p.value * 8 + p.projection) * mid * (p.itFactor ? 1.12 : 1);
}
