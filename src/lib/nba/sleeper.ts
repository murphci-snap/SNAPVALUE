import { isSidelined } from "./scoring";
import type { NbaPlayer, NbaPos } from "./types";

const CHEAP: NbaPos[] = ["PG", "SG", "SF", "PF", "C"];
const CAP: Record<NbaPos, number> = { PG: 5500, SG: 5200, SF: 5200, PF: 5400, C: 5800 };

export function markNbaBargain(players: NbaPlayer[]) {
  for (const p of players) {
    p.cheapImpact = false;
    p.cheapImpactWhy = null;
  }
  for (const pos of CHEAP) {
    const pool = players.filter(
      (p) => p.position === pos && p.salary > 0 && p.salary <= CAP[pos] && !isSidelined(p.injury, p.status) && p.projection >= 18,
    );
    const ranked = (pool.length ? pool : players.filter((p) => p.position === pos && p.salary > 0 && !isSidelined(p.injury, p.status)))
      .map((p) => ({ p, s: p.value + (CAP[pos] - p.salary) / 8000 }))
      .sort((a, b) => b.s - a.s || a.p.salary - b.p.salary);
    const pick = ranked[0]?.p;
    if (!pick) continue;
    pick.cheapImpact = true;
    pick.cheapImpactWhy =
      pos === "C" || pos === "PF"
        ? `${pick.value.toFixed(2)} pts/$1k · cheap big`
        : `${pick.value.toFixed(2)} pts/$1k · cheap skill`;
  }
}

export const NBA_BARGAIN_POS: NbaPos[] = CHEAP;
