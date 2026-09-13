import type { Game, Player, Position } from "./types";
import { ordinal } from "@/lib/utils";

const CHEAP: Position[] = ["QB", "RB", "WR", "TE"];
const SOFT: Record<Position, number> = { QB: 5500, RB: 5000, WR: 5000, TE: 5000, DST: 3000 };

function gameOf(player: Player, games: Game[]): Game | undefined {
  return games.find((x) => x.homeAbbr === player.team || x.awayAbbr === player.team);
}

function implied(player: Player, games: Game[]): number | null {
  const g = gameOf(player, games);
  if (!g) return null;
  return player.home ? g.homeImplied : g.awayImplied;
}

function available(p: Player): boolean {
  if (p.salary <= 0) return false;
  if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) return false;
  if (/^(out|ir|doubtful|suspended)/i.test(p.status)) return false;
  return true;
}

function cheapScore(p: Player, games: Game[]): number {
  let s = p.value * 3.4 + p.projection * 0.85;
  const cap = SOFT[p.position] ?? 5000;
  if (p.salary <= cap - 1500) s += 2.4;
  else if (p.salary <= cap) s += 1.2;
  else s -= (p.salary - cap) / 1800;
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
  if (p.salary <= 3500 && p.projection >= 8) s += 1.2;
  return s;
}

function poolFor(players: Player[], pos: Position): Player[] {
  const eligible = players.filter((p) => p.position === pos && available(p));
  if (!eligible.length) return [];
  const cap = SOFT[pos] ?? 5000;
  const under = eligible.filter((p) => p.salary <= cap);
  if (under.length) return under;
  const byPay = [...eligible].sort((a, b) => a.salary - b.salary || b.value - a.value);
  return byPay.slice(0, Math.min(10, byPay.length));
}

function why(p: Player, games: Game[]): string {
  const bits: string[] = [`${p.value.toFixed(2)} pts/$1k`];
  if (p.oppRank >= 22) bits.push(`${ordinal(p.oppRank)} vs ${p.position}`);
  if (p.anytimeTd != null && p.anytimeTd >= 0.18) bits.push(`${Math.round(p.anytimeTd * 100)}% ATD`);
  if (p.position === "QB" && p.props?.passYds) bits.push(`${p.props.passYds.toFixed(0)} pass yds`);
  if (p.props?.recYds) bits.push(`${p.props.recYds.toFixed(0)} rec yds`);
  if (p.props?.rushYds) bits.push(`${p.props.rushYds.toFixed(0)} rush yds`);
  const g = gameOf(p, games);
  if (g?.total != null && g.total >= 47) bits.push(`${g.total.toFixed(1)} total`);
  bits.push("FLEX / last skill slot");
  return bits.slice(0, 4).join(" · ");
}

export function markCheapImpact(players: Player[], games: Game[]) {
  for (const p of players) {
    p.cheapImpact = false;
    p.cheapImpactWhy = null;
  }
  for (const pos of CHEAP) {
    const pool = poolFor(players, pos);
    if (!pool.length) continue;
    const ranked = pool
      .map((p) => ({ p, s: cheapScore(p, games) }))
      .sort((a, b) => b.s - a.s || b.p.value - a.p.value || a.p.salary - b.p.salary);
    const pick = ranked[0];
    if (!pick) continue;
    pick.p.cheapImpact = true;
    pick.p.cheapImpactWhy = why(pick.p, games);
  }
}

export const CHEAP_IMPACT_POS: Position[] = ["QB", "RB", "WR", "TE"];
