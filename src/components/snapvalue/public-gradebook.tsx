import { useEffect, useMemo, useState } from "react";
import { loadLedger, ledgerSummary, type GradedBet } from "@/lib/dfs/bet-ledger";
import { loadLineupLedger, lineupLedgerSummary, type LineupLedgerEntry } from "@/lib/dfs/lineup-ledger";
import { cn } from "@/lib/utils";

/** Local track record from bet + lineup ledgers — fills after kickoffs / stamped slates. */
export function PublicGradebook({
  week,
  season,
  compact = false,
}: {
  week?: number;
  season?: number;
  compact?: boolean;
}) {
  const [bets, setBets] = useState<GradedBet[]>([]);
  const [lineups, setLineups] = useState<LineupLedgerEntry[]>([]);

  useEffect(() => {
    setBets(loadLedger());
    setLineups(loadLineupLedger());
  }, [week, season]);

  const wk = week ?? 0;
  const yr = season ?? 0;
  const betRec = useMemo(() => (wk && yr ? ledgerSummary(bets, wk, yr) : null), [bets, wk, yr]);
  const luRec = useMemo(
    () => (wk && yr ? lineupLedgerSummary(lineups, wk, yr, "NFL") : null),
    [lineups, wk, yr],
  );

  const weekRows = useMemo(() => {
    const byWeek = new Map<string, { week: number; season: number; betW: number; betL: number; cash: number; miss: number }>();
    for (const b of bets) {
      if (b.result !== "win" && b.result !== "loss") continue;
      const key = `${b.season}-${b.week}`;
      const row = byWeek.get(key) ?? { week: b.week, season: b.season, betW: 0, betL: 0, cash: 0, miss: 0 };
      if (b.result === "win") row.betW += 1;
      else row.betL += 1;
      byWeek.set(key, row);
    }
    for (const e of lineups) {
      if (e.sport !== "NFL") continue;
      if (e.verdict !== "cash" && e.verdict !== "miss") continue;
      const key = `${e.season}-${e.week}`;
      const row = byWeek.get(key) ?? { week: e.week, season: e.season, betW: 0, betL: 0, cash: 0, miss: 0 };
      if (e.verdict === "cash") row.cash += 1;
      else row.miss += 1;
      byWeek.set(key, row);
    }
    return [...byWeek.values()].sort((a, b) => b.season - a.season || b.week - a.week).slice(0, 8);
  }, [bets, lineups]);

  const hasAny =
    (betRec && betRec.season.w + betRec.season.l > 0) ||
    (luRec && luRec.season.n > 0) ||
    weekRows.length > 0;

  if (compact) {
    return (
      <p className="text-muted-foreground rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed">
        {hasAny ? (
          <>
            Track record: bets{" "}
            <span className="font-mono tabular-nums">
              {betRec ? `${betRec.season.w}-${betRec.season.l}` : "0-0"}
            </span>
            {luRec && luRec.season.n > 0 ? (
              <>
                {" "}
                · lineups cash{" "}
                <span className="font-mono tabular-nums">
                  {luRec.season.cash}-{luRec.season.miss}
                </span>
              </>
            ) : null}
            . Empty weeks stay empty until kickoffs / stamped slates.
          </>
        ) : (
          <>Track record fills after kickoffs / stamped slates. 0–0 means nothing graded yet — not a dead model.</>
        )}
      </p>
    );
  }

  return (
    <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Public gradebook</p>
          <h2 className="display text-xl leading-none font-semibold">Local track record</h2>
        </div>
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {betRec ? (
            <>
              bets {betRec.season.w}-{betRec.season.l}
              {betRec.season.w + betRec.season.l
                ? ` · ${Math.round(betRec.season.hit * 100)}%`
                : ""}
            </>
          ) : (
            "bets —"
          )}
          {luRec ? (
            <>
              {" "}
              · LU {luRec.season.cash}c/{luRec.season.miss}m
            </>
          ) : null}
        </p>
      </div>
      {!hasAny ? (
        <p className="text-muted-foreground mt-2 text-xs">
          No stamped slate yet — grades appear after lock. Track record fills after kickoffs.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5">
          {weekRows.map((r) => {
            const empty = r.betW + r.betL + r.cash + r.miss === 0;
            return (
              <li key={`${r.season}-${r.week}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="display text-sm font-semibold">WK {r.week}</span>
                <span className={cn("font-mono text-xs tabular-nums", empty && "text-faint")}>
                  {empty
                    ? "empty — no grades"
                    : `bets ${r.betW}-${r.betL}${r.cash + r.miss ? ` · LU ${r.cash}c/${r.miss}m` : ""}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
