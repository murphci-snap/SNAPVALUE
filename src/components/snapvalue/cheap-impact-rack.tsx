import { BARGAIN_TAKE, CHEAP_IMPACT_POS } from "@/lib/dfs/sleeper";
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
    players: data.players
      .filter((x) => x.position === p && x.cheapImpact)
      .sort((a, b) => b.value - a.value || a.salary - b.salary)
      .slice(0, BARGAIN_TAKE),
  }));

  if (!groups.length || groups.every((g) => !g.players.length)) return null;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="display text-xl font-semibold">Bargain bin</h2>
        <p className="text-faint text-[11px] tracking-wide uppercase">Pts / $1k · cheap tier</p>
      </div>
      <p className="text-muted-foreground mb-3 max-w-2xl text-sm">
        Cheap salary, still useful in Classic as FLEX or the last skill slot — bang for the buck. Ranked by pts per
        $1k inside the low-pay tier, not by raw projection.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => (
          <div key={group.pos} className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="display text-lg leading-none font-semibold">{group.pos}</h3>
              <span className="text-value text-[10px] tracking-[0.16em] uppercase">Bargain</span>
            </div>
            {group.players.length === 0 ? (
              <p className="text-muted-foreground text-xs">No cheap names on this slate.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {group.players.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(p)}
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left"
                    >
                      <span className="text-faint w-4 font-mono text-xs">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{p.name}</span>
                        <span className="text-muted-foreground text-[11px]">
                          {p.team} {p.home ? "vs" : "@"} {p.opponent} · {formatSalary(p.salary)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="text-value font-mono text-sm tabular-nums">{p.value.toFixed(2)}</span>
                        <span className="text-faint font-mono text-[11px] tabular-nums">{formatPts(p.projection)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
