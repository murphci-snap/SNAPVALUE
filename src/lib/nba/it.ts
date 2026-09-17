import { ordinal } from "@/lib/utils";
import { isSidelined } from "./scoring";
import type { Game } from "@/lib/dfs/types";
import type { NbaLens, NbaPlayer, NbaPos } from "./types";

function implied(p: NbaPlayer, games: Game[]): number | null {
  const g = games.find((x) => x.homeAbbr === p.team || x.awayAbbr === p.team);
  if (!g) return null;
  return p.home ? g.homeImplied : g.awayImplied;
}

function smash(p: NbaPlayer, games: Game[], lens: NbaLens): number {
  if (isSidelined(p.injury, p.status)) return -99;
  let s = 0;
  const imp = implied(p, games);
  if (imp != null && imp >= 118) s += 1.6;
  else if (imp != null && imp >= 112) s += 0.8;
  const g = games.find((x) => x.homeAbbr === p.team || x.awayAbbr === p.team);
  if (g?.total != null && g.total >= 232) s += 1.1;
  else if (g?.total != null && g.total >= 224) s += 0.5;
  if (p.oppRank >= 24) s += 1.4;
  else if (p.oppRank >= 20) s += 0.7;
  else if (p.oppRank <= 8) s -= 1.2;
  if (p.salary >= 5000 && p.salary <= 8500) s += 0.7;
  if (p.value >= 5.4) s += 0.6;
  if (lens === "gpp") {
    if (p.salary >= 10000) s -= 1.1;
    if (p.ownership != null && p.ownership <= 12) s += 0.8;
  }
  if (lens === "cash") s += p.projection / 40;
  return s;
}

export function markNbaIt(players: NbaPlayer[], games: Game[], lens: NbaLens = "all") {
  for (const p of players) {
    p.itFactor = false;
    p.itFactorWhy = null;
  }
  const posList: NbaPos[] = ["PG", "SG", "SF", "PF", "C"];
  for (const pos of posList) {
    const pool = players.filter((p) => p.position === pos && !isSidelined(p.injury, p.status));
    const scored = pool
      .map((p) => ({ p, s: smash(p, games, lens) }))
      .sort((a, b) => b.s - a.s);
    const med = scored.length ? scored[Math.floor(scored.length / 2)]!.s : 0;
    let take = 0;
    for (const row of scored) {
      if (take >= 3) break;
      if (row.s < med + 0.55 && take > 0) break;
      if (row.s < 0.4) break;
      row.p.itFactor = true;
      const bits: string[] = [];
      if (row.p.salary >= 5000 && row.p.salary <= 8500) bits.push("Leverage smash — mid-pay heaters, not the expensive chalk");
      if (row.p.oppRank >= 20) bits.push(`${ordinal(row.p.oppRank)} vs ${row.p.position}`);
      const g = games.find((x) => x.homeAbbr === row.p.team || x.awayAbbr === row.p.team);
      if (g?.total != null) bits.push(`O/U ${g.total.toFixed(1)}`);
      if (!bits.length) bits.push("Leverage smash — mid-pay heaters, not the expensive chalk");
      row.p.itFactorWhy = bits.slice(0, 2).join(" · ");
      take++;
    }
  }
}

export function pickNbaIt(players: NbaPlayer[], pos: NbaPos | "ALL", lens: NbaLens = "all"): NbaPlayer[] {
  const list = pos === "ALL" ? players : players.filter((p) => p.position === pos);
  return list.filter((p) => p.itFactor).slice(0, pos === "ALL" ? 12 : 3);
}
