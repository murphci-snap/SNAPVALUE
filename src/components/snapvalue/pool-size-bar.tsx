import { useEffect, useState } from "react";
import type { PoolSize } from "@/lib/dfs/pools";
import { cn } from "@/lib/utils";

const POOL_SIZES: { id: PoolSize; label: string; blurb: string }[] = [
  { id: "small", label: "Small", blurb: "Chalkier Ticket 1 · lighter uniqueness" },
  { id: "medium", label: "Medium", blurb: "Baseline public curve" },
  { id: "large", label: "Large", blurb: "Steeper chalk penalties · uniqueness / hammer reserve" },
];

function persist(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export function usePoolSize(season: number): [PoolSize, (s: PoolSize) => void] {
  const sizeKey = `snapvalue.poolSize.${season}`;
  const [poolSize, setPoolSize] = useState<PoolSize>("medium");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(sizeKey);
    if (raw === "small" || raw === "medium" || raw === "large") setPoolSize(raw);
  }, [sizeKey]);
  useEffect(() => {
    persist(sizeKey, poolSize);
  }, [poolSize, sizeKey]);
  return [poolSize, setPoolSize];
}

export function PoolSizeBar({ poolSize, setPoolSize }: { poolSize: PoolSize; setPoolSize: (s: PoolSize) => void }) {
  return (
    <div className="mt-3">
      <p className="text-faint mb-1.5 text-[10px] tracking-[0.16em] uppercase">Pool size</p>
      <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
        {POOL_SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPoolSize(s.id)}
            className={cn(
              "h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors duration-150 sm:flex-none",
              poolSize === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            title={s.blurb}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">{POOL_SIZES.find((s) => s.id === poolSize)?.blurb}</p>
    </div>
  );
}
