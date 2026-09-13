import type { Player, Position } from "./types";

const CHEAP: Position[] = ["QB", "RB", "WR", "TE"];
const SOFT: Record<Position, number> = { QB: 5500, RB: 5200, WR: 5200, TE: 5000, DST: 3000 };
const TAKE = 3;

function available(p: Player): boolean {
  if (p.salary <= 0) return false;
  if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) return false;
  if (/^(out|ir|doubtful|suspended)/i.test(p.status)) return false;
  return true;
}

function percentileCutoff(salaries: number[], p = 0.42): number {
  if (!salaries.length) return SOFT.RB;
  const s = [...salaries].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)));
  return s[i] ?? s[s.length - 1]!;
}

function poolFor(players: Player[], pos: Position): Player[] {
  const eligible = players.filter((p) => p.position === pos && available(p));
  if (!eligible.length) return [];
  const cap = Math.max(SOFT[pos] ?? 5000, percentileCutoff(eligible.map((p) => p.salary)));
  let pool = eligible.filter((p) => p.salary <= cap);
  const floor = pos === "TE" ? 4 : pos === "QB" ? 8 : 5;
  const withPts = pool.filter((p) => p.projection >= floor);
  if (withPts.length >= TAKE) pool = withPts;
  if (pool.length >= TAKE) return pool;
  const byPay = [...eligible].sort((a, b) => a.salary - b.salary || b.value - a.value);
  return byPay.slice(0, Math.max(TAKE, Math.min(12, byPay.length)));
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
    const ranked = [...pool].sort((a, b) => b.value - a.value || a.salary - b.salary || b.projection - a.projection);
    for (const p of ranked.slice(0, TAKE)) {
      p.cheapImpact = true;
      p.cheapImpactWhy = why(p);
    }
  }
}

export const CHEAP_IMPACT_POS: Position[] = ["QB", "RB", "WR", "TE"];
export const BARGAIN_TAKE = TAKE;
