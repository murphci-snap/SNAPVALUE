import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PPR_GROUPS, rankPpr, type PprGroup } from "@/lib/dfs/ppr";
import type { SlateData } from "@/lib/dfs/types";
import { cn, formatPts } from "@/lib/utils";

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
          ESPN-style PPR for this week. Vegas / FanDuel player props when posted, otherwise an average of public
          boards plus Grok. Tape notes are model reads of the market and public chatter on X — not a live scrape of
          any one capper.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
        {PPR_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={cn(
              "h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors duration-150 sm:flex-none",
              group === g.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-card shadow-[var(--shadow-border)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-faint text-[11px] tracking-wide uppercase">
            <tr>
              <th className="px-3 py-3 font-medium">Rk</th>
              <th className="px-3 py-3 font-medium">Player</th>
              <th className="px-3 py-3 font-medium">PPR</th>
              <th className="px-3 py-3 font-medium">Ranked by</th>
              <th className="px-3 py-3 font-medium">Tape</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const p = r.player;
              return (
                <tr key={p.id} className="border-border/70 border-t">
                  <td className="text-faint px-3 py-2.5 font-mono text-xs tabular-nums">{r.rank}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{p.name}</span>
                      {group === "FLEX" && <Badge variant="outline">{p.position}</Badge>}
                      {p.itFactor && <Badge variant="it">IT</Badge>}
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      {p.team} {p.home ? "vs" : "@"} {p.opponent}
                    </p>
                  </td>
                  <td className="px-3 font-mono text-sm tabular-nums">{formatPts(r.ppr)}</td>
                  <td className="text-muted-foreground px-3 text-xs">{r.method}</td>
                  <td className="text-muted-foreground px-3 text-xs">{r.tape}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
