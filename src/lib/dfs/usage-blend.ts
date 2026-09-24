import { S } from "./constants";
import { isSidelined } from "./scoring";
import type { Game, Player, Position } from "./types";

export type RecentUsage = { avgPts: number; avgTouches: number; weeks: number };

function num(stats: Record<string, number> | undefined, id: number): number {
  if (!stats) return 0;
  const v = stats[String(id)];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Last 2–3 weeks ESPN box / usage average. */
export function recentUsage(
  stats:
    | {
        appliedTotal?: number;
        scoringPeriodId: number;
        seasonId: number;
        statSourceId: number;
        stats?: Record<string, number>;
      }[]
    | undefined,
  season: number,
  week: number,
): RecentUsage {
  const pts: number[] = [];
  let touches = 0;
  let nTouchWeeks = 0;
  const lookback = Math.min(3, Math.max(0, week - 1));
  for (let back = 1; back <= lookback; back++) {
    const w = week - back;
    const row = stats?.find((s) => s.statSourceId === 0 && s.seasonId === season && s.scoringPeriodId === w);
    if (!row) continue;
    const p = row.appliedTotal ?? 0;
    if (p > 0.5) pts.push(p);
    if (row.stats) {
      const t = num(row.stats, S.targets) + num(row.stats, S.rushAtt) + num(row.stats, S.passAtt) * 0.15;
      if (t > 0) {
        touches += t;
        nTouchWeeks += 1;
      }
    }
  }
  const avgPts = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
  const avgTouches = nTouchWeeks ? touches / nTouchWeeks : 0;
  return { avgPts, avgTouches, weeks: pts.length };
}

/** Blend recent usage into a projection (props path vs consensus / site path). */
export function blendRecentUsage(
  projection: number,
  usage: RecentUsage,
  position: Position,
  opts: { week: number; sidelined: boolean; path: "props" | "other"; rankingMethod?: string; propsWeight?: number },
): number {
  if (opts.sidelined || opts.week < 2 || usage.avgPts < 2) return projection;
  const rec = usage.avgPts * (position === "QB" ? 0.88 : 0.94);
  if (opts.path === "props") {
    const w = opts.propsWeight ?? 1;
    if (w >= 0.9) return projection;
    const rw = usage.weeks >= 2 ? 0.22 : 0.14;
    return (1 - rw) * projection + rw * rec;
  }
  if (opts.rankingMethod === "props") return projection;
  const rw =
    opts.rankingMethod === "consensus"
      ? usage.weeks >= 2
        ? 0.24
        : 0.16
      : usage.weeks >= 2
        ? 0.34
        : 0.26;
  return (1 - rw) * projection + rw * rec;
}

/** Vegas totals / implied script bump. */
export function applyScriptBump(
  projection: number,
  opts: { sidelined: boolean; position: Position; team: string; home: boolean; games: Game[] },
): number {
  if (opts.sidelined || opts.position === "DST") return projection;
  const g = opts.games.find((x) => x.homeAbbr === opts.team || x.awayAbbr === opts.team);
  const imp = g ? (opts.home ? g.homeImplied : g.awayImplied) : null;
  let script = 1;
  if (g?.total != null && g.total >= 50) script += 0.035;
  else if (g?.total != null && g.total >= 47) script += 0.02;
  if (imp != null && imp >= 28) script += 0.03;
  else if (imp != null && imp >= 25) script += 0.015;
  if (imp != null && imp <= 16) script -= 0.025;
  return projection * script;
}

/** Haircut low-snap / low-touch chalk. */
export function haircutLowSnapChalk(
  projection: number,
  usage: RecentUsage,
  opts: { sidelined: boolean; position: Position; salary: number; fppg: number },
): number {
  if (opts.sidelined || opts.position === "DST" || opts.salary < 7000 || usage.weeks < 2) return projection;
  const touchFloor = opts.position === "QB" ? 28 : opts.position === "RB" ? 12 : opts.position === "TE" ? 4.5 : 5.5;
  if (usage.avgTouches > 0 && usage.avgTouches < touchFloor * 0.72) return projection * 0.9;
  if (usage.avgPts > 0 && usage.avgPts < opts.fppg * 0.55 && opts.fppg >= 10) return projection * 0.92;
  return projection;
}

/**
 * Post-hydrate week-3 script + chalk haircut when multi-week ESPN stats are not on the Player.
 * Uses fppg as a usage proxy; full blendRecentUsage still belongs in api espnStats path when wired.
 */
export function applyWeek3ClientBump(players: Player[], games: Game[]): void {
  for (const p of players) {
    const sidelined = isSidelined(p.injury, p.status);
    if (sidelined || p.position === "DST") continue;
    let projection = p.projection;
    projection = applyScriptBump(projection, {
      sidelined,
      position: p.position,
      team: p.team,
      home: p.home,
      games,
    });
    const usage: RecentUsage = {
      avgPts: p.fppg > 0 ? p.fppg : 0,
      avgTouches: 0,
      weeks: p.fppg >= 4 ? 2 : 0,
    };
    projection = haircutLowSnapChalk(projection, usage, {
      sidelined,
      position: p.position,
      salary: p.salary,
      fppg: p.fppg,
    });
    if (p.salary >= 8500 && p.ownership != null && p.ownership >= 22 && p.fppg > 0 && p.projection > p.fppg * 1.15) {
      projection *= 0.97;
    }
    if (Math.abs(projection - p.projection) > 0.05) {
      p.projection = Math.round(projection * 10) / 10;
      if (p.salary > 0) p.value = Math.round((p.projection / (p.salary / 1000)) * 100) / 100;
    }
  }
}
