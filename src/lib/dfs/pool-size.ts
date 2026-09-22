/** Field size tilt for survivor/loser public ownership. */
export type PoolSize = "small" | "medium" | "large";

export function poolSizeSteep(size: PoolSize): number {
  if (size === "large") return 1.45;
  if (size === "small") return 0.78;
  return 1;
}

export function poolSizeMods(size: PoolSize) {
  if (size === "large") {
    return { publicPenalty: 1.6, uniqueBonus: 1.4, hammerReserve: 1.45, chalkBoost: 0.82 };
  }
  if (size === "small") {
    return { publicPenalty: 0.55, uniqueBonus: 0.65, hammerReserve: 0.7, chalkBoost: 1.22 };
  }
  return { publicPenalty: 1, uniqueBonus: 1, hammerReserve: 1, chalkBoost: 1 };
}
