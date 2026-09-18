import { BARGAIN_TAKE, CHEAP_IMPACT_POS } from "@/lib/dfs/sleeper";
import type { Player, Position, SlateData } from "@/lib/dfs/types";
import { formatPts, playerSpotLine } from "@/lib/utils";
import { CyBadge } from "./cy-badge";

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
    players: data.players.filter((x) => x.position === p && x.cheapImpact).slice(0, BARGAIN_TAKE),
  }));

  if (!groups.length || groups.every((g) => !g.players.length)) return null;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="display text-xl font-semibold">Bargain bin</h2>
        <p className="text-value text-[11px] tracking-[0.16em] uppercase">Bang for the buck</p>
      </div>
      <p className="text-muted-foreground mb-3 max-w-2xl text-sm">
        Cheap bang for the buck. One streaming QB (own slot — not FLEX) plus one cheap RB / WR / TE for FLEX or the
        last skill slot. Overlap with Best Value is OK.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => {
          const p = group.players[0];
          const qb = group.pos === "QB";
          return (
            <div key={group.pos} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="display text-lg leading-none font-semibold">{group.pos}</h3>
                <span className="text-faint text-[10px] tracking-[0.16em] uppercase">
                  {qb ? "Stream" : "FLEX"}
                </span>
              </div>
              {!p ? (
                <p className="text-muted-foreground text-xs">No cheap names on this slate.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="hover:bg-accent flex w-full flex-col rounded-lg px-1 py-1 text-left transition-colors duration-150"
                >
                  <span className="flex items-center gap-1.5 truncate text-base font-medium">
                    {p.name} <CyBadge cy={p.contractYear} />
                  </span>
                  <span className="text-muted-foreground mt-0.5 text-xs">
                    {playerSpotLine(p, { games: data.games })}
                  </span>
                  <span className="mt-3 flex items-end justify-between gap-2">
                    <span>
                      <span className="text-faint block text-[10px] tracking-[0.16em] uppercase">Val · pts/$1k</span>
                      <span className="display text-value text-3xl leading-none font-semibold tabular-nums">
                        {p.value.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="text-faint block text-[10px] tracking-[0.16em] uppercase">Proj</span>
                      <span className="font-mono text-sm tabular-nums">{formatPts(p.projection)}</span>
                    </span>
                  </span>
                  {p.cheapImpactWhy ? (
                    <span className="text-ink mt-2 text-xs leading-snug">{p.cheapImpactWhy}</span>
                  ) : null}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
