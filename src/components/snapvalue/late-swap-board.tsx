import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { buildLateSwap, writeInjurySnap, type InjuryKind } from "@/lib/dfs/late-swap";
import type { Player } from "@/lib/dfs/types";
import { formatPts, formatSalary } from "@/lib/utils";

function kindLabel(k: InjuryKind): string {
  if (k === "cleared") return "Back";
  if (k === "q") return "Q";
  if (k === "doubtful") return "D";
  if (k === "ir") return "IR";
  return "OUT";
}

export function LateSwapBoard({
  players,
  locks,
  week,
  draftGroupId,
}: {
  players: Player[];
  locks: string[];
  week: number;
  draftGroupId: number;
}) {
  const snapKey = `${week}-${draftGroupId}`;
  const alerts = useMemo(() => buildLateSwap(players, locks, snapKey), [players, locks, snapKey]);

  useEffect(() => {
    writeInjurySnap(snapKey, players);
  }, [snapKey, players]);

  if (!alerts.length) return null;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="display text-xl font-semibold">Late swap</h2>
        <p className="text-faint text-[10px] tracking-[0.16em] uppercase">{alerts.length} tags</p>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">Status that can break a lock. Expensive OUT first.</p>
      <ol className="flex flex-col gap-2">
        {alerts.map((a) => (
          <li
            key={a.player.id}
            className="flex items-start gap-2 rounded-xl bg-card px-3 py-2.5 shadow-[var(--shadow-border)]"
          >
            <Badge variant={a.kind === "cleared" ? "value" : a.kind === "q" ? "hot" : "warn"}>
              {kindLabel(a.kind)}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {a.player.name}
                <span className="text-muted-foreground"> {a.player.position} · {a.player.team}</span>
                {a.delta ? <span className="text-hot"> · changed</span> : null}
                {a.locked ? <span className="text-value"> · locked</span> : null}
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[11px] tabular-nums">
                {formatSalary(a.player.salary)} · proj {formatPts(a.player.projection)}
                {a.prior !== "—" ? ` · was ${a.prior}` : ""}
              </p>
              {(a.bumpValue.length || a.bumpBargain.length) && a.kind !== "cleared" ? (
                <p className="text-faint mt-1 text-[11px]">
                  {a.bumpValue.length ? `Value bump: ${a.bumpValue.join(", ")}` : ""}
                  {a.bumpValue.length && a.bumpBargain.length ? " · " : ""}
                  {a.bumpBargain.length ? `Bargain: ${a.bumpBargain.join(", ")}` : ""}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}