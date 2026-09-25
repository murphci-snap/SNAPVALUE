import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Lock, Unlock, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POSITIONS } from "@/lib/dfs/constants";
import { kickoffLabel, matchupLabel, matchupTone, propLineItems, rankingLabel, seasonLine, weekLine } from "@/lib/dfs/format-ui";
import { itIdSet, itWhy } from "@/lib/dfs/it-factor";
import { cashScore, gppScore, isCashPlay, isGppPlay, isSidelined, type BoardLens } from "@/lib/dfs/scoring";
import type { Player, Position, SlateData } from "@/lib/dfs/types";
import { cn, formatPts, formatSalary, playerSpotLine } from "@/lib/utils";
import { CheapImpactRack } from "./cheap-impact-rack";
import { CyBadge, CyLegend } from "./cy-badge";
import { ItFactorRack } from "./it-factor-rack";
import { asFdPlayer } from "@/lib/dfs/site-salary";

type SortKey = "projection" | "salary" | "value" | "fppg" | "oppRank" | "name" | "ownership";
type PosFilter = Position | "ALL" | "CPT";

export function PlayerBoard({
  data: slate,
  locks,
  excludes,
  onToggleLock,
  onToggleExclude,
  site = "DK",
}: {
  data: SlateData;
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
  onToggleExclude: (id: string) => void;
  site?: "DK" | "FD";
}) {
  const data = useMemo(() => {
    if (site !== "FD") return slate;
    const players = slate.players.flatMap((p) => {
      const next = asFdPlayer(p);
      return next ? [next] : [];
    });
    return { ...slate, players, salaryCap: 60000 };
  }, [slate, site]);
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(false);
  const [sort, setSort] = useState<SortKey>("projection");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const [valuesOnly, setValuesOnly] = useState(false);
  const [itOnly, setItOnly] = useState(false);
  const [lens, setLens] = useState<BoardLens>("all");
  const [selected, setSelected] = useState<Player | null>(null);
  const [tableReady, setTableReady] = useState(false);
  useEffect(() => setTableReady(true), []);
  useEffect(() => {
    setPos("ALL");
    setSelected(null);
  }, [data.draftGroupId, data.window, data.format]);

  const showdown = data.format === "showdown";
  const boardPlayers = useMemo(
    () => (showdown ? data.players : data.players.filter((p) => p.showdownRole !== "CPT")),
    [data.players, showdown],
  );
  const posList = useMemo<Position[]>(
    () => (boardPlayers.some((p) => p.position === "K") ? [...POSITIONS, "K"] : [...POSITIONS]),
    [boardPlayers],
  );
  const itIds = useMemo(
    () => itIdSet(boardPlayers, data.games, lens),
    [boardPlayers, data.games, lens],
  );
  const POS_FILTER: PosFilter[] = showdown ? ["ALL", "CPT", ...posList] : ["ALL", ...posList];
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = boardPlayers;
    if (pos === "CPT") list = list.filter((p) => p.showdownRole === "CPT");
    else if (pos !== "ALL") list = list.filter((p) => p.position === pos);
    if (valuesOnly) list = list.filter((p) => p.isValuePlay);
    if (itOnly) list = list.filter((p) => itIds.has(p.id));
    if (lens === "cash") list = list.filter((p) => isCashPlay(p));
    if (lens === "gpp") list = list.filter((p) => isGppPlay(p));
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.team.toLowerCase().includes(query) ||
          p.opponent.toLowerCase().includes(query),
      );
    }
    const mul = dir === "desc" ? -1 : 1;
    const posRank = (p: Position) => {
      const i = POSITIONS.indexOf(p);
      return i >= 0 ? i : POSITIONS.length;
    };
    return [...list].sort((a, b) => {
      if (pos === "ALL") {
        if (showdown) {
          const ar = a.showdownRole === "CPT" ? 0 : 1;
          const br = b.showdownRole === "CPT" ? 0 : 1;
          if (ar !== br) return ar - br;
          if (ar === 0) {
            /* CPT is one ranked pool — don't split by position */
          } else {
            const pd = posRank(a.position) - posRank(b.position);
            if (pd !== 0) return pd;
          }
        } else {
          const pd = posRank(a.position) - posRank(b.position);
          if (pd !== 0) return pd;
        }
      }
      if (sort === "name") return mul * a.name.localeCompare(b.name);
      if (sort === "ownership") return mul * ((a.ownership ?? 0) - (b.ownership ?? 0));
      if (lens === "cash" && sort === "projection") return mul * (cashScore(a) - cashScore(b));
      if (lens === "gpp" && sort === "projection") return mul * (gppScore(a) - gppScore(b));
      return mul * ((a[sort] as number) - (b[sort] as number));
    });
  }, [boardPlayers, pos, q, sort, dir, valuesOnly, itOnly, lens, itIds, showdown]);

  const valueRackPos = pos === "ALL" || pos === "CPT" ? posList : [pos];
  const rack = useMemo(
    () => {
      const posGroups = valueRackPos.map((p) => ({
        pos: p as string,
        players: [...boardPlayers]
          .filter((x) => x.position === p && x.showdownRole !== "CPT" && x.isValuePlay && x.isStarter !== false && !isSidelined(x.injury, x.status))
          .filter((x) => (lens === "cash" ? isCashPlay(x) : lens === "gpp" ? isGppPlay(x) || x.projection >= 14 : true))
          .sort((a, b) => {
            if (lens === "cash") return cashScore(b) - cashScore(a) || b.value - a.value;
            if (lens === "gpp") return gppScore(b) - gppScore(a) || b.value - a.value;
            return b.value - a.value || a.valueRank - b.valueRank;
          })
          .slice(0, 4),
      }));
      if (showdown) {
        const cpt = [...boardPlayers]
          .filter((x) => x.showdownRole === "CPT" && !isSidelined(x.injury, x.status))
          .sort((a, b) => b.projection - a.projection || b.value - a.value)
          .slice(0, 4);
        if (pos === "CPT") return [{ pos: "CPT", players: cpt }];
        if (pos === "ALL") return [{ pos: "CPT", players: cpt }, ...posGroups];
      }
      return posGroups;
    },
    [boardPlayers, pos, posList, lens, showdown, valueRackPos],
  );

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      setDir(key === "name" || key === "oppRank" ? "asc" : "desc");
    }
  }

  const sortIcon = (key: SortKey) =>
    sort === key ? (
      dir === "desc" ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUp className="size-3" />
      )
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {site === "FD" ? (
        <p className="text-muted-foreground text-sm">
          {data.players.length
            ? "FanDuel salaries · $60,000 cap. Points are the DraftKings number minus half a point per catch."
            : "FanDuel hasn’t priced this slate. Switch back to DK."}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {POS_FILTER.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            className={cn(
              "h-11 rounded-full px-4 text-sm font-medium transition-colors duration-150",
              pos === p
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground shadow-[var(--shadow-border)]",
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
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium transition-colors duration-150",
            lens === "cash" ? "bg-value/15 text-value" : "bg-secondary text-secondary-foreground shadow-[var(--shadow-border)]",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = lens === "cash" ? "all" : "cash";
            setLens(next);
            if (next !== "all") {
              setSort("projection");
              setDir("desc");
            }
          }}
        >
          Cash
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium transition-colors duration-150",
            lens === "gpp" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground shadow-[var(--shadow-border)]",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = lens === "gpp" ? "all" : "gpp";
            setLens(next);
            if (next !== "all") {
              setSort("projection");
              setDir("desc");
            }
          }}
        >
          GPP
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium transition-colors duration-150",
            valuesOnly ? "bg-value/15 text-value" : "bg-secondary text-secondary-foreground shadow-[var(--shadow-border)]",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setValuesOnly((v) => !v);
          }}
        >
          Best value only
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium transition-colors duration-150",
            itOnly ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground shadow-[var(--shadow-border)]",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setItOnly((v) => !v);
          }}
        >
          IT Factor
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center rounded-md px-3 text-xs font-medium transition-colors duration-150",
            compact ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground shadow-[var(--shadow-border)]",
          )}
          onClick={() => setCompact((v) => !v)}
        >
          Compact table
        </button>
        <div className="min-w-48 flex-1 basis-full sm:basis-auto">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player, team, opponent"
            aria-label="Search players"
          />
        </div>
      </div>
      <CyLegend />
      {compact ? null : (
        <>
          <ItFactorRack data={data} pos={pos === "CPT" ? "ALL" : pos} lens={lens} onSelect={setSelected} />
          <CheapImpactRack data={data} pos={pos === "CPT" ? "ALL" : pos} onSelect={setSelected} />
        </>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="display text-xl font-semibold">Best value</h2>
          <p className="text-value text-[11px] tracking-wide uppercase">
            {lens === "cash" ? "Cash · floor first" : lens === "gpp" ? "GPP · leverage" : "Sorted by pts / $1k"}
          </p>
        </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {rack.map((group) => (
          <div key={group.pos} className="rounded-xl bg-card p-3 shadow-[var(--shadow-border)]">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="display text-lg leading-none font-semibold">{group.pos}</h3>
              <span className="text-faint text-[10px] tracking-[0.16em] uppercase">Pts / $1k</span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {group.players.length === 0 && (
                <li className="text-muted-foreground text-xs">No standout values</li>
              )}
              {group.players.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left"
                  >
                    <span className="text-faint w-4 font-mono text-xs">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {p.name} <CyBadge cy={p.contractYear} />
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {playerSpotLine(p, { games: data.games })}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="text-value font-mono text-sm tabular-nums">{p.value.toFixed(2)}</span>
                      <span className="text-faint font-mono text-[11px] tabular-nums">{formatPts(p.projection)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      </section>

      {tableReady ? (
      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-field text-muted-foreground sticky top-0 z-10 text-[11px] tracking-wide uppercase">
              <tr>
                <Th onClick={() => toggleSort("name")} active={sort === "name"}>
                  Player {sortIcon("name")}
                </Th>
                <Th onClick={() => toggleSort("salary")} active={sort === "salary"}>
                  Salary {sortIcon("salary")}
                </Th>
                <Th onClick={() => toggleSort("projection")} active={sort === "projection"}>
                  Proj {sortIcon("projection")}
                </Th>
                <Th onClick={() => toggleSort("value")} active={sort === "value"}>
                  Val {sortIcon("value")}
                </Th>
                <Th onClick={() => toggleSort("ownership")} active={sort === "ownership"}>
                  Own {sortIcon("ownership")}
                </Th>
                <Th onClick={() => toggleSort("fppg")} active={sort === "fppg"}>
                  FPPG {sortIcon("fppg")}
                </Th>
                <Th onClick={() => toggleSort("oppRank")} active={sort === "oppRank"}>
                  vs DEF {sortIcon("oppRank")}
                </Th>
                {compact ? null : <th className="px-3 py-3 font-medium">2025</th>}
                <th className="px-3 py-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 220).map((p, i, arr) => {
                const locked = locks.includes(p.id);
                const excluded = excludes.includes(p.id);
                const tone = matchupTone(p.oppQuality, p.oppRank);
                const groupKey = (x: Player) =>
                  showdown && pos === "ALL" && x.showdownRole === "CPT" ? "CPT" : x.position;
                const showPos = pos === "ALL" && (i === 0 || groupKey(arr[i - 1]!) !== groupKey(p));
                const groupLabel = groupKey(p);
                const groupCount =
                  groupLabel === "CPT"
                    ? boardPlayers.filter((x) => x.showdownRole === "CPT").length
                    : boardPlayers.filter(
                        (x) => x.position === p.position && x.showdownRole !== "CPT",
                      ).length;
                return (
                  <Fragment key={p.id}>
                    {showPos && (
                      <tr className="bg-field">
                        <td colSpan={9} className="px-3 py-2">
                          <span className="display text-sm font-semibold tracking-wide">{groupLabel}</span>
                          <span className="text-faint ml-2 text-[11px] tracking-wide uppercase">
                            {groupCount} on slate
                          </span>
                        </td>
                      </tr>
                    )}
                  <tr
                    className={cn(
                      "border-border/70 hover:bg-accent/60 cursor-pointer border-t transition-colors duration-150",
                      p.isValuePlay && "bg-value/5",
                      itIds.has(p.id) && !p.isValuePlay && "bg-ink/5",
                      excluded && "opacity-40",
                    )}
                    onClick={() => setSelected(p)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Headshot player={p} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{p.name}</span>
                            <CyBadge cy={p.contractYear} />
                            {p.showdownRole === "CPT" && <Badge variant="hot">CPT</Badge>}
                            {itIds.has(p.id) && <Badge variant="it">IT</Badge>}
                            {p.cheapImpact && <Badge variant="value">Bargain</Badge>}
                            {p.isValuePlay && <Badge variant="value">Value</Badge>}
                            {lens !== "gpp" && isCashPlay(p) && <Badge variant="hot">Cash</Badge>}
                            {lens !== "cash" && isGppPlay(p) && <Badge variant="it">GPP</Badge>}
                            {p.rankingMethod === "props" && <Badge variant="hot">Vegas</Badge>}
                            {p.injury && <Badge variant="warn">{p.injury}</Badge>}
                          </div>
          <p className="text-muted-foreground text-[11px]">
                            {p.showdownRole === "CPT" ? "CPT" : p.position} · {playerSpotLine(p, { games: data.games })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 font-mono text-xs tabular-nums">{formatSalary(p.salary)}</td>
                    <td className="px-3 font-mono text-sm tabular-nums">{formatPts(p.projection)}</td>
                    <td className={cn("px-3 font-mono text-sm tabular-nums", p.isValuePlay && "text-value")}>
                      {p.value.toFixed(2)}
                    </td>
                    <td className="text-muted-foreground px-3 font-mono text-xs tabular-nums">
                      {p.ownership != null ? `${p.ownership.toFixed(1)}%` : "—"}
                    </td>
                    <td className="text-muted-foreground px-3 font-mono text-xs tabular-nums">
                      {p.fppg.toFixed(1)}
                    </td>
                    <td className="px-3">
                      <Badge variant={tone}>{matchupLabel(p)}</Badge>
                    </td>
                    {compact ? null : (
                    <td className="text-muted-foreground px-3 font-mono text-[11px] tabular-nums">
                      {seasonPreview(p)}
                    </td>
                    )}
                    <td className="px-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex">
                        <button
                          type="button"
                          aria-label={locked ? "Unlock" : "Lock in lineups"}
                          onClick={() => onToggleLock(p.id)}
                          className="text-muted-foreground hover:text-foreground relative size-10"
                        >
                          {locked ? <Lock className="mx-auto size-3.5 text-value" /> : <Unlock className="mx-auto size-3.5" />}
                        </button>
                        <button
                          type="button"
                          aria-label={excluded ? "Include" : "Exclude"}
                          onClick={() => onToggleExclude(p.id)}
                          className="text-muted-foreground hover:text-foreground relative size-10"
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
          Showing {Math.min(filtered.length, 220)} of {filtered.length} · {showdown ? "DraftKings Showdown CPT 1.5×" : "DraftKings Classic $50,000"} · rankings use Vegas player props when posted, otherwise the average of Yahoo, CBS Sports, FantasyPros, and public X tape
        </p>
      </div>
      ) : (
        <p className="text-muted-foreground rounded-xl bg-card px-4 py-6 text-center text-sm shadow-[var(--shadow-border)]">
          Full player table loads next…
        </p>
      )}

      {selected && (
        <PlayerDetail
          player={selected}
          games={data.games}
          locked={locks.includes(selected.id)}
          onClose={() => setSelected(null)}
          onLock={() => onToggleLock(selected.id)}
          excluded={excludes.includes(selected.id)}
          onExclude={() => onToggleExclude(selected.id)}
          it={itIds.has(selected.id)}
          why={itWhy(selected, data.games, lens)}
          mates={data.players.filter((p) => p.id !== selected.id && p.gameName && p.gameName === selected.gameName).slice(0, 6)}
        />
      )}
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="px-3 py-3">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
      </button>
    </th>
  );
}

function Headshot({ player }: { player: Player }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || !player.image || player.position === "DST" || failed) {
    return (
      <span className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[10px]">
        {player.team}
      </span>
    );
  }
  return (
    <img
      src={player.image}
      alt=""
      width={36}
      height={36}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="bg-secondary size-9 shrink-0 rounded-full object-cover object-top outline outline-1 -outline-offset-1 outline-white/10"
    />
  );
}

function seasonPreview(p: Player): string {
  const s = p.stats;
  if (!s) return "—";
  if (p.position === "QB") return `${Math.round(s.passYds)} yds · ${Math.round(s.passTd)} TD`;
  if (p.position === "RB") return `${Math.round(s.rushYds)} yds · ${Math.round(s.receptions)} rec`;
  if (p.position === "DST") return `${Math.round(s.sacks)} sk · ${Math.round(s.defInt)} int`;
  return `${Math.round(s.receptions)}/${Math.round(s.targets)} · ${Math.round(s.recYds)} yds`;
}

function PlayerDetail({
  player,
  games,
  locked,
  excluded,
  onClose,
  onLock,
  onExclude,
  it,
  why,
  mates,
}: {
  player: Player;
  games: SlateData["games"];
  locked: boolean;
  excluded: boolean;
  onClose: () => void;
  onLock: () => void;
  onExclude: () => void;
  it: boolean;
  why: string;
  mates?: Player[];
}) {
  const d = player.defense;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="bg-card max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl p-5 shadow-[var(--shadow-border)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Headshot player={player} />
          <div className="min-w-0 flex-1">
            <p className="text-faint display text-xs tracking-[0.18em] uppercase">
              {player.position} · {player.team}
            </p>
            <h3 className="display flex items-center gap-2 text-3xl leading-none font-semibold">
              {player.name}
              <CyBadge cy={player.contractYear} />
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {playerSpotLine(player, { games })} · {kickoffLabel(player.startTime)}
            </p>
            {player.contractYear ? <p className="text-[#f0c14b] mt-1 text-xs font-medium">{player.contractYear.blurb}</p> : null}
            {player.injury || player.status ? (
              <p className="text-warn mt-1 text-sm">{[player.status, player.injury].filter(Boolean).join(" · ")}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="relative size-11 text-muted-foreground" aria-label="Close">
            <X className="mx-auto size-5" />
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-4 gap-2">
          {[
            { k: "Projection", v: formatPts(player.projection) },
            { k: "Value", v: player.value.toFixed(2) },
            { k: "Ranked by", v: rankingLabel(player) },
            { k: "vs DEF", v: matchupLabel(player) },
          ].map((x) => (
            <div key={x.k} className="bg-secondary rounded-lg p-2.5">
              <dt className="text-faint text-[10px] tracking-wide uppercase">{x.k}</dt>
              <dd className="display text-xl leading-none font-semibold tabular-nums">{x.v}</dd>
            </div>
          ))}
        </dl>

        {it && why && (
          <p className="text-ink mt-4 text-sm">
            <span className="display tracking-[0.14em] uppercase">IT Factor · </span>
            {why}
          </p>
        )}
        {mates && mates.length ? (
          <p className="text-muted-foreground mt-3 text-sm">
            <span className="text-faint display tracking-[0.14em] uppercase">Stack with · </span>
            {mates.map((m) => `${m.name} ${m.position}`).join(" · ")}
          </p>
        ) : null}
        <h4 className="display mt-5 text-lg font-semibold">Recent weeks</h4>
        {player.recentForm && player.recentForm.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-faint text-[10px] tracking-wide uppercase">
                <tr>
                  <th className="py-1 pr-3 font-medium">Wk</th>
                  <th className="py-1 pr-3 font-medium">PPR</th>
                  <th className="py-1 pr-3 font-medium">Snap%</th>
                  <th className="py-1 pr-3 font-medium">Tgt</th>
                  <th className="py-1 font-medium">Car</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {player.recentForm.map((w) => (
                  <tr key={w.week}>
                    <td className="py-1 pr-3">{w.week}</td>
                    <td className="py-1 pr-3">{w.ppr ?? "—"}</td>
                    <td className="py-1 pr-3">{w.snapPct == null ? "—" : `${w.snapPct}%`}</td>
                    <td className="py-1 pr-3">{w.targets ?? "—"}</td>
                    <td className="py-1">{w.carries ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-faint mt-1 text-[11px]">Snaps and targets from the public snap feed. Routes aren’t on it.</p>
          </div>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No completed weeks on the snap feed yet.</p>
        )}
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          This week: DK {formatSalary(player.dkSalary ?? player.salary)}
          {player.fdSalary ? ` · FD ${formatSalary(player.fdSalary)}` : " · FD not priced"}.
          Older salaries aren’t on a public 2026 archive, so they stay blank.
          {player.stats && player.position !== "DST"
            ? ` 2025 volume: ${player.stats.games}g · ${Math.round(player.stats.targets)} tgt · ${Math.round(player.stats.rushAtt)} car.`
            : ""}
          {player.ownership != null ? ` Own ${player.ownership.toFixed(0)}% (${player.ownershipSource ?? "model"}).` : ""}
        </p>
        {player.cheapImpact && player.cheapImpactWhy && (
          <p className="text-value mt-3 text-sm">
            <span className="display tracking-[0.14em] uppercase">Bargain bin · </span>
            {player.cheapImpactWhy}
          </p>
        )}

        {player.sources.length > 0 && (
          <>
            <h4 className="display mt-5 text-lg font-semibold">Projection sources</h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {player.sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 shadow-[var(--shadow-border)]">
                  <span className="text-sm">
                    {s.label}
                    <span className="text-faint ml-2 text-[11px] uppercase">{s.kind === "props" ? "props" : "site"}</span>
                  </span>
                  <span className="font-mono text-sm tabular-nums">{s.points.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {propLineItems(player).length > 0 && (
          <>
            <h4 className="display mt-5 text-lg font-semibold">Vegas / DK props</h4>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {propLineItems(player).map((x) => (
                <div key={x.k} className="shadow-[var(--shadow-border)] rounded-lg p-2.5">
                  <dt className="text-faint text-[10px] tracking-wide uppercase">{x.k}</dt>
                  <dd className="font-mono text-sm tabular-nums">{x.v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <h4 className="display mt-5 text-lg font-semibold">This week</h4>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {weekLine(player).map((x) => (
            <div key={x.k} className="shadow-[var(--shadow-border)] rounded-lg p-2.5">
              <dt className="text-faint text-[10px] tracking-wide uppercase">{x.k}</dt>
              <dd className="font-mono text-sm tabular-nums">{x.v}</dd>
            </div>
          ))}
        </dl>

        <h4 className="display mt-5 text-lg font-semibold">2025 season</h4>
        {player.stats ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {seasonLine(player.position, player.stats).map((x) => (
              <div key={x.k} className="shadow-[var(--shadow-border)] rounded-lg p-2.5">
                <dt className="text-faint text-[10px] tracking-wide uppercase">{x.k}</dt>
                <dd className="font-mono text-sm tabular-nums">{x.v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No 2025 sample on file for this player.</p>
        )}

        {d && (
          <>
            <h4 className="display mt-5 text-lg font-semibold">Vs {d.abbr} defense</h4>
            <p className="text-muted-foreground mt-1 text-sm">
              Opponent ranks {d.rankVsPos ? `${d.rankVsPos}` : "—"} vs {player.position}.{" "}
              {d.quality === "High"
                ? "Soft matchup — defense allows more fantasy points than most."
                : d.quality === "Low"
                  ? "Difficult matchup — this unit suppresses the position."
                  : "Average matchup."}
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                { k: "Sacks", v: d.sacks ? d.sacks.toFixed(0) : "—" },
                { k: "INT", v: d.defInt ? d.defInt.toFixed(0) : "—" },
                { k: "Fum rec", v: d.fumRec ? d.fumRec.toFixed(0) : "—" },
                { k: "Def TD", v: d.defTd ? d.defTd.toFixed(0) : "—" },
                { k: "Pts allwd", v: d.ptsAllowed ? d.ptsAllowed.toFixed(0) : "—" },
                { k: "Yds allwd", v: d.ydsAllowed ? Math.round(d.ydsAllowed).toLocaleString() : "—" },
              ].map((x) => (
                <div key={x.k} className="shadow-[var(--shadow-border)] rounded-lg p-2">
                  <dt className="text-faint text-[10px] tracking-wide uppercase">{x.k}</dt>
                  <dd className="font-mono text-sm tabular-nums">{x.v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="mt-5 flex gap-2">
          <Button onClick={onLock} variant={locked ? "value" : "default"} className="flex-1">
            {locked ? "Locked in lineups" : "Lock for lineups"}
          </Button>
          <Button onClick={onExclude} variant="secondary" className="flex-1">
            {excluded ? "Excluded" : "Exclude"}
          </Button>
        </div>
      </div>
    </div>
  );
}
