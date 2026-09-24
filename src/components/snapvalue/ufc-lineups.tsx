import { Copy, Download, Lock, RefreshCw, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatAmerican } from "@/lib/dfs/markets";
import { emptyLineupGradeHint, lineupLedgerSummary, loadLineupLedger, recordUfcLineupSnapshots, type LineupLedgerEntry } from "@/lib/dfs/lineup-ledger";
import { generateUfcLineups, UFC_CONTEST_META, ufcLineupAsDkPaste, ufcLineupsAsDkCsv, type UfcContest } from "@/lib/ufc/optimizer";
import type { UfcSlateData } from "@/lib/ufc/types";
import { cn, formatPts, formatSalary } from "@/lib/utils";

export function UfcLineups({
  data,
  locks,
  excludes,
  onToggleLock,
}: {
  data: UfcSlateData;
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
}) {
  const [contest, setContest] = useState<UfcContest>("cash");
  const [seed, setSeed] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LineupLedgerEntry[]>([]);
  const showdown = data.format === "showdown";
  const season = 2026;

  const lineups = useMemo(
    () => (data.salariesPosted ? generateUfcLineups(data.players, 6, seed, { locks, excludes, contest }) : []),
    [data.players, data.salariesPosted, seed, locks, excludes, contest],
  );

  useEffect(() => {
    setLedger(loadLineupLedger());
  }, []);

  useEffect(() => {
    if (!lineups.length) return;
    const next = recordUfcLineupSnapshots({
      lineups,
      eventId: data.eventId,
      season,
      contestStyle: contest,
      format: data.format,
    });
    setLedger(next);
  }, [lineups, data.eventId, data.format, contest]);

  const track = useMemo(
    () => lineupLedgerSummary(ledger, data.eventId, season, "UFC"),
    [ledger, data.eventId],
  );

  function persistThen(next: () => void) {
    if (lineups.length) {
      setLedger(
        recordUfcLineupSnapshots({
          lineups,
          eventId: data.eventId,
          season,
          contestStyle: contest,
          format: data.format,
        }),
      );
    }
    next();
  }

  function copy(id: string, text: string) {
    persistThen(() => {
      void navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1400);
    });
  }

  function exportCsv() {
    persistThen(() => {
      const csv = ufcLineupsAsDkCsv(lineups, showdown);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "snapvalue-ufc-331.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-xs tracking-[0.18em] text-faint uppercase">Lineup lab · UFC 331 main card</p>
          <h2 className="display text-2xl font-semibold">{showdown ? "Captain mode" : "Classic 6"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["cash", "gpp"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContest(c)}
              className={cn("h-11 rounded-md px-3 text-sm", contest === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}
            >
              {UFC_CONTEST_META[c].label}
            </button>
          ))}
          <Button size="sm" onClick={() => setSeed(Date.now())} disabled={!data.salariesPosted}>
            <RefreshCw /> Shuffle
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!lineups.length}>
            <Download /> CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => copy("all", ufcLineupsAsDkCsv(lineups, showdown))} disabled={!lineups.length}>
            <Copy /> {copied === "all" ? "Copied" : "Copy"}
          </Button>
        </div>
      </header>
      <p className="text-muted-foreground text-sm">{UFC_CONTEST_META[contest].blurb}</p>

      <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Track record</p>
            <h3 className="display text-xl leading-none font-semibold">
              Card {data.eventId}
              <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                {track.weekRows.length} stamped · season {track.recent.filter((e) => e.sport === "UFC").length}
              </span>
            </h3>
          </div>
        </div>
        {!track.weekRows.length ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {emptyLineupGradeHint("UFC")}
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-1.5">
            {track.weekRows.slice(0, 5).map((e) => (
              <li key={e.key} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-faint mr-2 font-mono text-[10px] uppercase">{e.contestStyle}</span>
                  {e.id}
                  <span className="text-muted-foreground"> · proj {e.projection.toFixed(1)}</span>
                </span>
                <span className="shrink-0 font-mono text-xs uppercase text-muted-foreground">{e.verdict}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!data.salariesPosted ? (
        <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
          <p className="display text-2xl font-semibold">Salaries not posted</p>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm">
            Cash and GPP shells are ready. Main-card pool is on Players. Shuffle builds 6-fighter $50k lineups the minute DK prices the card.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {lineups.map((lu) => (
          <article key={lu.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="display text-lg font-semibold">{lu.id}</p>
              <p className="font-mono text-sm">
                {formatPts(lu.projection)} · {formatSalary(lu.salary)}
              </p>
            </div>
            <ul className="divide-border divide-y">
              {lu.players.map((lp, i) => {
                const p = lp.player;
                const locked = locks.includes(p.id);
                return (
                  <li key={`${lp.slot}-${p.id}-${i}`} className="flex items-center gap-2 py-1.5">
                    <span className="text-faint w-10 font-mono text-[10px]">{lp.slot}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="text-faint block truncate text-[11px]">
                        {p.salary > 0 ? `${formatSalary(p.salary)} · ` : ""}vs {p.opponent}
                        {p.ml != null ? ` · ${formatAmerican(p.ml)}` : ""} · {p.rounds}rd
                      </span>
                    </span>
                    <button type="button" className="size-9 text-muted-foreground" onClick={() => onToggleLock(p.id)}>
                      {locked ? <Lock className="mx-auto size-3.5 text-value" /> : <Unlock className="mx-auto size-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => copy(lu.id, ufcLineupAsDkPaste(lu))}>
              <Copy /> {copied === lu.id ? "Copied" : "Copy"}
            </Button>
          </article>
        ))}
      </div>
      {data.salariesPosted && lineups.length === 0 ? (
        <p className="text-muted-foreground text-sm">Couldn’t fill a legal 6 under $50k. Unlock someone or shuffle.</p>
      ) : null}
    </section>
  );
}
