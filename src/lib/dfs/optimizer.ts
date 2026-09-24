import { mulberry32 } from "@/lib/utils";
import { SLOT_LABEL } from "./constants";
import type { Lineup, Player, SlateFormat } from "./types";
import { isSidelined } from "./scoring";
export type { ContestStyle } from "./optimizer-shared";
export { CONTEST_META } from "./optimizer-shared";
import { type ContestStyle } from "./optimizer-shared";
import { buildOne } from "./optimizer-build";
import { generateShowdownLineups } from "./optimizer-showdown";

export type GenerateLineupOpts = {
  stackQb?: boolean;
  locks?: string[];
  excludes?: string[];
  contest?: ContestStyle;
  format?: SlateFormat;
  /** Prefer / require QB + pass-catcher from this team when stacking. */
  forceStackTeam?: string;
  /** Max share of generated lineups a player may appear in (0–1). */
  maxExposure?: number;
};

export function generateLineups(
  players: Player[],
  count: number,
  seed: number,
  opts?: GenerateLineupOpts,
): Lineup[] {
  if (opts?.format === "showdown" || players.some((p) => p.showdownRole === "CPT")) {
    return generateShowdownLineups(players, count, seed, opts);
  }
  const stackQb = opts?.stackQb ?? true;
  const contest = opts?.contest ?? "single";
  const lockIds = new Set(opts?.locks ?? []);
  const exclude = new Set(opts?.excludes ?? []);
  const forceStackTeam = opts?.forceStackTeam?.trim() || undefined;
  const maxExposure = opts?.maxExposure != null && opts.maxExposure > 0 && opts.maxExposure < 1 ? opts.maxExposure : undefined;
  const maxAppear = maxExposure != null ? Math.max(1, Math.ceil(count * maxExposure)) : undefined;
  const rng = mulberry32(seed);

  const qbFloor = contest === "doubleup" ? 14 : contest === "small" ? 12 : contest === "milly" ? 7 : 8;
  const skillFloor = contest === "doubleup" ? 8 : contest === "small" ? 6.5 : contest === "milly" ? 4 : 4.5;

  const pool = players.filter((p) => {
    if (exclude.has(p.id)) return false;
    if (p.salary <= 0) return false;
    if (isSidelined(p.injury, p.status)) {
      return lockIds.has(p.id);
    }
    const floor = p.position === "DST" ? (contest === "small" ? 5 : 3.5) : p.position === "QB" ? qbFloor : skillFloor;
    if (p.position === "QB" && p.isStarter === false && !lockIds.has(p.id)) return false;
    return p.projection >= floor || lockIds.has(p.id);
  });

  const byId = new Map(pool.map((p) => [p.id, p]));
  const locks = [...lockIds].map((id) => byId.get(id)).filter((p): p is Player => !!p);

  const results: Lineup[] = [];
  const seen = new Set<string>();
  const exposure = new Map<string, number>();
  let attempts = 0;
  const valueRate = contest === "milly" ? 0.55 : contest === "doubleup" ? 0.02 : contest === "small" ? 0.1 : 0.32;

  while (results.length < count && attempts < count * 64) {
    attempts++;
    const valueLean = rng() < valueRate;
    const built = buildOne(pool, locks, rng, { stackQb, valueLean, contest, forceStackTeam });
    if (!built) continue;
    const key = built.players
      .map((lp) => lp.player.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    if (maxAppear != null) {
      const over = built.players.some((lp) => (exposure.get(lp.player.id) ?? 0) >= maxAppear);
      if (over) continue;
    }
    seen.add(key);
    for (const lp of built.players) {
      exposure.set(lp.player.id, (exposure.get(lp.player.id) ?? 0) + 1);
    }
    built.id = `L${results.length + 1}`;
    results.push(built);
  }

  return results.sort((a, b) => b.projection - a.projection);
}

export function lineupAsText(lineup: Lineup): string {
  const lines = lineup.players.map((lp) => {
    const p = lp.player;
    return `${SLOT_LABEL[lp.slot].padEnd(4)} ${p.name} (${p.team}) $${p.salary.toLocaleString()}`;
  });
  lines.push(
    "",
    `Proj ${lineup.projection.toFixed(1)}   Salary $${lineup.salary.toLocaleString()}   Left $${lineup.remaining.toLocaleString()}`,
  );
  return lines.join("\n");
}

function dkCell(p: Player): string {
  const id = p.dkId || p.id;
  return `${p.name} (${id})`;
}

export function lineupAsDkPaste(lineup: Lineup, format: SlateFormat): string {
  return lineup.players.map((lp) => dkCell(lp.player)).join(",");
}

export function lineupsAsDkCsv(lineups: Lineup[], format: SlateFormat): string {
  const header =
    format === "showdown" ? "CPT,FLEX,FLEX,FLEX,FLEX,FLEX" : "QB,RB,RB,WR,WR,WR,TE,FLEX,DST";
  const rows = lineups.map((lu) => lu.players.map((lp) => dkCell(lp.player)).join(","));
  return [header, ...rows].join("\n");
}
