import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NFL_ABBR } from "@/lib/dfs/constants";
import { kickoffLabel } from "@/lib/dfs/format-ui";
import { formatPct, formatSpread } from "@/lib/dfs/markets";
import { buildPoolPlan, type PoolKind, type PoolPick, type PoolWatch } from "@/lib/dfs/pools";
import type { Game } from "@/lib/dfs/types";
import { cn } from "@/lib/utils";

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readCount(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const n = Number(window.localStorage.getItem(key));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : fallback;
}

function persist(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

function styleLabel(style: PoolPick["style"]): string {
  if (style === "chalk") return "Floor";
  if (style === "value") return "This week";
  if (style === "contrarian") return "Unique";
  return "Ladder";
}

function WatchRow({ row, tone }: { row: PoolWatch; tone: "value" | "warn" }) {
  return (
    <li className="rounded-lg bg-secondary px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="display text-lg leading-none font-semibold">{row.team}</p>
        <p className={cn("font-mono text-xs tabular-nums", tone === "value" ? "text-value" : "text-warn")}>
          {formatPct(row.rate)}
          {row.spread != null ? ` · ${formatSpread(row.spread)}` : ""}
        </p>
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-snug">{row.why}</p>
    </li>
  );
}

function EntryCard({
  pick,
  kind,
  onLock,
}: {
  pick: PoolPick;
  kind: PoolKind;
  onLock: (team: string) => void;
}) {
  const loc = pick.home ? "vs" : "@";
  const rate = kind === "survivor" ? pick.winProb : pick.loseProb;
  return (
    <article className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
          Ticket {pick.entry} · {styleLabel(pick.style)}
          {pick.late ? " · Late" : ""}
        </p>
        <p className="font-mono text-sm text-value tabular-nums">{formatPct(rate)}</p>
      </div>
      <h3 className="display mt-1 text-3xl leading-none font-semibold">{pick.team}</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        {loc} {pick.opponent}
        {pick.spread != null ? ` · ${formatSpread(pick.spread)}` : ""} · {kickoffLabel(pick.kickoff)}
      </p>
      <p className="mt-3 text-sm leading-snug">{pick.why}</p>
      <p className="text-ink mt-2 text-xs leading-snug">{pick.publicNote}</p>
      {pick.backup && (
        <p className="text-muted-foreground mt-3 border-t border-border pt-2 text-xs">
          Pivot {pick.backup}
          {pick.backupWhy ? ` — ${pick.backupWhy}` : ""}
        </p>
      )}
      <Button variant="secondary" className="mt-3 h-10 w-full" onClick={() => onLock(pick.team)}>
        Mark {pick.team} used
      </Button>
    </article>
  );
}

function PoolBlock({
  kind,
  title,
  kicker,
  games,
  week,
}: {
  kind: PoolKind;
  title: string;
  kicker: string;
  games: Game[];
  week: number;
}) {
  const usedKey = `snapvalue.${kind}.used`;
  const nKey = `snapvalue.${kind}.n`;
  const [entries, setEntries] = useState(3);
  const [used, setUsed] = useState<string[]>([]);

  useEffect(() => {
    setEntries(readCount(nKey, 3));
    setUsed(readList(usedKey));
  }, [nKey, usedKey]);

  useEffect(() => {
    persist(nKey, entries);
  }, [entries, nKey]);
  useEffect(() => {
    persist(usedKey, used);
  }, [used, usedKey]);

  const plan = useMemo(() => buildPoolPlan(kind, games, entries, used, week), [kind, games, entries, used, week]);

  function toggle(team: string) {
    setUsed((prev) => (prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]));
  }

  function lock(team: string) {
    setUsed((prev) => (prev.includes(team) ? prev : [...prev, team]));
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-0.5 max-w-xl text-sm">{kicker}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-faint text-[10px] tracking-[0.16em] uppercase">Tickets</span>
          <Button
            variant="secondary"
            size="icon"
            className="size-10"
            onClick={() => setEntries((n) => Math.max(1, n - 1))}
            aria-label="Fewer tickets"
          >
            <Minus />
          </Button>
          <span className="display w-6 text-center text-2xl">{entries}</span>
          <Button
            variant="secondary"
            size="icon"
            className="size-10"
            onClick={() => setEntries((n) => Math.min(10, n + 1))}
            aria-label="More tickets"
          >
            <Plus />
          </Button>
        </div>
      </div>

      <p className="text-ink mb-3 text-xs">{plan.note}</p>

      {plan.entries.length > 0 ? (
        <div className="mb-5">
          <p className="text-faint mb-2 text-[10px] tracking-[0.16em] uppercase">
            Week {week} plays · Play these this week
          </p>
          <ol className="grid gap-2">
            {plan.entries.slice(0, Math.min(3, plan.entries.length)).map((pick) => {
              const rate = kind === "survivor" ? pick.winProb : pick.loseProb;
              return (
                <li key={`play-${kind}-${pick.entry}`} className="rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-border)]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="display text-2xl leading-none font-semibold">
                      Ticket {pick.entry} · {pick.team}
                    </p>
                    <p className="font-mono text-sm text-value tabular-nums">
                      {formatPct(rate)}
                      {pick.spread != null ? ` · ${formatSpread(pick.spread)}` : ""}
                    </p>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {pick.home ? "vs" : "@"} {pick.opponent} · {kickoffLabel(pick.kickoff)}
                    {pick.late ? " · Late" : ""}
                  </p>
                  <p className="mt-2 text-sm leading-snug">{pick.playWhy}</p>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {plan.hammers.length > 0 ? (
        <div className="mb-4">
          <p className="text-faint mb-2 text-[10px] tracking-[0.16em] uppercase">
            {kind === "survivor" ? "Save these" : "True dogs — do not stack"}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {plan.hammers.map((row) => (
              <WatchRow key={row.team} row={row} tone="value" />
            ))}
          </ul>
        </div>
      ) : null}

      {plan.traps.length > 0 ? (
        <div className="mb-4">
          <p className="text-faint mb-2 text-[10px] tracking-[0.16em] uppercase">Do not play</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {plan.traps.map((row) => (
              <WatchRow key={row.team} row={row} tone="warn" />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-faint mb-2 text-[10px] tracking-[0.16em] uppercase">Already used — tap to fade</p>
      <div className="mb-4 flex flex-wrap gap-1">
        {NFL_ABBR.map((abbr) => {
          const on = used.includes(abbr);
          return (
            <button
              key={abbr}
              type="button"
              onClick={() => toggle(abbr)}
              className={cn(
                "h-9 min-w-11 rounded-md px-2 font-mono text-[11px] transition-colors duration-150",
                on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {abbr}
            </button>
          );
        })}
      </div>

      {plan.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Mark fewer used teams or wait for this week’s lines.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plan.entries.map((pick) => (
            <EntryCard key={`${kind}-${pick.entry}-${pick.team}`} pick={pick} kind={kind} onLock={lock} />
          ))}
        </div>
      )}
    </section>
  );
}

export function PoolStudio({ games, week }: { games: Game[]; week: number }) {
  const early = week <= 2;
  return (
    <div className="flex flex-col gap-12">
      <header>
        <h2 className="display text-2xl leading-none font-semibold">Survivor / Loser</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          {early
            ? `Week ${week}: early season. Don’t sit on every favorite — cash tickets now. Ticket 1 chalk is allowed. True leftover hammers are only the top names still on the bench.`
            : `Two contests, same week. Survivor: pick a winner. Loser: pick a team to lose. Multiple tickets stay unique.`}
        </p>
      </header>
      <div className="grid gap-12 xl:grid-cols-2">
        <PoolBlock
          kind="survivor"
          title="Survivor"
          kicker={
            early
              ? `Week ${week}: Ticket 1 = safest win. Cash it. Save only the top leftover hammers for worse weeks.`
              : `Ticket 1 = safest win. Save true leftover hammers for worse weeks. Skip skinny 3-point favorites.`
          }
          games={games}
          week={week}
        />
        <PoolBlock
          kind="loser"
          title="Loser pool"
          kicker={
            early
              ? `Week ${week}: pick the team most likely to lose. Split tickets. Don’t get cute because it’s early.`
              : `Pick a team to lose. Split games so one upset cannot wipe every entry. Ticket 1 is the heaviest dog.`
          }
          games={games}
          week={week}
        />
      </div>
    </div>
  );
}
