import { ROSTER, SALARY_CAP } from "./constants";
import type { Lineup, Player, Position, RosterSlot } from "./types";
import {
  type ContestStyle,
  FLEX_POS,
  weightedPick,
  remainingMin,
  scorePlayer,
} from "./optimizer-shared";

export function buildOne(
  pool: Player[],
  locks: Player[],
  rng: () => number,
  opts: { stackQb: boolean; valueLean: boolean; contest: ContestStyle },
): Lineup | null {
  const used = new Set<string>();
  const chosen: { slot: RosterSlot; player: Player }[] = [];
  let salary = 0;
  const contest = opts.contest;

  const lockByPos: Partial<Record<Position, Player[]>> = {};
  for (const p of locks) {
    if (used.has(p.id)) continue;
    (lockByPos[p.position] ??= []).push(p);
  }

  const fillOrder = [...ROSTER];
  fillOrder.sort((a, b) => {
    const rank = (s: RosterSlot) =>
      s === "QB" ? 0 : s === "TE" ? 1 : s.startsWith("WR") ? 2 : s.startsWith("RB") ? 3 : s === "FLEX" ? 4 : 5;
    return rank(a.slot) - rank(b.slot);
  });

  let qb: Player | null = null;
  // Cash favors correlated stacks/bring-backs with floor; GPP pushes leverage stacks
  const stackWr = contest === "milly" ? 0.92 : contest === "doubleup" ? 0.58 : contest === "small" ? 0.74 : 0.62;
  const stackFlex = contest === "milly" ? 0.58 : contest === "doubleup" ? 0.28 : contest === "small" ? 0.38 : 0.22;
  const bringBack = contest === "milly" ? 0.42 : contest === "doubleup" ? 0.3 : contest === "small" ? 0.34 : contest === "single" ? 0.14 : 0;

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
        const starters = candidates.filter((p) => p.salary >= 4500 || p.projection >= 12);
        if (starters.length) candidates = starters;
      }

      if (opts.stackQb && qb && (slot.slot.startsWith("WR") || slot.slot === "TE" || slot.slot === "FLEX")) {
        const stack = candidates.filter((p) => p.team === qb!.team && p.position !== "RB");
        const rate = slot.slot === "FLEX" ? stackFlex : stackWr;
        if (stack.length && rng() < rate) candidates = stack;
        else if (bringBack && qb && rng() < bringBack) {
          const back = candidates.filter((p) => p.opponent === qb!.team && p.position !== "QB");
          if (back.length) candidates = back;
        }
      }

      pick = weightedPick(candidates, (p) => scorePlayer(contest, p, rng, opts.valueLean), rng);
    }

    if (!pick) return null;
    used.add(pick.id);
    salary += pick.salary;
    chosen.push({ slot: slot.slot, player: pick });
    if (slot.slot === "QB") qb = pick;
  }

  if (salary > SALARY_CAP) return null;
  if (chosen.length !== 9) return null;

  const swaps = contest === "doubleup" ? 34 : contest === "small" ? 28 : contest === "milly" ? 14 : 18;
  for (let k = 0; k < swaps; k++) {
    const idx = Math.floor(rng() * chosen.length);
    const cur = chosen[idx]!;
    const spec = ROSTER.find((r) => r.slot === cur.slot)!;
    const alt = pool.filter((p) => {
      if (used.has(p.id) && p.id !== cur.player.id) return false;
      if (!spec.positions.includes(p.position)) return false;
      const newSalary = salary - cur.player.salary + p.salary;
      if (newSalary > SALARY_CAP) return false;
      if (contest === "doubleup" || contest === "small") return p.projection > cur.player.projection + 0.25;
      if (contest === "milly") {
        return (
          p.projection > cur.player.projection + 0.6 ||
          (opts.valueLean && p.value > cur.player.value + 0.2) ||
          (p.itFactor && !cur.player.itFactor)
        );
      }
      return p.projection > cur.player.projection + 0.4 || (opts.valueLean && p.value > cur.player.value + 0.15);
    });
    if (!alt.length) continue;
    const next = weightedPick(alt, (p) => p.projection * (contest === "small" || contest === "doubleup" ? 1 : p.value), rng);
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
    const opp = ordered.filter((c) => c.player.opponent === qbPlayer.team && c.player.id !== qbPlayer.id);
    if (opp.length && (contest === "milly" || contest === "doubleup" || contest === "small")) {
      stacks.push(`bring-back ${opp[0]!.player.team}`);
    }
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
