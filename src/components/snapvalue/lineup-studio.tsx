import { Copy, Download, Lock, RefreshCw, Sparkles, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reviewLineup, slateReviewReady, type CashVerdict } from "@/lib/dfs/cash-review";
import { CONTEST_META, generateLineups, lineupAsDkPaste, lineupsAsDkCsv, type ContestStyle } from "@/lib/dfs/optimizer";
import { SLOT_LABEL } from "@/lib/dfs/constants";
import type { Game, Lineup, Player, SlateFormat } from "@/lib/dfs/types";
import { cn, formatPts, formatSalary, formatUsd, playerSpotLine } from "@/lib/utils";

const CLASSIC_CONTESTS: ContestStyle[] = ["single", "milly", "small", "doubleup"];
const SHOWDOWN_CONTESTS: ContestStyle[] = ["doubleup", "milly"];

function VerdictBadge({ verdict }: { verdict: CashVerdict }) {
  if (verdict === "cash") return <Badge variant="value">Cash</Badge>;
  if (verdict === "miss") return <Badge variant="warn">Miss</Badge>;
  if (verdict === "borderline") return <Badge variant="hot">Borderline</Badge>;
  if (verdict === "live") return <Badge variant="outline">Live</Badge>;
  return <Badge variant="outline">TBD</Badge>;
}

export function LineupStudio({
  players,
  games = [],
  locks,
  excludes,
  onToggleLock,
  format = "classic",
}: {
  players: Player[];
  games?: Game[];
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
  format?: SlateFormat;
}) {
  const [count, setCount] = useState(6);
  const [stack, setStack] = useState(true);
  const [contest, setContest] = useState<ContestStyle>("single");
  const [seed, setSeed] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const reviewDefault = useMemo(() => slateReviewReady(players), [players]);
  const [reviewOn, setReviewOn] = useState(reviewDefault);
  const showdown = format === "showdown";
  const contests = showdown ? SHOWDOWN_CONTESTS : CLASSIC_CONTESTS;
  const activeContest = showdown && contest !== "doubleup" && contest !== "milly" ? "doubleup" : contest;
  const gameCount = games.length || new Set(players.map((p) => p.gameName).filter(Boolean)).size || 13;

  const lineups = useMemo(
    () =>
      generateLineups(players, count, seed, {
        stackQb: stack && !showdown,
        locks,
        excludes,
        contest: activeContest,
        format,
      }),
    [players, count, seed, stack, locks, excludes, activeContest, format, showdown],
  );

  function copy(lineup: Lineup) {
    void navigator.clipboard.writeText(lineupAsDkPaste(lineup, format));
    setCopied(lineup.id);
    window.setTimeout(() => setCopied(null), 1400);
  }

  function copyAll() {
    const csv = lineupsAsDkCsv(lineups, format);
    void navigator.clipboard.writeText(csv);
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1400);
  }

  function exportCsv() {
    const csv = lineupsAsDkCsv(lineups, format);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `snapvalue-${showdown ? "showdown" : "classic"}-wk.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
          {showdown ? null : (
          <Button
            variant={stack ? "value" : "secondary"}
            size="sm"
            onClick={() => setStack((s) => !s)}
          >
            {stack ? "QB stack on" : "QB stack off"}
          </Button>
          )}
          <Button size="sm" onClick={() => setSeed(Date.now())}>
            <RefreshCw />
            Shuffle
          </Button>
          {lineups.length ? (
            <>
              <Button variant="secondary" size="sm" onClick={exportCsv}>
                <Download />
                CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={copyAll}>
                <Copy />
                {copiedAll ? "Copied" : "Copy all"}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div>
        <p className="text-faint mb-1.5 text-[10px] tracking-[0.16em] uppercase">Contest</p>
        <div className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
          {contests.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setContest(id);
                setSeed((s) => s + 1);
              }}
              className={cn(
                "h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors duration-150 sm:flex-none",
                activeContest === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {showdown && id === "doubleup" ? "Chalk CPT" : showdown && id === "milly" ? "GPP CPT" : CONTEST_META[id].label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          {showdown
            ? activeContest === "milly"
              ? "Showdown GPP: leverage captain, unique UTIL. CPT scores 1.5×. $50k."
              : "Showdown cash: chalk captain, spend the cap, high floors. CPT scores 1.5×. $50k."
            : CONTEST_META[activeContest].blurb}
        </p>
      </div>

      {reviewDefault ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setReviewOn((v) => !v)}
            className={cn(
              "h-11 rounded-md px-3 text-sm font-medium shadow-[var(--shadow-border)]",
              reviewOn ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {reviewOn ? "Post-slate review on" : "Would these have cashed?"}
          </button>
          {reviewOn ? (
            <p className="text-muted-foreground max-w-xl text-xs">
              Actuals from ESPN box scored as DK. Cash line is an estimate, not an official DraftKings payout.
            </p>
          ) : null}
        </div>
      ) : null}

      {locks.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {locks.length} locked · optimizer fills around them
        </p>
      )}

      {lineups.length === 0 ? (
        <div className="rounded-xl bg-card px-4 py-8 text-center shadow-[var(--shadow-border)]">
          <p className="text-muted-foreground text-sm">
            Not enough viable players to fill a $50k {showdown ? "Showdown" : "Classic"} roster. Unlock a few or widen the slate.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lineups.map((lu, i) => {
            const rev = reviewOn ? reviewLineup(lu, activeContest, format, gameCount) : null;
            return (
            <article
              key={lu.id}
              className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="display text-lg font-semibold">{lu.id}</span>
                  <Badge variant="outline">
                    {showdown ? (activeContest === "milly" ? "GPP CPT" : "Chalk CPT") : CONTEST_META[activeContest].label}
                  </Badge>
                  {rev ? <VerdictBadge verdict={rev.verdict} /> : null}
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
              <div className="mb-2 flex flex-wrap gap-3 font-mono text-xs tabular-nums">
                <span>
                  <span className="text-faint">PROJ </span>
                  {formatPts(lu.projection)}
                </span>
                {rev?.actual != null ? (
                  <span>
                    <span className="text-faint">ACT </span>
                    <span className={cn(rev.verdict === "cash" && "text-value", rev.verdict === "miss" && "text-warn")}>
                      {formatPts(rev.actual)}
                    </span>
                    {rev.delta != null ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({rev.delta > 0 ? "+" : ""}
                        {rev.delta.toFixed(1)})
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <span>
                  <span className="text-faint">SAL </span>
                  {formatUsd(lu.salary)}
                </span>
                <span className="text-value">{formatUsd(lu.remaining)} left</span>
              </div>
              {rev && reviewOn ? (
                <p className="text-muted-foreground mb-2 text-[11px]">
                  {rev.scored}/{rev.roster} scored
                  {rev.live ? ` · ${rev.live} live` : ""}
                  {rev.pending ? ` · ${rev.pending} still to play` : ""}
                  {" · "}
                  {rev.lineLabel} {formatPts(rev.line)}
                </p>
              ) : null}
              <ul className="divide-border divide-y">
                {lu.players.map((lp) => {
                  const locked = locks.includes(lp.player.id);
                  const act =
                    lp.player.actualDk == null
                      ? null
                      : lp.slot === "CPT"
                        ? lp.player.actualDk * 1.5
                        : lp.player.actualDk;
                  return (
                    <li key={lp.slot} className="flex items-center gap-2 py-1.5">
                      <span className="text-faint w-10 shrink-0 font-mono text-[10px] tracking-wide">
                        {SLOT_LABEL[lp.slot]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {lp.player.name}
                          <span className="text-muted-foreground"> {lp.player.team}</span>
                          {lp.slot === "CPT" ? <span className="text-value"> · 1.5×</span> : null}
                        </span>
                        <span className="text-faint block truncate text-[11px]">{playerSpotLine(lp.player, { games })}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatPts(lp.player.projection)}
                      </span>
                      {reviewOn ? (
                        <span className="w-10 text-right font-mono text-xs tabular-nums">
                          {act == null ? "—" : formatPts(act)}
                        </span>
                      ) : null}
                      <span className="w-12 text-right font-mono text-xs tabular-nums">
                        {formatSalary(lp.player.salary)}
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
            );
          })}
        </div>
      )}

      <p className="text-faint flex items-center gap-1.5 text-[11px]">
        <Sparkles className="size-3" />
        {showdown
          ? "Showdown: one Captain at 1.5× salary and points, five UTIL. Not advice."
          : activeContest === "milly"
            ? "GPP build: stacks, bring-backs, and bargain-bin darts. Not advice."
            : activeContest === "small"
              ? "Small-field build: floor first, spend the cap. Not advice."
              : activeContest === "doubleup"
                ? "Double Up: chalk, floors, spend the cap. Not advice."
                : "Single-entry build: one core plus a leverage piece. Not advice."}
      </p>
    </section>
  );
}
