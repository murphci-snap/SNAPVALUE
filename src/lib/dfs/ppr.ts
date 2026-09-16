import type { Game, Player } from "./types";
import { smashScoreWeeklyPpr } from "./it-factor";
import { isQuestionable, isSidelined, Q_HAIRCUT, robustSiteConsensus } from "./scoring";

export type PprGroup = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DST";

export interface PprRow {
  player: Player;
  ppr: number;
  rank: number;
  tape: string;
  smash: boolean;
  smashWhy: string | null;
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

/** This week's full-PPR only. Never Classic DK `projection` / salary / Val. */
export function pprPoints(p: Player): number {
  if (isSidelined(p.injury, p.status)) return 0;
  if (p.position === "DST") return dstPpr(p);
  const built = skillPpr(p);
  const weeklyPprSites = robustSiteConsensus(
    (p.sources ?? [])
      .filter((s) => s.kind === "site" && (s.id === "cbs" || s.id === "fantasypros"))
      .map((s) => ({ id: s.id, points: s.points })),
  );
  let pts = built >= 2 ? built : 0;
  if (pts < 2 && weeklyPprSites != null && weeklyPprSites >= 2) pts = weeklyPprSites;
  if (pts > 0 && isQuestionable(p.injury, p.status)) pts *= Q_HAIRCUT;
  return pts;
}

function tapeFor(p: Player): string {
  if (p.rankingMethod === "props") return "Props-backed";
  if (p.oppRank >= 24) return "Favorable matchup";
  if (p.oppRank <= 7) return "Tough matchup";
  return "";
}

function tagSmash(rows: PprRow[], games: Game[]): PprRow[] {
  const byPos = new Map<string, PprRow[]>();
  for (const r of rows) {
    const pos = r.player.position;
    const list = byPos.get(pos) ?? [];
    list.push(r);
    byPos.set(pos, list);
  }
  const smashIds = new Set<string>();
  const why = new Map<string, string>();
  for (const [, group] of byPos) {
    const ranked = group
      .map((r) => ({ r, s: smashScoreWeeklyPpr(r.player, games, r.ppr) }))
      .sort((a, b) => b.s - a.s);
    if (!ranked.length) continue;
    const vals = ranked.map((x) => x.s);
    const med = vals[Math.floor(vals.length / 2)] ?? 0;
    const hi = vals[Math.max(0, Math.floor(vals.length * 0.2))] ?? med;
    const bar = med + 0.55 * Math.max(0.85, hi - med);
    let take = 0;
    for (let i = 0; i < ranked.length && take < 3; i++) {
      const row = ranked[i]!;
      const next = ranked[i + 1];
      const gap = row.s - (next?.s ?? row.s - 2);
      if (take === 0 && row.s < bar && gap < 1.35) break;
      if (take > 0 && (row.s < bar || gap < 0.8)) break;
      smashIds.add(row.r.player.id);
      const bits: string[] = [];
      if (row.r.player.oppRank >= 24) bits.push("soft D");
      if ((row.r.player.anytimeTd ?? 0) >= 0.35) bits.push("ATD juice");
      bits.push("IT residual · PPR ceiling");
      why.set(row.r.player.id, bits.slice(0, 2).join(" · "));
      take += 1;
    }
  }
  return rows.map((r) => ({
    ...r,
    smash: smashIds.has(r.player.id),
    smashWhy: why.get(r.player.id) ?? null,
  }));
}

function byWeeklyPpr(a: { ppr: number; player: Player }, b: { ppr: number; player: Player }): number {
  if (b.ppr !== a.ppr) return b.ppr - a.ppr;
  return a.player.name.localeCompare(b.player.name);
}

export function rankPpr(players: Player[], group: PprGroup, games: Game[] = []): PprRow[] {
  const pool = players.filter((p) => {
    if (p.showdownRole === "CPT") return false;
    if (isSidelined(p.injury, p.status)) return false;
    if (group === "FLEX") return p.position === "RB" || p.position === "WR" || p.position === "TE";
    return p.position === group;
  });
  const scored = pool.map((player) => ({
    player,
    ppr: Math.round(pprPoints(player) * 10) / 10,
    tape: tapeFor(player),
    rank: 0,
    smash: false,
    smashWhy: null as string | null,
  }));
  const sorted = [...scored]
    .filter((r) => r.ppr > 0 || r.player.position === "DST")
    .sort(byWeeklyPpr)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return tagSmash(sorted, games);
}

export const PPR_GROUPS: { id: PprGroup; label: string }[] = [
  { id: "QB", label: "QB" },
  { id: "RB", label: "RB" },
  { id: "WR", label: "WR" },
  { id: "TE", label: "TE" },
  { id: "FLEX", label: "FLEX" },
  { id: "DST", label: "DST" },
];
