import { mulberry32 } from "@/lib/utils";
import { ROSTER, SALARY_CAP, SLOT_LABEL } from "./constants";
import type { Lineup, Player, Position, RosterSlot } from "./types";

export type ContestStyle = "single" | "milly" | "small";

const FLEX_POS = new Set<Position>(["RB", "WR", "TE"]);

export const CONTEST_META: Record<
  ContestStyle,
  { label: string; blurb: string }
> = {
  single: {
    label: "Single entry",
    blurb: "One ticket in a big field. Balanced stars plus one leverage piece. Moderate QB stack.",
  },
  milly: {
    label: "Milly Maker",
    blurb: "Huge GPP. Ceiling, stacks, and unique darts. Fine to leave a little salary if the smash is real.",
  },
  small: {
    label: "≤30 entries",
    blurb: "Tiny field. Play the board: high floor, spend the cap, skip long-shot uniques.",
  },
};

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

function scorePlayer(style: ContestStyle, p: Player, rng: () => number, valueLean: boolean): number {
  const matchup = p.oppRank >= 20 ? 1.12 : p.oppRank <= 8 ? 0.88 : 1;
  const it = p.itFactor ? 1.14 : 1;
  if (style === "small") {
    const sal = p.salary >= 7000 ? 1.18 : p.salary < 4000 ? 0.78 : 1;
    return p.projection ** 1.72 * matchup * it * sal * (0.92 + rng() * 0.14);
  }
  if (style === "milly") {
    const ceil = p.itFactor ? 1.25 : 1;
    const dart = p.cheapImpact ? 1.38 : 1;
    const fadeChalk = p.salary >= 8500 ? 0.9 : 1;
    const mix = valueLean ? p.value ** 1.45 * Math.max(p.projection, 5) : p.projection ** 1.18;
    return mix * matchup * ceil * dart * fadeChalk * (0.5 + rng() * 0.95);
  }
  const dart = p.cheapImpact ? 1.16 : 1;
  const core = valueLean ? p.value ** 1.28 * Math.max(p.projection, 5) * dart : p.projection ** 1.42 * it;
  return core * matchup * (0.78 + rng() * 0.4);
}

export function generateLineups(
  players: Player[],
  count: number,
  seed: number,
  opts?: { stackQb?: boolean; locks?: string[]; excludes?: string[]; contest?: ContestStyle },
): Lineup[] {
  const stackQb = opts?.stackQb ?? true;
  const contest = opts?.contest ?? "single";
  const lockIds = new Set(opts?.locks ?? []);
  const exclude = new Set(opts?.excludes ?? []);
  const rng = mulberry32(seed);

  const qbFloor = contest === "small" ? 12 : contest === "milly" ? 7 : 8;
  const skillFloor = contest === "small" ? 6.5 : contest === "milly" ? 4 : 4.5;

  const pool = players.filter((p) => {
    if (exclude.has(p.id)) return false;
    if (p.salary <= 0) return false;
    if (/^(out|ir|doubtful|suspended)/i.test(p.status) || /^(out|ir|doubtful)/i.test(p.injury ?? "")) {
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
  let attempts = 0;
  const valueRate = contest === "milly" ? 0.55 : contest === "small" ? 0.1 : 0.32;

  while (results.length < count && attempts < count * 48) {
    attempts++;
    const valueLean = rng() < valueRate;
    const built = buildOne(pool, locks, rng, { stackQb, valueLean, contest });
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
  const stackWr = contest === "milly" ? 0.86 : contest === "small" ? 0.42 : 0.7;
  const stackFlex = contest === "milly" ? 0.48 : contest === "small" ? 0.12 : 0.32;

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
        else if (contest === "milly" && qb && rng() < 0.22) {
          const bringBack = candidates.filter((p) => p.opponent === qb!.team && p.position !== "QB");
          if (bringBack.length) candidates = bringBack;
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

  const swaps = contest === "small" ? 28 : contest === "milly" ? 14 : 18;
  for (let k = 0; k < swaps; k++) {
    const idx = Math.floor(rng() * chosen.length);
    const cur = chosen[idx]!;
    const spec = ROSTER.find((r) => r.slot === cur.slot)!;
    const alt = pool.filter((p) => {
      if (used.has(p.id) && p.id !== cur.player.id) return false;
      if (!spec.positions.includes(p.position)) return false;
      const newSalary = salary - cur.player.salary + p.salary;
      if (newSalary > SALARY_CAP) return false;
      if (contest === "small") return p.projection > cur.player.projection + 0.25;
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
    const next = weightedPick(alt, (p) => p.projection * (contest === "small" ? 1 : p.value), rng);
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
    if (contest === "milly" && opp.length) stacks.push(`bring-back ${opp[0]!.player.team}`);
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
