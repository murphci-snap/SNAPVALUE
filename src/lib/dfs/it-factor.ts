import { POSITIONS } from "./constants";
import type { Game, Player, Position } from "./types";
import { ordinal } from "@/lib/utils";
import { isSidelined, type BoardLens } from "./scoring";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function implied(player: Player, games: Game[]): number | null {
  const g = games.find((x) => x.homeAbbr === player.team || x.awayAbbr === player.team);
  if (!g) return null;
  return player.home ? g.homeImplied : g.awayImplied;
}

function expectedAtd(p: Player): number {
  const k = p.salary / 1000;
  if (p.position === "QB") return clamp(0.18 + k * 0.03, 0.2, 0.52);
  if (p.position === "RB") return clamp(0.12 + k * 0.048, 0.16, 0.55);
  if (p.position === "WR") return clamp(0.1 + k * 0.035, 0.14, 0.42);
  if (p.position === "TE") return clamp(0.08 + k * 0.032, 0.12, 0.4);
  return 0.15;
}

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const a = [...vals].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function whyBits(p: Player, games: Game[], residual: number): string[] {
  const bits: string[] = [];
  const g = games.find((x) => x.homeAbbr === p.team || x.awayAbbr === p.team);
  const imp = implied(p, games);
  if (p.salary >= 5000 && p.salary <= 8000) bits.push(`$${(p.salary / 1000).toFixed(1)}k · our-guy band`);
  const atdExp = expectedAtd(p);
  if (p.anytimeTd != null && p.anytimeTd >= atdExp + 0.06) {
    bits.push(`${Math.round(p.anytimeTd * 100)}% ATD vs ${Math.round(atdExp * 100)}% salary-par`);
  }
  const script = scriptBump(p, games);
  if (script >= 1.2 && g?.total != null && g.total >= 47) bits.push(`${g.total.toFixed(1)} total`);
  else if (script >= 1.2 && imp != null && imp >= 25) bits.push(`${imp.toFixed(1)} implied pts`);
  if (p.oppRank >= 24) bits.push(`${ordinal(p.oppRank)} vs ${p.position}`);
  if (p.ownership != null && p.ownership <= 12) bits.push(`${p.ownership.toFixed(0)}% own`);
  if (p.fppg >= 6 && p.projection >= p.fppg + 4) bits.push("above season pace");
  if (p.value >= 2.5 && p.salary < 8000) bits.push(`${p.value.toFixed(2)} pts/$1k`);
  if (!bits.length) bits.push(`smash residual ${residual >= 0 ? "+" : ""}${residual.toFixed(1)}`);
  return bits.slice(0, 3);
}

function scriptBump(p: Player, games: Game[]): number {
  const g = games.find((x) => x.homeAbbr === p.team || x.awayAbbr === p.team);
  const imp = implied(p, games);
  let impliedB = 0;
  if (imp != null && imp >= 28) impliedB = 1.6;
  else if (imp != null && imp >= 25) impliedB = 0.85;
  let totalB = 0;
  if (g?.total != null && g.total >= 50) totalB = 1.2;
  else if (g?.total != null && g.total >= 47) totalB = 0.55;
  return Math.max(impliedB, totalB);
}

/** Bump-only smash juice. Not projection. */
export function smashScore(p: Player, games: Game[], lens: BoardLens = "all"): number {
  if (isSidelined(p.injury, p.status)) return -99;
  let s = 0;
  s += scriptBump(p, games);
  if (p.oppRank >= 28) s += 1.85;
  else if (p.oppRank >= 24) s += 1.2;
  else if (p.oppRank >= 20) s += 0.5;
  else if (p.oppRank <= 6) s -= 1.9;
  else if (p.oppRank <= 10) s -= 0.9;

  const propsInProj = p.rankingMethod === "props";
  if (!propsInProj) {
    if (p.anytimeTd != null && p.anytimeTd > 0) {
      s += clamp(p.anytimeTd - expectedAtd(p), -0.16, 0.28) * 12;
    }
    if (p.position === "QB" && p.props?.passYds) {
      const expY = 175 + (p.salary / 1000 - 5) * 16;
      s += clamp((p.props.passYds - expY) / 42, -0.5, 1.2);
    }
    if ((p.position === "WR" || p.position === "TE") && p.props?.recYds) {
      const expY = 22 + (p.salary / 1000) * 8;
      s += clamp((p.props.recYds - expY) / 26, -0.5, 1.2);
    }
    if ((p.position === "RB" || p.position === "QB") && p.props?.rushYds) {
      const expY = p.position === "QB" ? 16 + (p.salary / 1000) * 2 : 18 + (p.salary / 1000) * 8.5;
      s += clamp((p.props.rushYds - expY) / 22, -0.5, 1.2);
    }
  } else if (p.anytimeTd != null && p.anytimeTd > 0) {
    s += clamp(p.anytimeTd - expectedAtd(p), 0, 0.22) * 4;
  }

  if (p.fppg >= 6) s += clamp((p.projection - p.fppg) / 7, -0.5, 1.2);
  if (p.value >= 2.7 && p.salary < 8200) s += 0.7;

  const own = p.ownership ?? 12;
  const elite = s >= 4.2;
  if (p.isValuePlay && p.cheapImpact && p.salary >= 7500 && !elite) s -= 1.4;

  if (lens === "gpp") {
    if (p.salary >= 8500) s *= elite ? 0.72 : 0.38;
    else if (p.salary >= 5000 && p.salary <= 8000) s *= 1.28;
    if (own >= 20) s *= 0.58;
    else if (own <= 11) s *= 1.22;
  } else if (lens === "cash") {
    s += Math.max(0, p.projection - 12) * 0.14;
    if (own >= 15) s *= 1.06;
    if (p.salary < 4500) s *= 0.62;
    if (p.cheapImpact && p.projection < 12) s *= 0.65;
  } else {
    if (p.salary >= 8800) s *= elite ? 0.8 : 0.55;
    else if (p.salary >= 5000 && p.salary <= 8000) s *= 1.16;
  }

  return s;
}

export function pickItFactor(players: Player[], games: Game[], pos: Position, lens: BoardLens = "all"): Player[] {
  const floor = pos === "DST" ? 4 : pos === "QB" ? 12 : 7;
  const pool = players.filter((p) => {
    if (p.position !== pos) return false;
    if (p.showdownRole === "CPT") return false;
    if (p.isStarter === false) return false;
    if (isSidelined(p.injury, p.status)) return false;
    return p.projection >= floor;
  });
  const ranked = pool
    .map((p) => ({ p, s: smashScore(p, games, lens) }))
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return [];
  const vals = ranked.map((r) => r.s);
  const med = median(vals);
  const hi = vals[Math.max(0, Math.floor(vals.length * 0.2))] ?? med;
  const lo = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.7))] ?? med;
  const spread = Math.max(0.85, hi - lo);
  const bar = med + 0.55 * spread;
  const out: Player[] = [];
  for (let i = 0; i < ranked.length && out.length < 3; i++) {
    const row = ranked[i]!;
    const next = ranked[i + 1];
    const gap = row.s - (next?.s ?? row.s - 2);
    if (out.length === 0) {
      if (row.s < bar && gap < 1.35) break;
      out.push(row.p);
      continue;
    }
    if (row.s < bar) break;
    if (gap < 0.85 && row.s < med + 0.85 * spread) break;
    if (row.s < ranked[0]!.s - 2.6) break;
    out.push(row.p);
  }
  return out;
}

export function itWhy(p: Player, games: Game[], lens: BoardLens = "all"): string {
  return whyBits(p, games, smashScore(p, games, lens)).join(" · ");
}

export function itIdSet(players: Player[], games: Game[], lens: BoardLens = "all"): Set<string> {
  const ids = new Set<string>();
  for (const pos of POSITIONS) {
    for (const p of pickItFactor(players, games, pos, lens)) ids.add(p.id);
  }
  return ids;
}

export function markItFactor(players: Player[], games: Game[]) {
  for (const p of players) {
    p.itFactor = false;
    p.itFactorScore = 0;
    p.itFactorWhy = null;
  }
  const tagged = itIdSet(players, games, "all");
  for (const p of players) {
    if (p.showdownRole === "CPT") continue;
    const s = smashScore(p, games, "all");
    p.itFactorScore = Math.round(s * 10) / 10;
    if (!tagged.has(p.id)) continue;
    p.itFactor = true;
    p.itFactorWhy = whyBits(p, games, s).join(" · ");
  }
}
