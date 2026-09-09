import { POSITIONS } from "@/lib/dfs/constants";
import type { Position, SlateData } from "@/lib/dfs/types";
import { cn, ordinal } from "@/lib/utils";

export function DvpBoard({ data }: { data: SlateData }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="display text-xl font-semibold">Defense vs position</h2>
        <p className="text-faint text-[11px] tracking-wide uppercase">Higher rank = softer matchup</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {POSITIONS.map((pos) => (
          <DvpCol key={pos} pos={pos} rows={data.dvp[pos] ?? []} />
        ))}
      </div>
    </section>
  );
}

function DvpCol({
  pos,
  rows,
}: {
  pos: Position;
  rows: SlateData["dvp"][Position];
}) {
  const top = rows.slice(0, 4);
  const tough = [...rows].sort((a, b) => a.rankVsPos - b.rankVsPos).slice(0, 3);
  return (
    <div className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
      <h3 className="display text-lg leading-none font-semibold">{pos}</h3>
      <p className="text-faint mt-1 mb-2 text-[10px] tracking-wide uppercase">Softest this week</p>
      <ol className="flex flex-col gap-1">
        {top.map((d, i) => (
          <li key={d.abbr} className="flex items-center justify-between text-sm">
            <span>
              <span className="text-faint mr-1.5 font-mono text-[11px]">{i + 1}</span>
              {d.abbr}
            </span>
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                d.rankVsPos >= 24 ? "text-value" : "text-muted-foreground",
              )}
            >
              {ordinal(d.rankVsPos)}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-faint mt-3 mb-1 text-[10px] tracking-wide uppercase">Toughest</p>
      <p className="text-muted-foreground text-xs">
        {tough.map((d) => `${d.abbr} ${ordinal(d.rankVsPos)}`).join(" · ")}
      </p>
    </div>
  );
}
