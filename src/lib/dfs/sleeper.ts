import type { Game, Player, Position } from "./types";
import { ordinal } from "@/lib/utils";

const CHEAP: Position[] = ["QB", "RB", "WR", "TE"];
const SOFT: Record<Position, number> = { QB: 5500, RB: 5200, WR: 5200, TE: 5000, DST: 3000 };
const TAKE = 3;

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

function cheapScore(p: Player, games: Game[]): number {
  let s = p.value * 5.2;
  const cap = SOFT[p.position] ?? 5000;
  if (p.salary <= cap - 1200) s += 0.35;
  else if (p.salary > cap) s -= (p.salary - cap) / 2500;
  if (p.oppRank >= 24) s += 0.45;
  else if (p.oppRank >= 20) s += 0.2;
  else if (p.oppRank <= 8) s -= 0.35;
  if (p.anytimeTd != null && p.anytimeTd >= 0.22) s += 0.3;
  const g = gameOf(p, games);
  const imp = implied(p, games);
  if (imp != null && imp >= 24) s += 0.15;
  if (g?.total != null && g.total >= 47) s += 0.12;
  return s;
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
      .sort((a, b) => b.p.value - a.p.value || b.s - a.s || a.p.salary - b.p.salary);
    for (const pick of ranked.slice(0, TAKE)) {
      pick.p.cheapImpact = true;
      pick.p.cheapImpactWhy = why(pick.p, games);
    }
  }
}

export const CHEAP_IMPACT_POS: Position[] = ["QB", "RB", "WR", "TE"];
export const BARGAIN_TAKE = TAKE;
