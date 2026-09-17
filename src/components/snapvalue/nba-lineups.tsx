import { Copy, Download, Lock, RefreshCw, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NBA_SLOT_LABEL } from "@/lib/nba/constants";
import { generateNbaLineups, nbaLineupAsDkPaste, nbaLineupsAsDkCsv, NBA_CONTEST_META, type NbaContest } from "@/lib/nba/optimizer";
import type { NbaSlateData } from "@/lib/nba/types";
import { cn, formatPts, formatSalary, playerSpotLine } from "@/lib/utils";

export function NbaLineups({
  data,
  locks,
  excludes,
  onToggleLock,
}: {
  data: NbaSlateData;
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
}) {
  const [contest, setContest] = useState<NbaContest>("cash");
  const [seed, setSeed] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const count = 6;

  const lineups = useMemo(
    () => generateNbaLineups(data.players, count, seed, { locks, excludes, contest }),
    [data.players, count, seed, locks, excludes, contest],
  );

  function copy(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1400);
  }

  function exportCsv() {
    const csv = nbaLineupsAsDkCsv(lineups);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "snapvalue-nba-classic.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-xs tracking-[0.18em] text-faint uppercase">Lineup lab · NBA</p>
          <h2 className="display text-2xl font-semibold">Random optimum</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["cash", "gpp"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContest(c)}
              className={cn(
                "h-11 rounded-md px-3 text-sm",
                contest === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {NBA_CONTEST_META[c].label}
            </button>
          ))}
          <Button size="sm" onClick={() => setSeed(Date.now())}>
            <RefreshCw /> Shuffle
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download /> CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => copy("all", nbaLineupsAsDkCsv(lineups))}
          >
            <Copy /> {copied === "all" ? "Copied" : "Copy"}
          </Button>
        </div>
      </header>
      <p className="text-muted-foreground text-sm">{NBA_CONTEST_META[contest].blurb}</p>
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
              {lu.players.map((lp) => {
                const locked = locks.includes(lp.player.id);
                return (
                  <li key={lp.slot} className="flex items-center gap-2 py-1.5">
                    <span className="text-faint w-10 font-mono text-[10px]">{NBA_SLOT_LABEL[lp.slot]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{lp.player.name}</span>
                      <span className="text-faint block truncate text-[11px]">{playerSpotLine(lp.player, { games: data.games })}</span>
                    </span>
                    <span className="w-12 text-right font-mono text-xs">{formatSalary(lp.player.salary)}</span>
                    <button type="button" className="size-9 text-muted-foreground" onClick={() => onToggleLock(lp.player.id)}>
                      {locked ? <Lock className="mx-auto size-3.5 text-value" /> : <Unlock className="mx-auto size-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => copy(lu.id, nbaLineupAsDkPaste(lu))}>
              <Copy /> {copied === lu.id ? "Copied" : "Copy"}
            </Button>
          </article>
        ))}
      </div>
      {lineups.length === 0 ? <p className="text-muted-foreground text-sm">Need a DK Classic player pool to build lineups.</p> : null}
    </section>
  );
}
