import type { Player } from "./types";
import { isQuestionable, isSidelined, Q_HAIRCUT, robustSiteConsensus } from "./scoring";

export type PprGroup = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DST";

export interface PprRow {
  player: Player;
  ppr: number;
  rank: number;
  tape: string;
}

function tdShare(p: Player): { rushTd: number; recTd: number; passTd: number } {
  const w = p.week;
  let rushTd = p.props?.rushTd ?? w?.rushTd ?? 0;
  let recTd = p.props?.recTd ?? w?.recTd ?? 0;
  let passTd = p.props?.passTd ?? w?.passTd ?? 0;
  const atd = p.anytimeTd;
  if (atd != null && atd > 0 && atd < 1) {
    if (p.position === "RB") {
      rushTd = Math.max(rushTd, atd * 0.72);
      recTd = Math.max(recTd, atd * 0.28);
    } else if (p.position === "QB") {
      rushTd = Math.max(rushTd, atd * 0.55);
    } else {
      recTd = Math.max(recTd, atd * 0.88);
    }
  }
  return { rushTd, recTd, passTd };
}

/** Full-PPR from this week's usage. No DK yardage bonuses. */
function skillPpr(p: Player): number {
  const rec = p.props?.receptions ?? p.week?.receptions ?? 0;
  const recYds = p.props?.recYds ?? p.week?.recYds ?? 0;
  const rushYds = p.props?.rushYds ?? p.week?.rushYds ?? 0;
  const passYds = p.props?.passYds ?? p.week?.passYds ?? 0;
  const ints = p.props?.interceptions ?? p.week?.interceptions ?? 0;
  const { rushTd, recTd, passTd } = tdShare(p);
  return (
    passYds * 0.04 +
    passTd * 4 +
    ints * -2 +
    rushYds * 0.1 +
    rushTd * 6 +
    rec * 1 +
    recYds * 0.1 +
    recTd * 6
  );
}

function dstPa(pts: number): number {
  if (pts < 1) return 5;
  if (pts <= 6) return 4;
  if (pts <= 13) return 1;
  if (pts <= 20) return 0;
  if (pts <= 27) return -1;
  if (pts <= 34) return -3;
  return -5;
}

function dstPpr(p: Player): number {
  const w = p.week;
  if (w && (w.sacks || w.defInt || w.fumRec || w.defTd || w.ptsAllowed)) {
    return w.sacks * 1 + w.defInt * 2 + w.fumRec * 2 + w.defTd * 6 + dstPa(w.ptsAllowed);
  }
  if (w && w.espnPpr > 0) return w.espnPpr;
  if (p.oppRank >= 24) return 7;
  if (p.oppRank <= 8) return 4;
  return 5.5;
}

/** This week's full-PPR only. Never Classic DK `projection`. */
export function pprPoints(p: Player): number {
  if (isSidelined(p.injury, p.status)) return 0;
  if (p.position === "DST") return dstPpr(p);
  const built = skillPpr(p);
  const site = robustSiteConsensus(
    (p.sources ?? [])
      .filter((s) => s.kind === "site")
      .map((s) => ({ id: s.id, points: s.points })),
  );
  let pts = 0;
  if (built >= 4) pts = built;
  else if (site != null && site >= 2) pts = site;
  else if (built >= 2) pts = built;
  if (pts > 0 && isQuestionable(p.injury, p.status)) pts *= Q_HAIRCUT;
  return pts;
}

function tapeFor(p: Player): string {
  if (p.rankingMethod === "props") return "Props-backed";
  if (p.oppRank >= 24) return "Favorable matchup";
  if (p.oppRank <= 7) return "Tough matchup";
  return "";
}

export function rankPpr(players: Player[], group: PprGroup): PprRow[] {
  const pool = players.filter((p) => {
    if (p.showdownRole === "CPT") return false;
    if (isSidelined(p.injury, p.status)) return false;
    if (group === "FLEX") return p.position === "RB" || p.position === "WR" || p.position === "TE";
    return p.position === group;
  });
  const scored = pool
    .map((player) => ({
      player,
      ppr: Math.round(pprPoints(player) * 10) / 10,
      tape: tapeFor(player),
      rank: 0,
    }))
    .filter((r) => r.ppr > 0 || r.player.position === "DST")
    .sort((a, b) => b.ppr - a.ppr || a.player.name.localeCompare(b.player.name));
  return scored.map((r, i) => ({ ...r, rank: i + 1 }));
}

export const PPR_GROUPS: { id: PprGroup; label: string }[] = [
  { id: "QB", label: "QB" },
  { id: "RB", label: "RB" },
  { id: "WR", label: "WR" },
  { id: "TE", label: "TE" },
  { id: "FLEX", label: "FLEX" },
  { id: "DST", label: "DST" },
];
