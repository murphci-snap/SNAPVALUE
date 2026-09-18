import { Lock, Unlock, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NBA_POS } from "@/lib/nba/constants";
import { cashScore, gppScore, isCashPlay, isGppPlay, isSidelined } from "@/lib/nba/scoring";
import { pickNbaIt } from "@/lib/nba/it";
import { NBA_BARGAIN_POS } from "@/lib/nba/sleeper";
import type { NbaLens, NbaPos, NbaSlateData } from "@/lib/nba/types";
import { cn, formatPts, formatSalary, playerSpotLine } from "@/lib/utils";
import { CyBadge, CyLegend } from "./cy-badge";

export function NbaBoard({
  data,
  locks,
  excludes,
  onToggleLock,
  onToggleExclude,
}: {
  data: NbaSlateData;
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
  onToggleExclude: (id: string) => void;
}) {
  const [pos, setPos] = useState<NbaPos | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [lens, setLens] = useState<NbaLens>("all");
  const [valuesOnly, setValuesOnly] = useState(false);
  const [itOnly, setItOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = data.players;
    if (pos !== "ALL") list = list.filter((p) => p.position === pos);
    if (valuesOnly) list = list.filter((p) => p.isValuePlay);
    if (itOnly) list = list.filter((p) => p.itFactor);
    if (lens === "cash") list = list.filter((p) => isCashPlay(p));
    if (lens === "gpp") list = list.filter((p) => isGppPlay(p));
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.team.toLowerCase().includes(query) ||
          p.opponent.toLowerCase().includes(query),
      );
    }
    const posRank = (p: NbaPos) => NBA_POS.indexOf(p);
    return [...list].sort((a, b) => {
      if (pos === "ALL") {
        const pd = posRank(a.position) - posRank(b.position);
        if (pd !== 0) return pd;
      }
      if (lens === "cash") return cashScore(b) - cashScore(a);
      if (lens === "gpp") return gppScore(b) - gppScore(a);
      return b.projection - a.projection;
    });
  }, [data.players, pos, q, lens, valuesOnly, itOnly]);

  const rackPos = pos === "ALL" ? NBA_POS : [pos];
  const valueRack = rackPos.map((p) => ({
    pos: p,
    players: [...data.players]
      .filter((x) => x.position === p && x.isValuePlay && !isSidelined(x.injury, x.status))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4),
  }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...NBA_POS] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            className={cn(
              "h-11 rounded-full px-4 text-sm font-medium transition-colors duration-150",
              pos === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground shadow-[var(--shadow-border)]",
            )}
          >
            {p === "ALL" ? "All" : p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium",
            lens === "cash" ? "bg-value/15 text-value" : "bg-secondary text-secondary-foreground",
          )}
          onClick={() => setLens(lens === "cash" ? "all" : "cash")}
        >
          Cash
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium",
            lens === "gpp" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
          )}
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
        <button
          type="button"
          className={cn("inline-flex h-9 items-center rounded-md px-3 text-xs font-medium", itOnly ? "bg-primary text-primary-foreground" : "bg-secondary")}
          onClick={() => setItOnly((v) => !v)}
        >
          IT Factor
        </button>
        <div className="min-w-48 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" />
        </div>
      </div>
      <CyLegend />
      {lens !== "all" ? (
        <p className="text-muted-foreground -mt-2 text-sm">
          {lens === "cash"
            ? "Cash · Double Up floors. Chalk is fine. Best Value sorts by floor."
            : "GPP · Milly leverage. Mid-pay smash, unique UTIL. Studs stay."}
        </p>
      ) : null}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="display text-xl font-semibold">Best Value</h2>
          <p className="text-faint text-[11px] tracking-wide uppercase">Pts / $1k</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {valueRack.map((g) => (
            <div key={g.pos} className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
              <h3 className="display text-lg font-semibold">{g.pos}</h3>
              <ol className="mt-2 flex flex-col gap-1.5">
                {g.players.length === 0 && <li className="text-muted-foreground text-xs">No standout values</li>}
                {g.players.map((p, i) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {i + 1}. {p.name} <CyBadge cy={p.contractYear} />
                      </span>
                      <span className="text-muted-foreground text-[11px]">{playerSpotLine(p, { games: data.games, weather: false })}</span>
                    </span>
                    <span className="text-value font-mono text-sm tabular-nums">{p.value.toFixed(2)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <NbaBargain data={data} pos={pos} />
      <NbaIt data={data} pos={pos} lens={lens} />

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-field text-muted-foreground text-[11px] tracking-wide uppercase">
              <tr>
                <th className="px-3 py-3">Player</th>
                <th className="px-3 py-3">Salary</th>
                <th className="px-3 py-3">Proj</th>
                <th className="px-3 py-3">Val</th>
                <th className="px-3 py-3">vs DEF</th>
                <th className="px-3 py-3"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-3 py-10 text-center text-sm">
                    {data.notice ?? "No players match this filter."}
                  </td>
                </tr>
              ) : null}
              {filtered.slice(0, 220).map((p, i, arr) => {
                const locked = locks.includes(p.id);
                const excluded = excludes.includes(p.id);
                const showPos = pos === "ALL" && (i === 0 || arr[i - 1]!.position !== p.position);
                return (
                  <Fragment key={p.id}>
                    {showPos ? (
                      <tr className="bg-field">
                        <td colSpan={6} className="px-3 py-2">
                          <span className="display text-sm font-semibold tracking-wide">{p.position}</span>
                          <span className="text-faint ml-2 text-[11px] tracking-wide uppercase">
                            {data.players.filter((x) => x.position === p.position).length} on slate
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    <tr className={cn("border-border/70 border-t", p.isValuePlay && "bg-value/5", excluded && "opacity-40")}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{p.name}</span>
                          <CyBadge cy={p.contractYear} />
                          {p.itFactor && <Badge variant="it">IT</Badge>}
                          {p.cheapImpact && <Badge variant="value">Bargain</Badge>}
                          {p.isValuePlay && <Badge variant="value">Value</Badge>}
                          {lens !== "gpp" && isCashPlay(p) && <Badge variant="hot">Cash</Badge>}
                          {lens !== "cash" && isGppPlay(p) && <Badge variant="it">GPP</Badge>}
                          {p.rankingMethod === "props" && <Badge variant="hot">Vegas</Badge>}
                          {p.injury && <Badge variant="warn">{p.injury}</Badge>}
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          {p.position} · {playerSpotLine(p, { games: data.games, weather: false })}
                        </p>
                      </td>
                      <td className="px-3 font-mono text-xs">{formatSalary(p.salary)}</td>
                      <td className="px-3 font-mono">{formatPts(p.projection)}</td>
                      <td className={cn("px-3 font-mono", p.isValuePlay && "text-value")}>{p.value.toFixed(2)}</td>
                      <td className="px-3 font-mono text-xs">{p.oppRank ? `${p.oppRank}` : "—"}</td>
                      <td className="px-2">
                        <div className="flex">
                          <button
                            type="button"
                            aria-label={locked ? "Unlock" : "Lock in lineups"}
                            className="text-muted-foreground hover:text-foreground relative size-10"
                            onClick={() => onToggleLock(p.id)}
                          >
                            {locked ? <Lock className="mx-auto size-3.5 text-value" /> : <Unlock className="mx-auto size-3.5" />}
                          </button>
                          <button
                            type="button"
                            aria-label={excluded ? "Include" : "Exclude"}
                            className="text-muted-foreground hover:text-foreground relative size-10"
                            onClick={() => onToggleExclude(p.id)}
                          >
                            <X className="mx-auto size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-faint px-3 py-2 text-[11px]">
          Showing {Math.min(filtered.length, 220)} of {filtered.length} · DraftKings NBA Classic $50,000 · PG SG SF PF C G F
          UTIL · ESPN + FanDuel props when posted
        </p>
      </div>
    </div>
  );
}

function NbaBargain({ data, pos }: { data: NbaSlateData; pos: NbaPos | "ALL" }) {
  const positions = pos === "ALL" ? NBA_BARGAIN_POS : NBA_BARGAIN_POS.filter((p) => p === pos);
  const groups = positions.map((p) => ({
    pos: p,
    players: data.players.filter((x) => x.position === p && x.cheapImpact),
  }));
  if (groups.every((g) => !g.players.length)) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="display text-xl font-semibold">Bargain bin</h2>
        <p className="text-value text-[11px] tracking-[0.16em] uppercase">Bang for the buck</p>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">Cheap skill and cheap bigs — not a FLEX/QB concept. One name per spot.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {groups.map((g) => {
          const p = g.players[0];
          return (
            <div key={g.pos} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
              <h3 className="display text-lg font-semibold">{g.pos}</h3>
              {!p ? (
                <p className="text-muted-foreground text-xs">No cheap names</p>
              ) : (
                <>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-base font-medium">
                    {p.name} <CyBadge cy={p.contractYear} />
                  </p>
                  <p className="text-muted-foreground text-[11px]">{playerSpotLine(p, { games: data.games, weather: false })}</p>
                  <p className="text-value display mt-2 text-2xl font-semibold">{p.value.toFixed(2)}</p>
                  {p.cheapImpactWhy ? <p className="text-ink mt-1 text-xs">{p.cheapImpactWhy}</p> : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NbaIt({ data, pos, lens }: { data: NbaSlateData; pos: NbaPos | "ALL"; lens: NbaLens }) {
  const groups = (pos === "ALL" ? NBA_POS : [pos]).map((p) => ({
    pos: p,
    players: pickNbaIt(data.players, p, lens),
  }));
  if (groups.every((g) => !g.players.length)) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="display text-xl font-semibold">IT Factor</h2>
        <p className="text-faint text-[11px] tracking-wide uppercase">Leverage smash · mid-pay heaters</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {groups.map((g) => (
          <div key={g.pos} className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
            <h3 className="display text-lg font-semibold">{g.pos}</h3>
            <ol className="mt-2 flex flex-col gap-2">
              {g.players.map((p) => (
                <li key={p.id}>
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {p.name} <CyBadge cy={p.contractYear} />
                  </p>
                  <p className="text-muted-foreground text-[11px]">{playerSpotLine(p, { games: data.games, weather: false })}</p>
                  {p.itFactorWhy ? <p className="text-ink mt-1 text-[11px]">{p.itFactorWhy}</p> : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
