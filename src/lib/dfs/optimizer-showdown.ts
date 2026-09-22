import { mulberry32 } from "@/lib/utils";
import { SALARY_CAP, SHOWDOWN_ROSTER } from "./constants";
import type { Lineup, Player, Position, RosterSlot } from "./types";
import { isSidelined } from "./scoring";
import { type ContestStyle, weightedPick, scorePlayer } from "./optimizer-shared";

function coreId(p: Player): string {
  return p.id.replace(/:(CPT|FLEX)$/i, "");
}

export function generateShowdownLineups(
  players: Player[],
  count: number,
  seed: number,
  opts?: { locks?: string[]; excludes?: string[]; contest?: ContestStyle },
): Lineup[] {
  const contest = opts?.contest === "milly" ? "milly" : "doubleup";
  const lockIds = new Set(opts?.locks ?? []);
  const exclude = new Set(opts?.excludes ?? []);
  const rng = mulberry32(seed);

  let utilPool = players.filter((p) => {
    if (exclude.has(p.id)) return false;
    if (p.salary <= 0) return false;
    if (p.showdownRole === "CPT") return false;
    if (isSidelined(p.injury, p.status)) {
      return lockIds.has(p.id);
    }
    return p.projection >= 3 || lockIds.has(p.id);
  });
  let cptPool = players.filter((p) => {
    if (exclude.has(p.id)) return false;
    if (p.showdownRole !== "CPT") return false;
    if (p.salary <= 0) return false;
    if (isSidelined(p.injury, p.status)) {
      return lockIds.has(p.id);
    }
    return p.projection >= 5 || lockIds.has(p.id);
  });
  if (!cptPool.length) {
    cptPool = utilPool.map((p) => ({
      ...p,
      id: `${coreId(p)}:CPT`,
      salary: Math.round((p.salary * 1.5) / 100) * 100,
      projection: Math.round(p.projection * 15) / 10,
      showdownRole: "CPT" as const,
    }));
  }

  const byId = new Map([...cptPool, ...utilPool].map((p) => [p.id, p]));
  const results: Lineup[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (results.length < count && attempts < count * 60) {
    attempts++;
    const usedCore = new Set<string>();
    const chosen: { slot: RosterSlot; player: Player }[] = [];
    let salary = 0;

    const lockedCpt = [...lockIds].map((id) => byId.get(id)).find((p) => p?.showdownRole === "CPT");
    let cpt: Player | null = null;
    if (lockedCpt && SALARY_CAP - lockedCpt.salary >= 0) cpt = lockedCpt;
    else {
      const chalk = contest === "doubleup";
      cpt = weightedPick(cptPool, (p) => {
        const own = (p.ownership ?? 12) / 100;
        if (chalk) return p.projection ** 2.15 * (p.salary >= 9000 ? 1.22 : 1);
        return p.projection ** 1.28 * (p.itFactor ? 1.28 : 1) * Math.max(0.62, 1.2 - own * 0.7) * (0.55 + rng() * 0.7);
      }, rng);
    }
    if (!cpt) continue;
    usedCore.add(coreId(cpt));
    salary += cpt.salary;
    chosen.push({ slot: "CPT", player: cpt });

    const utilSlots = SHOWDOWN_ROSTER.filter((r) => r.slot !== "CPT");
    let failed = false;
    for (let i = 0; i < utilSlots.length; i++) {
      const slot = utilSlots[i]!;
      const rest = utilSlots.slice(i + 1);
      const leftoverAfterMin = (candidate: Player) => {
        const next = new Set(usedCore);
        next.add(coreId(candidate));
        return SALARY_CAP - salary - candidate.salary - remainingMinShowdown(rest, utilPool, next);
      };
      const lockedFit = [...lockIds]
        .map((id) => byId.get(id))
        .find((p) => p && p.showdownRole !== "CPT" && !usedCore.has(coreId(p)) && leftoverAfterMin(p) >= 0);
      let pick: Player | null = lockedFit ?? null;
      if (!pick) {
        const candidates = utilPool.filter((p) => !usedCore.has(coreId(p)) && leftoverAfterMin(p) >= 0);
        pick = weightedPick(
          candidates,
          (p) => {
            const base = scorePlayer(contest === "milly" ? "milly" : "doubleup", p, rng, false);
            if (contest !== "milly" || !cpt) return base;
            if (p.team === cpt.team) return base * 1.45;
            if (p.opponent === cpt.team) return base * 1.18;
            return base;
          },
          rng,
        );
      }
      if (!pick) {
        failed = true;
        break;
      }
      usedCore.add(coreId(pick));
      salary += pick.salary;
      chosen.push({ slot: slot.slot, player: pick });
    }
    if (failed || chosen.length !== 6 || salary > SALARY_CAP) continue;

    for (let k = 0; k < (contest === "milly" ? 10 : 22); k++) {
      const idx = 1 + Math.floor(rng() * 5);
      const cur = chosen[idx];
      if (!cur) continue;
      const alt = utilPool.filter((p) => {
        if (usedCore.has(coreId(p)) && coreId(p) !== coreId(cur.player)) return false;
        if (coreId(p) === coreId(chosen[0]!.player)) return false;
        const newSalary = salary - cur.player.salary + p.salary;
        if (newSalary > SALARY_CAP) return false;
        return p.projection > cur.player.projection + 0.2;
      });
      if (!alt.length) continue;
      const next = weightedPick(alt, (p) => p.projection, rng);
      if (!next || coreId(next) === coreId(cur.player)) continue;
      usedCore.delete(coreId(cur.player));
      usedCore.add(coreId(next));
      salary = salary - cur.player.salary + next.salary;
      chosen[idx] = { slot: cur.slot, player: next };
    }

    const key = chosen.map((c) => coreId(c.player)).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const ordered = SHOWDOWN_ROSTER.map((r) => chosen.find((c) => c.slot === r.slot)!).filter(Boolean);
    const projection = ordered.reduce((s, c) => s + c.player.projection, 0);
    const value = ordered.reduce((s, c) => s + c.player.value, 0) / ordered.length;
    const cap = ordered[0]?.player;
    const mates = ordered.filter((c) => cap && c.player.team === cap.team && c.player.id !== cap.id);
    results.push({
      id: `L${results.length + 1}`,
      players: ordered,
      salary,
      projection,
      value,
      remaining: SALARY_CAP - salary,
      stacks: cap && mates.length ? [`CPT ${cap.name.split(" ").slice(-1)[0]}`] : ["Showdown"],
    });
  }

  return results.sort((a, b) => b.projection - a.projection);
}

function remainingMinShowdown(
  unfilled: { slot: RosterSlot; positions: Position[] }[],
  pool: Player[],
  usedCore: Set<string>,
): number {
  const taken = new Set(usedCore);
  let total = 0;
  for (const _slot of unfilled) {
    const cheapest = pool
      .filter((p) => !taken.has(coreId(p)))
      .sort((a, b) => a.salary - b.salary)[0];
    if (!cheapest) return Number.POSITIVE_INFINITY;
    taken.add(coreId(cheapest));
    total += cheapest.salary;
  }
  return total;
}
