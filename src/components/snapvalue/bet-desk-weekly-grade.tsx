import { useMemo, useState } from "react";
import { ledgerSummary, type GradedBet, type PublicLeg } from "@/lib/dfs/bet-ledger";
import type { PublicWeek } from "@/lib/dfs/types";

export function BetDeskWeeklyGrade({
  ledger,
  week,
  season,
  tightenNotes,
  live = [],
  survivor = null,
  history = [],
}: {
  ledger: GradedBet[];
  week: number;
  season: number;
  tightenNotes: string[];
  live?: PublicLeg[];
  survivor?: string | null;
  history?: PublicWeek[];
}) {
  const [open, setOpen] = useState(false);
  const rec = useMemo(() => ledgerSummary(ledger, week, season), [ledger, week, season]);
  const publicLabel = useMemo(() => {
    const wins = live.filter((l) => l.result === "win").length + (survivor?.endsWith("win") ? 1 : 0);
    const losses = live.filter((l) => l.result === "loss").length + (survivor?.endsWith("loss") ? 1 : 0);
    const openN = live.filter((l) => l.result === "open").length + (survivor?.endsWith("open") ? 1 : 0);
    const label = wins + losses > 0 ? `${wins}-${losses}` : openN ? "open" : "not published";
    return { wins, losses, openN, label };
  }, [live, survivor]);
  const slots = useMemo(() => {
    const by = new Map(history.map((h) => [h.week, h.w + h.l > 0 ? `${h.w}-${h.l}` : h.open > 0 ? "open" : "not published"]));
    by.set(week, publicLabel.label);
    const out: string[] = [];
    for (let w = week; w >= 1 && out.length < 8; w--) out.push(`WK${w} ${by.get(w) ?? "not published"}`);
    return out;
  }, [history, week, publicLabel.label]);

  return (
    <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Public card</p>
          <h2 className="display text-2xl leading-none font-semibold">
            {`WK ${week} · ${publicLabel.label}`}
            <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">same slate for everyone</span>
          </h2>
        </div>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {publicLabel.wins + publicLabel.losses ? `${publicLabel.wins}-${publicLabel.losses}` : "—"}
          {publicLabel.openN ? ` · ${publicLabel.openN} open` : ""}
        </p>
      </div>
      {survivor ? <p className="text-muted-foreground mt-2 text-sm">Survivor ticket 1 · {survivor}</p> : null}
      <p className="text-muted-foreground mt-2 font-mono text-[11px]">{slots.join(" · ")}</p>
      <p className="text-faint mt-2 text-[11px]">
        On this device:{" "}
        {rec.season.w + rec.season.l === 0 ? "nothing graded yet" : `${rec.season.w}-${rec.season.l} · ${rec.season.units >= 0 ? "+" : ""}${rec.season.units.toFixed(2)}u`}
      </p>
      {tightenNotes.length ? (
        <p className="text-ink mt-2 text-xs">{tightenNotes.join(" · ")}</p>
      ) : null}
      {rec.weekRows.length ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-faint mt-3 text-xs tracking-wide uppercase"
        >
          {open ? "Hide week" : "This week’s grades"}
        </button>
      ) : null}
      {open ? (
        <ol className="mt-3 flex flex-col gap-1.5">
          {rec.weekRows.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-faint mr-2 font-mono text-[10px] uppercase">{b.market}</span>
                {b.pick}
              </span>
              <span
                className={`shrink-0 font-mono text-xs tabular-nums ${b.result === "win" ? "text-value" : b.result === "loss" ? "text-warn" : "text-muted-foreground"}`}
              >
                {b.result} {b.pnl > 0 ? "+" : ""}
                {b.pnl.toFixed(2)}u
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
