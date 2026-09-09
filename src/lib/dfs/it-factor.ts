import { POSITIONS } from "./constants";
import type { Game, Player } from "./types";
import { ordinal } from "@/lib/utils";

function implied(player: Player, games: Game[]): number | null {
  const g = games.find((x) => x.homeAbbr === player.team || x.awayAbbr === player.team);
  if (!g) return null;
  return player.home ? g.homeImplied : g.awayImplied;
}

function whyBits(p: Player, games: Game[]): string[] {
  const bits: string[] = [];
  const g = games.find((x) => x.homeAbbr === p.team || x.awayAbbr === p.team);
  const imp = implied(p, games);
  if (g?.total != null && g.total >= 48) bits.push(`${g.total.toFixed(1)} Vegas total`);
  else if (imp != null && imp >= 26) bits.push(`${imp.toFixed(1)} implied points`);
  if (p.oppRank >= 24) bits.push(`${ordinal(p.oppRank)} vs ${p.position} — smash spot`);
  else if (p.oppRank >= 20) bits.push(`soft ${ordinal(p.oppRank)}-ranked ${p.position} D`);
  if (p.anytimeTd != null && p.anytimeTd >= 0.42) {
    bits.push(`${Math.round(p.anytimeTd * 100)}% anytime TD`);
  }
  if (p.props?.passYds && p.props.passYds >= 265) bits.push(`${p.props.passYds.toFixed(1)} pass yds`);
  if (p.props?.recYds && p.props.recYds >= 80) bits.push(`${p.props.recYds.toFixed(1)} rec yds`);
  if (p.props?.rushYds && p.props.rushYds >= 75) bits.push(`${p.props.rushYds.toFixed(1)} rush yds`);
  if (p.projection >= p.fppg + 4 && p.fppg > 4) bits.push("well above season pace");
  if (p.value >= 2.5) bits.push(`elite ${p.value.toFixed(2)}x value`);
  if (!bits.length) bits.push(`ceiling week at $${(p.salary / 1000).toFixed(1)}k`);
  return bits.slice(0, 3);
}

export function itScore(p: Player, games: Game[]): number {
  let s = p.projection;
  const imp = implied(p, games);
  const g = games.find((x) => x.homeAbbr === p.team || x.awayAbbr === p.team);
  if (imp != null && imp >= 28) s += 4;
  else if (imp != null && imp >= 25) s += 2.2;
  else if (imp != null && imp >= 23) s += 1;
  if (g?.total != null && g.total >= 50) s += 2.5;
  else if (g?.total != null && g.total >= 47) s += 1.4;
  if (p.oppRank >= 28) s += 3.2;
  else if (p.oppRank >= 24) s += 2.2;
  else if (p.oppRank >= 20) s += 1.1;
  else if (p.oppRank <= 6) s -= 2.5;
  else if (p.oppRank <= 10) s -= 1.2;
  if (p.anytimeTd != null) {
    if (p.anytimeTd >= 0.55) s += 4.5;
    else if (p.anytimeTd >= 0.42) s += 2.8;
    else if (p.anytimeTd >= 0.32) s += 1.4;
  }
  if (p.props?.passYds && p.props.passYds >= 275) s += 2.4;
  if (p.props?.recYds && p.props.recYds >= 90) s += 2.6;
  else if (p.props?.recYds && p.props.recYds >= 75) s += 1.4;
  if (p.props?.rushYds && p.props.rushYds >= 85) s += 2.4;
  if (p.projection > p.fppg + 5 && p.fppg >= 6) s += 1.8;
  if (p.value >= 2.6 && p.projection >= 12) s += 1.6;
  if (p.rankingMethod === "props") s += 0.8;
  if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) s -= 20;
  return s;
}

export function markItFactor(players: Player[], games: Game[]) {
  for (const p of players) {
    p.itFactor = false;
    p.itFactorScore = 0;
    p.itFactorWhy = null;
  }
  for (const pos of POSITIONS) {
    const pool = players.filter((p) => {
      if (p.position !== pos) return false;
      if (p.isStarter === false) return false;
      if (p.injury && /out|ir|doubtful|suspended/i.test(p.injury)) return false;
      if (/^(out|ir|doubtful|suspended)/i.test(p.status)) return false;
      const floor = pos === "DST" ? 4 : pos === "QB" ? 14 : 8;
      return p.projection >= floor;
    });
    const ranked = pool
      .map((p) => ({ p, s: itScore(p, games) }))
      .sort((a, b) => b.s - a.s);
    const take = 3;
    for (const row of ranked.slice(0, take)) {
      row.p.itFactor = true;
      row.p.itFactorScore = Math.round(row.s * 10) / 10;
      row.p.itFactorWhy = whyBits(row.p, games).join(" · ");
    }
  }
}
