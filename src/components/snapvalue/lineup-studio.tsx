import { Copy, Lock, RefreshCw, Sparkles, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateLineups, lineupAsText } from "@/lib/dfs/optimizer";
import { SLOT_LABEL } from "@/lib/dfs/constants";
import type { Lineup, Player } from "@/lib/dfs/types";
import { cn, formatPts, formatUsd } from "@/lib/utils";

export function LineupStudio({
  players,
  locks,
  excludes,
  onToggleLock,
}: {
  players: Player[];
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
}) {
  const [count, setCount] = useState(6);
  const [stack, setStack] = useState(true);
  const [seed, setSeed] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  const lineups = useMemo(
    () => generateLineups(players, count, seed, { stackQb: stack, locks, excludes }),
    [players, count, seed, stack, locks, excludes],
  );

  function copy(lineup: Lineup) {
    void navigator.clipboard.writeText(lineupAsText(lineup));
    setCopied(lineup.id);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-xs tracking-[0.18em] text-faint uppercase">Lineup lab</p>
          <h2 className="display text-2xl leading-none font-semibold">Random optimum</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md bg-secondary p-1 shadow-[var(--shadow-border)]">
            {[4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={cn(
                  "h-9 min-w-11 rounded-sm px-2.5 text-xs font-medium transition-colors duration-150",
                  count === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <Button
            variant={stack ? "value" : "secondary"}
            size="sm"
            onClick={() => setStack((s) => !s)}
          >
            {stack ? "QB stack on" : "QB stack off"}
          </Button>
          <Button
            size="sm"
            onClick={() => setSeed(Date.now())}
          >
            <RefreshCw />
            Shuffle
          </Button>
        </div>
      </header>

      {locks.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {locks.length} locked · optimizer fills around them
        </p>
      )}

      {lineups.length === 0 ? (
        <div className="rounded-xl bg-card px-4 py-8 text-center shadow-[var(--shadow-border)]">
          <p className="text-muted-foreground text-sm">
            Not enough viable players to fill a $50k Classic roster. Unlock a few or widen the slate.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lineups.map((lu, i) => (
            <article
              key={lu.id}
              className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="display text-lg font-semibold">{lu.id}</span>
                  {lu.stacks.map((s) => (
                    <Badge key={s} variant="hot">
                      {s}
                    </Badge>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => copy(lu)}
                  className="text-muted-foreground hover:text-foreground inline-flex h-11 items-center gap-1.5 px-1 text-xs"
                >
                  <Copy className="size-3.5" />
                  {copied === lu.id ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mb-2 flex gap-3 font-mono text-xs tabular-nums">
                <span>
                  <span className="text-faint">PROJ </span>
                  {formatPts(lu.projection)}
                </span>
                <span>
                  <span className="text-faint">SAL </span>
                  {formatUsd(lu.salary)}
                </span>
                <span className="text-value">
                  {formatUsd(lu.remaining)} left
                </span>
              </div>
              <ul className="divide-border divide-y">
                {lu.players.map((lp) => {
                  const locked = locks.includes(lp.player.id);
                  return (
                    <li key={lp.slot} className="flex items-center gap-2 py-1.5">
                      <span className="text-faint w-8 shrink-0 font-mono text-[10px] tracking-wide">
                        {SLOT_LABEL[lp.slot]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {lp.player.name}
                        <span className="text-muted-foreground"> {lp.player.team}</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatPts(lp.player.projection)}
                      </span>
                      <span className="w-10 text-right font-mono text-xs tabular-nums">
                        {(lp.player.salary / 1000).toFixed(1)}
                      </span>
                      <button
                        type="button"
                        aria-label={locked ? "Unlock" : "Lock"}
                        onClick={() => onToggleLock(lp.player.id)}
                        className="text-muted-foreground hover:text-foreground relative size-9"
                      >
                        {locked ? <Lock className="mx-auto size-3.5 text-value" /> : <Unlock className="mx-auto size-3.5" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}

      <p className="text-faint flex items-center gap-1.5 text-[11px]">
        <Sparkles className="size-3" />
        Weighted random search with QB stacks, salary cap, and local swaps. Not advice.
      </p>
    </section>
  );
}
