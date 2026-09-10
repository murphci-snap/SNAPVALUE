import { POSITIONS } from "@/lib/dfs/constants";
import type { Player, Position, SlateData } from "@/lib/dfs/types";
import { cn, formatPts, formatSalary } from "@/lib/utils";

export function ItFactorRack({
  data,
  pos,
  onSelect,
}: {
  data: SlateData;
  pos: Position | "ALL";
  onSelect: (p: Player) => void;
}) {
  const positions = pos === "ALL" ? POSITIONS : [pos];
  const groups = positions.map((p) => ({
    pos: p,
    players: data.players.filter((x) => x.position === p && x.itFactor).slice(0, 3),
  }));

  if (groups.every((g) => g.players.length === 0)) return null;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="display text-xl font-semibold">IT Factor</h2>
        <p className="text-faint text-[11px] tracking-wide uppercase">Grok + Vegas + X tape · smash weeks</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {groups.map((group) => (
          <div key={group.pos} className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="display text-lg leading-none font-semibold">{group.pos}</h3>
              <span className="text-ink text-[10px] tracking-[0.16em] uppercase">Massive week</span>
            </div>
            <ol className="flex flex-col gap-2">
              {group.players.length === 0 && (
                <li className="text-muted-foreground text-xs">No standout smash spots</li>
              )}
              {group.players.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="hover:bg-accent flex w-full flex-col rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="font-mono text-sm tabular-nums">{formatPts(p.projection)}</span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 text-[11px]">
                      {p.team} {p.home ? "vs" : "@"} {p.opponent} · {formatSalary(p.salary)}
                    </span>
                    {p.itFactorWhy && (
                      <span className={cn("text-ink mt-1 text-[11px] leading-snug")}>{p.itFactorWhy}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
