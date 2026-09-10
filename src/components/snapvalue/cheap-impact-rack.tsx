import { CHEAP_IMPACT_POS } from "@/lib/dfs/sleeper";
import type { Player, Position, SlateData } from "@/lib/dfs/types";
import { formatPts, formatSalary } from "@/lib/utils";

export function CheapImpactRack({
  data,
  pos,
  onSelect,
}: {
  data: SlateData;
  pos: Position | "ALL";
  onSelect: (p: Player) => void;
}) {
  const positions = pos === "ALL" ? CHEAP_IMPACT_POS : CHEAP_IMPACT_POS.filter((p) => p === pos);
  const groups = positions.map((p) => ({
    pos: p,
    player: data.players.find((x) => x.position === p && x.cheapImpact) ?? null,
  }));

  if (!groups.length || groups.every((g) => !g.player)) return null;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="display text-xl font-semibold">Under $4k</h2>
        <p className="text-faint text-[11px] tracking-wide uppercase">One dart · RB / WR / TE</p>
      </div>
      <p className="text-muted-foreground mb-3 max-w-2xl text-sm">
        One cheap skill player at each spot who can still swing a Classic lineup — FLEX or the last RB/WR/TE slot
        without breaking the cap.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((group) => {
          const p = group.player;
          return (
            <div key={group.pos} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="display text-lg leading-none font-semibold">{group.pos}</h3>
                <span className="text-value text-[10px] tracking-[0.16em] uppercase">Under $4k</span>
              </div>
              {!p ? (
                <p className="text-muted-foreground text-xs">No cheap impact play this week</p>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="hover:bg-accent flex w-full flex-col rounded-lg px-1 py-1 text-left transition-colors duration-150"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-base font-medium">{p.name}</span>
                    <span className="font-mono text-sm tabular-nums">{formatPts(p.projection)}</span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 text-[11px]">
                    {p.team} {p.home ? "vs" : "@"} {p.opponent} · {formatSalary(p.salary)}
                  </span>
                  {p.cheapImpactWhy && (
                    <span className="text-ink mt-2 text-[11px] leading-snug">{p.cheapImpactWhy}</span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
