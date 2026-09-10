import type { Game, Player, Position } from "./types";
import { ordinal } from "@/lib/utils";

const CHEAP = ["RB", "WR", "TE"] as const;
const CAP = 4000;

function gameOf(player: Player, games: Game[]): Game | undefined {
  return games.find((x) => x.homeAbbr === player.team || x.awayAbbr === player.team);
}

function implied(player: Player, games: Game[]): number | null {
  const g = gameOf(player, games);
  if (!g) return null;
  return player.home ? g.homeImplied : g.awayImplied;
}

function cheapScore(p: Player, games: Game[]): number {
  let s = p.projection * 1.15 + p.value * 2.4;
  const g = gameOf(p, games);
  const imp = implied(p, games);
  if (p.oppRank >= 24) s += 2.8;
  else if (p.oppRank >= 20) s += 1.6;
  else if (p.oppRank <= 8) s -= 1.4;
  if (p.anytimeTd != null && p.anytimeTd >= 0.28) s += 2.4;
  else if (p.anytimeTd != null && p.anytimeTd >= 0.18) s += 1.2;
  if (p.props?.recYds && p.props.recYds >= 45) s += 1.5;
  if (p.props?.rushYds && p.props.rushYds >= 40) s += 1.5;
  if (imp != null && imp >= 24) s += 1.1;
  if (g?.total != null && g.total >= 47) s += 0.8;
  if (p.salary <= 3300 && p.projection >= 8) s += 1.2;
  if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) s -= 30;
  return s;
}

function why(p: Player, games: Game[]): string {
  const bits: string[] = [];
  const g = gameOf(p, games);
  if (p.value >= 2) bits.push(`${p.value.toFixed(2)}x value`);
  if (p.oppRank >= 22) bits.push(`${ordinal(p.oppRank)} vs ${p.position}`);
  if (p.anytimeTd != null && p.anytimeTd >= 0.18) bits.push(`${Math.round(p.anytimeTd * 100)}% ATD`);
  if (p.props?.recYds) bits.push(`${p.props.recYds.toFixed(0)} rec yds`);
  if (p.props?.rushYds) bits.push(`${p.props.rushYds.toFixed(0)} rush yds`);
  if (g?.total != null && g.total >= 47) bits.push(`${g.total.toFixed(1)} total`);
  if (!bits.length) bits.push("cheap FLEX dart with a path to 3x");
  return bits.slice(0, 3).join(" · ");
}

export function markCheapImpact(players: Player[], games: Game[]) {
  for (const p of players) {
    p.cheapImpact = false;
    p.cheapImpactWhy = null;
  }
  for (const pos of CHEAP) {
    const pool = players.filter((p) => {
      if (p.position !== pos) return false;
      if (p.salary >= CAP) return false;
      if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) return false;
      if (/^(out|ir|doubtful|suspended)/i.test(p.status)) return false;
      const floor = pos === "TE" ? 4.5 : 5.5;
      return p.projection >= floor || p.value >= 1.85;
    });
    const ranked = pool
      .map((p) => ({ p, s: cheapScore(p, games) }))
      .sort((a, b) => b.s - a.s || b.p.projection - a.p.projection);
    const pick = ranked[0];
    if (!pick) continue;
    pick.p.cheapImpact = true;
    pick.p.cheapImpactWhy = why(pick.p, games);
  }
}

export const CHEAP_IMPACT_POS: Position[] = ["RB", "WR", "TE"];
