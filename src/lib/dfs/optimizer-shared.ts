import type { Player, Position, RosterSlot } from "./types";

export type ContestStyle = "single" | "milly" | "small" | "doubleup";

export const FLEX_POS = new Set<Position>(["RB", "WR", "TE"]);

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
    blurb: "Huge GPP. Ceiling, leverage / low-own, stacks, bring-backs, unique darts.",
  },
  small: {
    label: "≤30 entries",
    blurb: "Tiny field. Correlated stacks with floor, spend the cap, skip long-shot uniques.",
  },
  doubleup: {
    label: "Double Up",
    blurb: "Cash / 50-50. High floors, correlated stacks / bring-backs, spend the cap.",
  },
};

export function weightedPick(items: Player[], weight: (p: Player) => number, rng: () => number): Player | null {
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

export function remainingMin(
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

function ownMul(style: ContestStyle, p: Player): number {
  const o = (p.ownership ?? 12) / 100;
  // GPP: push leverage / low-own harder
  if (style === "milly") return clampOwn(1.22 - o * 0.95);
  // Cash: mild chalk comfort, still leave room for correlated mid-owns
  if (style === "doubleup" || style === "small") return clampOwn(0.92 + o * 0.38);
  return clampOwn(1.05 - o * 0.28);
}

function clampOwn(n: number): number {
  return Math.max(0.62, Math.min(1.28, n));
}

export function scorePlayer(style: ContestStyle, p: Player, rng: () => number, valueLean: boolean): number {
  const matchup = p.oppRank >= 20 ? 1.12 : p.oppRank <= 8 ? 0.88 : 1;
  const it = p.itFactor ? 1.14 : 1;
  const own = ownMul(style, p);
  if (style === "doubleup") {
    const sal = p.salary >= 6500 ? 1.22 : p.salary < 4200 ? 0.52 : 1;
    const dart = p.cheapImpact ? 0.62 : 1;
    const floor = p.projection >= 12 ? 1.08 : 1;
    return p.projection ** 1.95 * matchup * it * sal * dart * floor * own * (0.94 + rng() * 0.08);
  }
  if (style === "small") {
    const sal = p.salary >= 7000 ? 1.18 : p.salary < 4000 ? 0.78 : 1;
    const floor = p.projection >= 11 ? 1.06 : 1;
    return p.projection ** 1.72 * matchup * it * sal * floor * own * (0.92 + rng() * 0.14);
  }
  if (style === "milly") {
    const ceil = p.itFactor ? 1.25 : 1;
    const dart = p.cheapImpact ? 1.42 : 1;
    const fadeChalk = p.salary >= 8500 ? 0.86 : 1;
    const lev = (p.ownership ?? 12) <= 10 ? 1.12 : (p.ownership ?? 12) >= 22 ? 0.88 : 1;
    const mix = valueLean ? p.value ** 1.45 * Math.max(p.projection, 5) : p.projection ** 1.18;
    return mix * matchup * ceil * dart * fadeChalk * lev * own * (0.5 + rng() * 0.95);
  }
  const dart = p.cheapImpact ? 1.16 : 1;
  const core = valueLean ? p.value ** 1.28 * Math.max(p.projection, 5) * dart : p.projection ** 1.42 * it;
  return core * matchup * own * (0.78 + rng() * 0.4);
}
