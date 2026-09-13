import type { Player, Position } from "./types";

const CHEAP: Position[] = ["QB", "RB", "WR", "TE"];
const SOFT: Record<Position, number> = { QB: 5500, RB: 5000, WR: 5000, TE: 5000, DST: 3000 };
const TYPICAL: Record<Position, number> = { QB: 2.35, RB: 2.05, WR: 2.05, TE: 2.0, DST: 1.6 };
const TAKE = 1;

function available(p: Player): boolean {
  if (p.salary <= 0) return false;
  if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) return false;
  if (/^(out|ir|doubtful|suspended)/i.test(p.status)) return false;
  return true;
}

function poolFor(players: Player[], pos: Position): Player[] {
  const eligible = players.filter((p) => p.position === pos && available(p));
  if (!eligible.length) return [];
  const cap = SOFT[pos] ?? 5000;
  const under = eligible.filter((p) => p.salary <= cap);
  const floor = pos === "TE" ? 4 : pos === "QB" ? 8 : 5;
  const pool = (under.length ? under : eligible).filter((p) => p.projection >= floor);
  if (pool.length) return pool;
  return [...eligible].sort((a, b) => a.salary - b.salary || b.value - a.value).slice(0, 8);
}

/** Pts above salary-tier expectation. Does not add ATD / prop yards / raw `value`. */
function cheapScore(p: Player): number {
  const cap = SOFT[p.position] ?? 5000;
  const k = Math.max(2.5, p.salary / 1000);
  const residual = p.projection - k * (TYPICAL[p.position] ?? 2.05);
  const salaryNudge = (cap - p.salary) / 5000;
  return residual + salaryNudge;
}

function why(p: Player): string {
  return `${p.value.toFixed(2)} pts/$1k · $${(p.salary / 1000).toFixed(1)}k · FLEX / last skill slot`;
}

export function markCheapImpact(players: Player[]) {
  for (const p of players) {
    p.cheapImpact = false;
    p.cheapImpactWhy = null;
  }
  for (const pos of CHEAP) {
    const pool = poolFor(players, pos);
    if (!pool.length) continue;
    const ranked = pool
      .map((p) => ({ p, s: cheapScore(p) }))
      .sort((a, b) => b.s - a.s || a.p.salary - b.p.salary);
    const pick = ranked[0];
    if (!pick) continue;
    pick.p.cheapImpact = true;
    pick.p.cheapImpactWhy = why(pick.p);
  }
}

export const CHEAP_IMPACT_POS: Position[] = ["QB", "RB", "WR", "TE"];
export const BARGAIN_TAKE = TAKE;
