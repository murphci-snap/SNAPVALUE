import { emptyGradeHint, ledgerSummary, loadStampedBets, type GradedBet } from "@/lib/dfs/bet-ledger";
import {
  emptyLineupGradeHint,
  lineupLedgerSummary,
  type LineupLedgerEntry,
} from "@/lib/dfs/lineup-ledger";
import { cn } from "@/lib/utils";

function recentLineupWeeks(entries: LineupLedgerEntry[], season: number, current: number) {
  const slots: string[] = [];
  for (let w = Math.max(1, current); w >= 1 && slots.length < 8; w--) {
    const rows = entries.filter(
      (e) =>
        e.sport === "NFL" &&
        e.season === season &&
        e.week === w &&
        (e.verdict === "cash" || e.verdict === "miss"),
    );
    const cash = rows.filter((e) => e.verdict === "cash").length;
    const miss = rows.filter((e) => e.verdict === "miss").length;
    slots.push(rows.length ? `WK${w} ${cash}-${miss}` : `WK${w} empty`);
  }
  return slots;
}

/** Weekly grade card for NFL bet desk — hits by market + units. */
export function BetWeeklyGradeCard({
  bets,
  week,
  season,
  tightenNotes = [],
}: {
  bets: GradedBet[];
  week: number;
  season: number;
  tightenNotes?: string[];
}) {
  const rec = ledgerSummary(bets, week, season);
  const stamped = loadStampedBets({ sport: "NFL", week, season }).length;
  const empty = emptyGradeHint({
    sport: "NFL",
    stampedCount: stamped,
    gradedCount: rec.season.w + rec.season.l,
  });

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
          {empty || "Nothing graded yet. Empty bets are fine — grades fill when games are final."}
        </p>
      )}
      {tightenNotes.length ? (
        <p className="text-ink mt-2 text-xs">{tightenNotes.join(" · ")}</p>
      ) : null}
    </section>
  );
}

/** Weekly grade card for NFL lineup studio — cash vs miss from lineup ledger. */
export function LineupWeeklyGradeCard({
  entries,
  week,
  season,
}: {
  entries: LineupLedgerEntry[];
  week: number;
  season: number;
}) {
  const track = lineupLedgerSummary(entries, week, season, "NFL");
  const byContest: Record<string, { cash: number; miss: number; n: number }> = {};
  for (const e of entries.filter((x) => x.sport === "NFL" && (x.verdict === "cash" || x.verdict === "miss" || x.verdict === "borderline"))) {
    const k = e.contestStyle || "lineup";
    const row = (byContest[k] ??= { cash: 0, miss: 0, n: 0 });
    row.n += 1;
    if (e.verdict === "cash") row.cash += 1;
    if (e.verdict === "miss") row.miss += 1;
  }

  return (
    <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Weekly grade</p>
          <h2 className="display text-2xl leading-none font-semibold">
            {track.week.n === 0 ? `WK ${week} · empty` : `WK ${week} cash ${track.week.cash} · miss ${track.week.miss}`}
            <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
              {track.season.n === 0
                ? "no graded weeks yet"
                : `season ${track.season.cash}-${track.season.miss}${track.season.borderline ? ` · ${track.season.borderline} board` : ""}`}
            </span>
          </h2>
        </div>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {track.season.n ? `${Math.round(track.season.hit * 100)}% cash` : "—"}
        </p>
      </div>
      {track.season.n === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">{emptyLineupGradeHint("NFL")}</p>
      ) : Object.keys(byContest).length ? (
        <p className="text-muted-foreground mt-2 font-mono text-[11px]">
          {Object.entries(byContest)
            .map(([k, v]) => `${k} ${v.cash}c/${v.miss}m`)
            .join(" · ")}
        </p>
      ) : null}
      <p className="text-muted-foreground mt-2 font-mono text-[11px]">
        {recentLineupWeeks(entries, season, week).join(" · ")}
      </p>
      {track.weekRows.length ? (
        <ol className="mt-3 flex flex-col gap-1.5">
          {track.weekRows.slice(0, 6).map((e) => (
            <li key={e.key} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-faint mr-2 font-mono text-[10px] uppercase">{e.contestStyle}</span>
                {e.id}
                <span className="text-muted-foreground">
                  {" "}
                  · proj {e.projection.toFixed(1)}
                  {e.actual != null ? ` · act ${e.actual.toFixed(1)}` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-xs uppercase",
                  e.verdict === "cash" && "text-value",
                  e.verdict === "miss" && "text-warn",
                  e.verdict !== "cash" && e.verdict !== "miss" && "text-muted-foreground",
                )}
              >
                {e.verdict}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
