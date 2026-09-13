import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PPR_GROUPS, rankPpr, type PprGroup } from "@/lib/dfs/ppr";
import type { SlateData } from "@/lib/dfs/types";
import { cn, formatPts, formatSalary } from "@/lib/utils";

export function PprBoard({ data }: { data: SlateData }) {
  const [group, setGroup] = useState<PprGroup>("FLEX");
  const rows = useMemo(() => rankPpr(data.players, group), [data.players, group]);
  const shown = rows.slice(0, group === "FLEX" ? 48 : group === "QB" || group === "DST" ? 32 : 40);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header>
        <p className="display text-faint text-xs tracking-[0.18em] uppercase">Season-long · not DFS</p>
        <h2 className="display text-2xl leading-none font-semibold">Weekly PPR ranks</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Full-PPR for this week. Tape is a short model read — not a live scrape.
        </p>
        <p className="text-faint mt-1 text-[11px] tracking-wide uppercase">
          Ranked by props when posted · else Yahoo / CBS / FantasyPros
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
                      {p.itFactor && <Badge variant="it">IT</Badge>}
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      {dst ? (
                        <>
                          vs {p.opponent}
                          {p.salary ? ` · ${formatSalary(p.salary)}` : null}
                        </>
                      ) : (
                        <>
                          {p.team} {p.home ? "vs" : "@"} {p.opponent}
                          {p.salary ? ` · ${formatSalary(p.salary)}` : null}
                          {p.value ? ` · Val ${p.value.toFixed(2)}` : null}
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
