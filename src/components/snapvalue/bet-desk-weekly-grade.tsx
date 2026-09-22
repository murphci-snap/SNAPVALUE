import { useMemo, useState } from "react";
import { emptyGradeHint, ledgerSummary, loadStampedBets, type GradedBet } from "@/lib/dfs/bet-ledger";

export function BetDeskWeeklyGrade({
  ledger,
  week,
  season,
  tightenNotes,
}: {
  ledger: GradedBet[];
  week: number;
  season: number;
  tightenNotes: string[];
}) {
  const [open, setOpen] = useState(false);
  const rec = useMemo(() => ledgerSummary(ledger, week, season), [ledger, week, season]);

  return (
    <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Weekly grade</p>
          <h2 className="display text-2xl leading-none font-semibold">
            WK {week} {rec.week.w}-{rec.week.l}
            <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
              season {rec.season.w}-{rec.season.l}
            </span>
          </h2>
        </div>
        <p className="font-mono text-sm tabular-nums">
          <span className={rec.week.units >= 0 ? "text-value" : "text-warn"}>
            wk {rec.week.units >= 0 ? "+" : ""}
            {rec.week.units.toFixed(2)}u
          </span>
          <span className="text-muted-foreground"> · season </span>
          <span className={rec.season.units >= 0 ? "text-value" : "text-warn"}>
            {rec.season.units >= 0 ? "+" : ""}
            {rec.season.units.toFixed(2)}u
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {rec.season.w + rec.season.l ? `${Math.round(rec.season.hit * 100)}%` : "—"} hit
          </span>
        </p>
      </div>
      {Object.keys(rec.byMarket).length ? (
        <p className="text-muted-foreground mt-2 font-mono text-[11px]">
          {Object.entries(rec.byMarket)
            .map(([k, v]) => `${k} ${v.w}-${v.l} (${v.units >= 0 ? "+" : ""}${v.units.toFixed(1)}u)`)
            .join(" · ")}
        </p>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">
          {emptyGradeHint({
            sport: "NFL",
            stampedCount: loadStampedBets({ sport: "NFL", week, season }).length,
            gradedCount: rec.season.w + rec.season.l,
          }) || "Nothing graded yet. Empty bets are fine — grades fill when games are final."}
        </p>
      )}
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
