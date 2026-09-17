import { mulberry32 } from "@/lib/utils";
import { NBA_CAP, NBA_ROSTER, NBA_SLOT_LABEL } from "./constants";
import { isSidelined } from "./scoring";
import type { NbaLineup, NbaPlayer, NbaPos, NbaSlot } from "./types";

export type NbaContest = "cash" | "gpp";

export const NBA_CONTEST_META: Record<NbaContest, { label: string; blurb: string }> = {
  cash: {
    label: "Cash / Double Up",
    blurb: "High floors, spend the cap, chalk OK. Analogous to NFL Double Up.",
  },
  gpp: {
    label: "GPP / Milly",
    blurb: "Ceiling and leverage. Mid-pay smash, unique UTIL. Analogous to NFL Milly.",
  },
};

function remainingMin(unfilled: typeof NBA_ROSTER, pool: NbaPlayer[], used: Set<string>): number {
  const taken = new Set(used);
  let total = 0;
  for (const slot of unfilled) {
    const cheapest = pool
      .filter((p) => !taken.has(p.id) && slot.positions.includes(p.position))
      .sort((a, b) => a.salary - b.salary)[0];
    if (!cheapest) return Number.POSITIVE_INFINITY;
    taken.add(cheapest.id);
    total += cheapest.salary;
  }
  return total;
}

function weight(style: NbaContest, p: NbaPlayer, rng: () => number): number {
  const matchup = p.oppRank >= 20 ? 1.1 : p.oppRank <= 8 ? 0.9 : 1;
  const it = p.itFactor ? 1.12 : 1;
  if (style === "cash") {
    const sal = p.salary >= 7000 ? 1.18 : p.salary < 4000 ? 0.55 : 1;
    return p.projection ** 1.8 * matchup * it * sal * (0.94 + rng() * 0.08);
  }
  const dart = p.cheapImpact ? 1.28 : 1;
  const fade = p.salary >= 10000 ? 0.88 : 1;
  return p.value ** 1.2 * Math.max(p.projection, 12) * matchup * dart * fade * it * (0.55 + rng() * 0.9);
}

export function generateNbaLineups(
  players: NbaPlayer[],
  count: number,
  seed: number,
  opts?: { locks?: string[]; excludes?: string[]; contest?: NbaContest },
): NbaLineup[] {
  const contest = opts?.contest ?? "cash";
  const lockIds = new Set(opts?.locks ?? []);
  const exclude = new Set(opts?.excludes ?? []);
  const rng = mulberry32(seed);
  const floor = contest === "cash" ? 20 : 14;
  const pool = players.filter((p) => {
    if (exclude.has(p.id) || p.salary <= 0) return false;
    if (isSidelined(p.injury, p.status)) return lockIds.has(p.id);
    return p.projection >= floor || lockIds.has(p.id);
  });
  const byId = new Map(pool.map((p) => [p.id, p]));
  const locks = [...lockIds].map((id) => byId.get(id)).filter((p): p is NbaPlayer => !!p);
  const results: NbaLineup[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (results.length < count && attempts < count * 60) {
    attempts++;
    const built = buildOne(pool, locks, rng, contest);
    if (!built) continue;
    const key = built.players
      .map((lp) => lp.player.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    built.id = `N${results.length + 1}`;
    results.push(built);
  }
  return results.sort((a, b) => b.projection - a.projection);
}

function buildOne(pool: NbaPlayer[], locks: NbaPlayer[], rng: () => number, contest: NbaContest): NbaLineup | null {
  const used = new Set<string>();
  const chosen: { slot: NbaSlot; player: NbaPlayer }[] = [];
  let salary = 0;
  const lockByPos: Partial<Record<NbaPos, NbaPlayer[]>> = {};
  for (const p of locks) {
    (lockByPos[p.position] ??= []).push(p);
  }
  for (let i = 0; i < NBA_ROSTER.length; i++) {
    const slot = NBA_ROSTER[i]!;
    const remaining = NBA_ROSTER.slice(i + 1);
    const leftover = (c: NbaPlayer) => {
      const next = new Set(used);
      next.add(c.id);
      return NBA_CAP - salary - c.salary - remainingMin(remaining, pool, next);
    };
    const lockedFit = (lockByPos[slot.positions[0]!] ?? []).find((p) => !used.has(p.id) && slot.positions.includes(p.position) && leftover(p) >= 0);
    let pick = lockedFit ?? null;
    if (!pick) {
      const candidates = pool.filter((p) => !used.has(p.id) && slot.positions.includes(p.position) && leftover(p) >= 0);
      if (!candidates.length) return null;
      let total = 0;
      const weights = candidates.map((p) => {
        const w = Math.max(0.0001, weight(contest, p, rng));
        total += w;
        return w;
      });
      let r = rng() * total;
      pick = candidates[candidates.length - 1]!;
      for (let j = 0; j < candidates.length; j++) {
        r -= weights[j]!;
        if (r <= 0) {
          pick = candidates[j]!;
          break;
        }
      }
    }
    used.add(pick.id);
    salary += pick.salary;
    chosen.push({ slot: slot.slot, player: pick });
  }
  if (salary > NBA_CAP) return null;
  const projection = chosen.reduce((s, x) => s + x.player.projection, 0);
  return {
    id: "",
    players: chosen,
    salary,
    projection: Math.round(projection * 10) / 10,
    value: Math.round((projection / Math.max(1, salary / 1000)) * 100) / 100,
    remaining: NBA_CAP - salary,
  };
}

function dkCell(p: NbaPlayer): string {
  return `${p.name} (${p.dkId || p.id})`;
}

export function nbaLineupAsDkPaste(lineup: NbaLineup): string {
  return lineup.players.map((lp) => dkCell(lp.player)).join(",");
}

export function nbaLineupsAsDkCsv(lineups: NbaLineup[]): string {
  const header = NBA_ROSTER.map((s) => NBA_SLOT_LABEL[s.slot]).join(",");
  const rows = lineups.map((lu) => lu.players.map((lp) => dkCell(lp.player)).join(","));
  return [header, ...rows].join("\n");
}
