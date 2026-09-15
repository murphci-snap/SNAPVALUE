import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PPR_GROUPS, rankPpr, type PprGroup } from "@/lib/dfs/ppr";
import type { SlateData } from "@/lib/dfs/types";
import { cn, formatPts } from "@/lib/utils";

export function PprBoard({ data }: { data: SlateData }) {
  const [group, setGroup] = useState<PprGroup>("FLEX");
  const rows = useMemo(() => rankPpr(data.players, group), [data.players, group]);
  const shown = rows.slice(0, group === "FLEX" ? 48 : group === "QB" || group === "DST" ? 32 : 40);
  const week = data.week || 1;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header>
        <p className="display text-faint text-xs tracking-[0.18em] uppercase">Weekly full-PPR · this week</p>
        <h2 className="display text-2xl leading-none font-semibold">Weekly PPR ranks</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Regular weekly PPR for Week {week} only — not daily fantasy, not rest-of-season. Ranked by this week's
          full-PPR points (props usage when posted, else CBS / FantasyPros). No salary, no Val.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
        {PPR_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={cn(
              "h-11 flex-1 rounded-md px-2 text-sm font-medium transition-colors duration-150 sm:flex-none sm:px-3",
              group === g.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <table className="w-full text-left text-sm">
          <thead className="text-faint text-[11px] tracking-wide uppercase">
            <tr>
              <th className="w-10 px-3 py-2 font-medium">Rk</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-3 py-2 text-right font-medium">PPR</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const p = r.player;
              const dst = p.position === "DST";
              return (
                <tr key={p.id} className="border-border/70 border-t">
                  <td className="text-faint px-3 py-2 font-mono text-xs tabular-nums">{r.rank}</td>
                  <td className="px-2 py-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {group === "FLEX" && <Badge variant="outline">{p.position}</Badge>}
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      {dst ? (
                        <>vs {p.opponent}</>
                      ) : (
                        <>
                          {p.team} {p.home ? "vs" : "@"} {p.opponent}
                        </>
                      )}
                    </p>
                    {r.tape ? <p className="text-faint mt-0.5 text-[11px]">{r.tape}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="display text-lg leading-none font-semibold tabular-nums">{formatPts(r.ppr)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
