import { mulberry32 } from "@/lib/utils";
import { ROSTER, SALARY_CAP, SLOT_LABEL } from "./constants";
import type { Lineup, Player, Position, RosterSlot } from "./types";

const FLEX_POS = new Set<Position>(["RB", "WR", "TE"]);

function weightedPick(items: Player[], weight: (p: Player) => number, rng: () => number): Player | null {
  if (items.length === 0) return null;
  let total = 0;
  const weights = items.map((p) => {
    const w = Math.max(0.0001, weight(p));
    total += w;
    return w;
  });
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function remainingMin(
  unfilled: { slot: RosterSlot; positions: Position[] }[],
  pool: Player[],
  used: Set<string>,
): number {
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

function scoreChalk(p: Player, rng: () => number): number {
  const matchup = p.oppRank >= 20 ? 1.12 : p.oppRank <= 8 ? 0.9 : 1;
  const it = p.itFactor ? 1.12 : 1;
  return p.projection ** 1.35 * matchup * it * (0.82 + rng() * 0.36);
}

function scoreValue(p: Player, rng: () => number): number {
  return p.value ** 1.5 * Math.max(p.projection, 4) * (0.75 + rng() * 0.5);
}

export function generateLineups(
  players: Player[],
  count: number,
  seed: number,
  opts?: { stackQb?: boolean; locks?: string[]; excludes?: string[] },
): Lineup[] {
  const stackQb = opts?.stackQb ?? true;
  const lockIds = new Set(opts?.locks ?? []);
  const exclude = new Set(opts?.excludes ?? []);
  const rng = mulberry32(seed);

  const pool = players.filter((p) => {
    if (exclude.has(p.id)) return false;
    if (p.salary <= 0) return false;
    if (/^(out|ir|doubtful|suspended)/i.test(p.status) || /^(out|ir|doubtful)/i.test(p.injury ?? "")) {
      return lockIds.has(p.id);
    }
    const floor = p.position === "DST" ? 3.5 : p.position === "QB" ? 8 : 4.5;
    if (p.position === "QB" && p.isStarter === false && !lockIds.has(p.id)) return false;
    return p.projection >= floor || lockIds.has(p.id);
  });

  const byId = new Map(pool.map((p) => [p.id, p]));
  const locks = [...lockIds].map((id) => byId.get(id)).filter((p): p is Player => !!p);

  const results: Lineup[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (results.length < count && attempts < count * 40) {
    attempts++;
    const valueLean = rng() < 0.42;
    const built = buildOne(pool, locks, rng, { stackQb, valueLean });
    if (!built) continue;
    const key = built.players
      .map((lp) => lp.player.id)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    built.id = `L${results.length + 1}`;
    results.push(built);
  }

  return results.sort((a, b) => b.projection - a.projection);
}

function buildOne(
  pool: Player[],
  locks: Player[],
  rng: () => number,
  opts: { stackQb: boolean; valueLean: boolean },
): Lineup | null {
  const used = new Set<string>();
  const chosen: { slot: RosterSlot; player: Player }[] = [];
  let salary = 0;

  const lockByPos: Partial<Record<Position, Player[]>> = {};
  for (const p of locks) {
    if (used.has(p.id)) continue;
    (lockByPos[p.position] ??= []).push(p);
  }

  const weight = opts.valueLean ? scoreValue : scoreChalk;

  const fillOrder = [...ROSTER];
  // Fill DST later so we spend on skill first, QB first for stacking.
  fillOrder.sort((a, b) => {
    const rank = (s: RosterSlot) =>
      s === "QB" ? 0 : s === "TE" ? 1 : s.startsWith("WR") ? 2 : s.startsWith("RB") ? 3 : s === "FLEX" ? 4 : 5;
    return rank(a.slot) - rank(b.slot);
  });

  let qb: Player | null = null;

  for (let i = 0; i < fillOrder.length; i++) {
    const slot = fillOrder[i]!;
    const remainingSlots = fillOrder.slice(i + 1);
    const lockedFit = (lockByPos[slot.positions[0]!] ?? []).find((p) => {
      if (used.has(p.id)) return false;
      return slot.positions.includes(p.position);
    });

    const leftoverAfterMin = (candidate: Player) => {
      const nextUsed = new Set(used);
      nextUsed.add(candidate.id);
      return SALARY_CAP - salary - candidate.salary - remainingMin(remainingSlots, pool, nextUsed);
    };

    let pick: Player | null = null;

    if (lockedFit && leftoverAfterMin(lockedFit) >= 0) {
      pick = lockedFit;
    } else {
      let candidates = pool.filter((p) => {
        if (used.has(p.id)) return false;
        if (!slot.positions.includes(p.position)) return false;
        return leftoverAfterMin(p) >= 0;
      });

      if (slot.slot === "QB" && candidates.length) {
        // Prefer startable QBs
        candidates = candidates.filter((p) => p.salary >= 4500 || p.projection >= 12) || candidates;
      }

      if (opts.stackQb && qb && (slot.slot.startsWith("WR") || slot.slot === "TE" || slot.slot === "FLEX")) {
        const stack = candidates.filter((p) => p.team === qb!.team && p.position !== "RB");
        if (stack.length && rng() < (slot.slot === "FLEX" ? 0.35 : 0.72)) {
          candidates = stack;
        }
      }

      pick = weightedPick(candidates, (p) => weight(p, rng), rng);
    }

    if (!pick) return null;
    used.add(pick.id);
    salary += pick.salary;
    chosen.push({ slot: slot.slot, player: pick });
    if (slot.slot === "QB") qb = pick;
  }

  if (salary > SALARY_CAP) return null;
  if (chosen.length !== 9) return null;

  // Local improvement: swap same-slot players if projection rises and salary fits.
  for (let k = 0; k < 18; k++) {
    const idx = Math.floor(rng() * chosen.length);
    const cur = chosen[idx]!;
    const spec = ROSTER.find((r) => r.slot === cur.slot)!;
    const alt = pool.filter((p) => {
      if (used.has(p.id) && p.id !== cur.player.id) return false;
      if (!spec.positions.includes(p.position)) return false;
      const newSalary = salary - cur.player.salary + p.salary;
      if (newSalary > SALARY_CAP) return false;
      return p.projection > cur.player.projection + 0.4 || (opts.valueLean && p.value > cur.player.value + 0.15);
    });
    if (!alt.length) continue;
    const next = weightedPick(alt, (p) => p.projection * p.value, rng);
    if (!next || next.id === cur.player.id) continue;
    used.delete(cur.player.id);
    used.add(next.id);
    salary = salary - cur.player.salary + next.salary;
    chosen[idx] = { slot: cur.slot, player: next };
    if (cur.slot === "QB") qb = next;
  }

  const ordered = ROSTER.map((r) => chosen.find((c) => c.slot === r.slot)!).filter(Boolean);
  const projection = ordered.reduce((s, c) => s + c.player.projection, 0);
  const value = ordered.reduce((s, c) => s + c.player.value, 0) / ordered.length;
  const stacks: string[] = [];
  const qbPlayer = ordered.find((c) => c.slot === "QB")?.player;
  if (qbPlayer) {
    const mates = ordered.filter(
      (c) => c.player.team === qbPlayer.team && c.player.id !== qbPlayer.id && FLEX_POS.has(c.player.position),
    );
    if (mates.length) stacks.push(`${qbPlayer.team} ${1 + mates.length}x`);
  }

  return {
    id: "",
    players: ordered,
    salary,
    projection,
    value,
    remaining: SALARY_CAP - salary,
    stacks,
  };
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
