import { Lock, Unlock, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatAmerican } from "@/lib/dfs/markets";
import { cashScore, gppScore, isCashPlay, isGppPlay } from "@/lib/ufc/scoring";
import type { UfcFighter, UfcLens, UfcSlateData } from "@/lib/ufc/types";
import { cn, formatPts, formatSalary } from "@/lib/utils";

function spot(p: UfcFighter): string {
  const bits: string[] = [];
  if (p.salary > 0) bits.push(formatSalary(p.salary));
  bits.push(`vs ${p.opponent}`);
  bits.push(p.weightClass);
  bits.push(`${p.rounds}rd`);
  if (p.ml != null) bits.push(formatAmerican(p.ml));
  return bits.join(" · ");
}

export function UfcBoard({
  data,
  locks,
  excludes,
  onToggleLock,
  onToggleExclude,
}: {
  data: UfcSlateData;
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
  onToggleExclude: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [lens, setLens] = useState<UfcLens>("all");
  const [valuesOnly, setValuesOnly] = useState(false);
  const [cptOnly, setCptOnly] = useState(false);
  const showdown = data.format === "showdown";

  const filtered = useMemo(() => {
    let list = data.players;
    if (cptOnly) list = list.filter((p) => p.showdownRole === "CPT");
    if (valuesOnly) list = list.filter((p) => p.isValuePlay);
    if (lens === "cash") list = list.filter((p) => isCashPlay(p));
    if (lens === "gpp") list = list.filter((p) => isGppPlay(p));
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.opponent.toLowerCase().includes(query) ||
          p.weightClass.toLowerCase().includes(query),
      );
    }
    return [...list].sort((a, b) => {
      if (showdown && !cptOnly) {
        const ar = a.showdownRole === "CPT" ? 0 : 1;
        const br = b.showdownRole === "CPT" ? 0 : 1;
        if (ar !== br) return ar - br;
      }
      if (lens === "cash") return cashScore(b) - cashScore(a);
      if (lens === "gpp") return gppScore(b) - gppScore(a);
      return b.projection - a.projection;
    });
  }, [data.players, q, lens, valuesOnly, cptOnly, showdown]);

  const rack = [...data.players]
    .filter((p) => p.isValuePlay && p.showdownRole !== "CPT")
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {!data.salariesPosted ? (
        <p className="bg-ink/10 text-ink rounded-xl px-4 py-3 text-sm">Salaries not posted. Rankings use win/method model. Lineups wait on DK prices.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn("inline-flex h-9 items-center rounded-md px-3 text-xs font-medium", lens === "cash" ? "bg-value/15 text-value" : "bg-secondary")}
          onClick={() => setLens(lens === "cash" ? "all" : "cash")}
        >
          Cash
        </button>
        <button
          type="button"
          className={cn("inline-flex h-9 items-center rounded-md px-3 text-xs font-medium", lens === "gpp" ? "bg-primary text-primary-foreground" : "bg-secondary")}
          onClick={() => setLens(lens === "gpp" ? "all" : "gpp")}
        >
          GPP
        </button>
        <button
          type="button"
          className={cn("inline-flex h-9 items-center rounded-md px-3 text-xs font-medium", valuesOnly ? "bg-value/15 text-value" : "bg-secondary")}
          onClick={() => setValuesOnly((v) => !v)}
        >
          Best value only
        </button>
        {showdown ? (
          <button
            type="button"
            className={cn("inline-flex h-9 items-center rounded-md px-3 text-xs font-medium", cptOnly ? "bg-primary text-primary-foreground" : "bg-secondary")}
            onClick={() => setCptOnly((v) => !v)}
          >
            CPT
          </button>
        ) : null}
        <div className="min-w-48 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fighter, opponent, class" aria-label="Search fighters" />
        </div>
      </div>
      {lens !== "all" ? (
        <p className="text-muted-foreground -mt-2 text-sm">
          {lens === "cash" ? "Cash · favorites and decision volume. Win is the points." : "GPP · finish upside. Don’t roster both sides of a 3-round fight."}
        </p>
      ) : null}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="display text-xl font-semibold">Best value</h2>
          <p className="text-value text-[11px] tracking-wide uppercase">Main card · pts / $1k</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rack.length === 0 ? <li className="text-muted-foreground text-sm">No standout values yet.</li> : null}
          {rack.map((p, i) => (
            <li key={p.id} className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
              <p className="text-faint font-mono text-[11px]">{i + 1}</p>
              <p className="display text-lg font-semibold">{p.name}</p>
              <p className="text-muted-foreground text-[11px]">{spot(p)}</p>
              <p className="text-value mt-1 font-mono text-sm tabular-nums">{p.value.toFixed(2)} · {formatPts(p.projection)}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-field text-muted-foreground text-[11px] tracking-wide uppercase">
              <tr>
                <th className="px-3 py-3 font-medium">Fighter</th>
                <th className="px-3 py-3 font-medium">Salary</th>
                <th className="px-3 py-3 font-medium">Proj</th>
                <th className="px-3 py-3 font-medium">Win</th>
                <th className="px-3 py-3 font-medium">KO / Sub / Dec</th>
                <th className="px-3 py-3 font-medium">Val</th>
                <th className="px-3 py-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const locked = locks.includes(p.id);
                const excluded = excludes.includes(p.id);
                return (
                  <tr key={p.id} className={cn("border-border/70 border-t", p.isValuePlay && "bg-value/5", excluded && "opacity-40")}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {p.image ? (
                          <img src={p.image} alt="" className="size-9 rounded-full object-cover" />
                        ) : (
                          <span className="bg-secondary text-muted-foreground flex size-9 items-center justify-center rounded-full font-mono text-[10px]">
                            {p.lastName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-medium">{p.name}</span>
                            {p.showdownRole === "CPT" ? <Badge variant="it">CPT</Badge> : null}
                            {p.isValuePlay ? <Badge variant="value">Value</Badge> : null}
                            {lens !== "gpp" && isCashPlay(p) ? <Badge variant="hot">Cash</Badge> : null}
                            {lens !== "cash" && isGppPlay(p) ? <Badge variant="it">GPP</Badge> : null}
                            {p.rounds === 5 ? <Badge variant="it">5rd</Badge> : null}
                          </div>
                          <p className="text-muted-foreground text-[11px]">{spot(p)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 font-mono text-xs tabular-nums">{p.salary > 0 ? formatSalary(p.salary) : "—"}</td>
                    <td className="px-3 font-mono text-sm tabular-nums">{formatPts(p.projection)}</td>
                    <td className="px-3 font-mono text-xs tabular-nums">{Math.round(p.winProb * 100)}%</td>
                    <td className="text-muted-foreground px-3 font-mono text-[11px] tabular-nums">
                      {Math.round(p.pKo * 100)} / {Math.round(p.pSub * 100)} / {Math.round(p.pDec * 100)}
                    </td>
                    <td className={cn("px-3 font-mono text-sm tabular-nums", p.isValuePlay && "text-value")}>
                      {p.salary > 0 ? p.value.toFixed(2) : "—"}
                    </td>
                    <td className="px-2">
                      <div className="flex">
                        <button type="button" aria-label={locked ? "Unlock" : "Lock"} onClick={() => onToggleLock(p.id)} className="text-muted-foreground size-10">
                          {locked ? <Lock className="mx-auto size-3.5 text-value" /> : <Unlock className="mx-auto size-3.5" />}
                        </button>
                        <button type="button" aria-label={excluded ? "Include" : "Exclude"} onClick={() => onToggleExclude(p.id)} className="text-muted-foreground size-10">
                          <X className="mx-auto size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-faint px-3 py-2 text-[11px]">
          Main card only · DraftKings MMA {data.format === "showdown" ? "Captain 1.5×" : "Classic"} $50,000 · 6 fighters · no weather
        </p>
      </div>
    </div>
  );
}
