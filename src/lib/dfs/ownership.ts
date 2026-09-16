import { POSITIONS } from "./constants";
import { isSidelined, round1 } from "./scoring";
import type { Player, Position } from "./types";

const SLOT: Record<Position, number> = { QB: 100, RB: 248, WR: 338, TE: 118, DST: 100, K: 100 };
const CAP: Record<Position, number> = { QB: 36, RB: 42, WR: 34, TE: 32, DST: 28, K: 30 };

export function markOwnership(players: Player[]) {
  const pool = players.filter((p) => p.showdownRole !== "CPT");
  for (const p of players) {
    p.ownership = null;
    p.ownershipSource = null;
  }
  for (const pos of [...POSITIONS, "K"] as Position[]) {
    const group = pool.filter((p) => p.position === pos && p.salary > 0);
    if (!group.length) continue;
    const raw = group.map((p) => {
      if (isSidelined(p.injury, p.status) || p.projection <= 0) return 0.02;
      let s = Math.pow(Math.max(1.2, p.projection), 1.48) * Math.pow(Math.max(2.5, p.salary / 1000), 0.32);
      if (p.isValuePlay) s *= 1.08;
      if (p.salary >= 8000) s *= 1.1;
      if (p.cheapImpact) s *= 0.92;
      return s;
    });
    const mx = Math.max(...raw, 1);
    const exps = raw.map((s) => Math.exp((s / mx) * 2.05));
    const tot = exps.reduce((a, b) => a + b, 0) || 1;
    const target = SLOT[pos] ?? 100;
    const cap = CAP[pos] ?? 32;
    group.forEach((p, i) => {
      p.ownership = round1(Math.min(cap, Math.max(0.2, (exps[i]! / tot) * target)));
      p.ownershipSource = "model";
    });
  }
  for (const p of players) {
    if (p.showdownRole !== "CPT") continue;
    const flex = pool.find((x) => x.dkId === p.dkId && x.showdownRole === "FLEX");
    if (flex?.ownership != null) {
      p.ownership = flex.ownership;
      p.ownershipSource = flex.ownershipSource;
    }
  }
}