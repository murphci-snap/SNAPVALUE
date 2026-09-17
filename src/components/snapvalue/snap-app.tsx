import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { REFRESH_MS } from "@/lib/dfs/constants";
import { kickoffLabel, relativeTime } from "@/lib/dfs/format-ui";
import type { SlateData, SlateResponse } from "@/lib/dfs/types";
import { NBA_REFRESH_MS } from "@/lib/nba/constants";
import type { NbaSlateData, NbaSlateResponse } from "@/lib/nba/types";
import { cn } from "@/lib/utils";
import { BetDesk } from "./bet-desk";
import { DisclaimerFooter, DisclaimerGate, readDisclaimerAccepted, writeDisclaimerAccepted } from "./disclaimer-gate";
import { DvpBoard } from "./dvp-board";
import { LineupStudio } from "./lineup-studio";
import { NbaBets } from "./nba-bets";
import { NbaBoard } from "./nba-board";
import { NbaLineups } from "./nba-lineups";
import { PlayerBoard } from "./player-board";
import { PoolStudio } from "./pool-studio";
import { PprBoard } from "./ppr-board";

type Tab = "board" | "lineups" | "pools" | "bets" | "ppr";
type Sport = "NFL" | "NBA";

async function fetchSlate(draftGroupId?: number, force = false): Promise<SlateResponse> {
  const params = new URLSearchParams();
  if (draftGroupId) params.set("draftGroupId", String(draftGroupId));
  if (force) params.set("force", "1");
  const qs = params.toString();
  const res = await fetch(`/api/slate${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("slate");
  const data = (await res.json()) as SlateResponse;
  if (!data.ok) throw new Error(data.error);
  return data;
}

async function fetchNbaSlate(draftGroupId?: number, force = false): Promise<NbaSlateResponse> {
  const params = new URLSearchParams();
  if (draftGroupId) params.set("draftGroupId", String(draftGroupId));
  if (force) params.set("force", "1");
  const qs = params.toString();
  const res = await fetch(`/api/nba-slate${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error("nba-slate");
  return (await res.json()) as NbaSlateResponse;
}

function readSport(): Sport {
  try {
    return localStorage.getItem("snapvalue.sport") === "NBA" ? "NBA" : "NFL";
  } catch {
    return "NFL";
  }
}

export function SnapApp({ initial }: { initial?: SlateResponse }) {
  const queryClient = useQueryClient();
  const initialId = initial?.ok ? initial.draftGroupId : undefined;
  const [sport, setSport] = useState<Sport>("NFL");
  const [draftGroupId, setDraftGroupId] = useState<number | undefined>(initialId);
  const [nbaGroupId, setNbaGroupId] = useState<number | undefined>();
  const [tab, setTab] = useState<Tab>("board");
  const [locks, setLocks] = useState<string[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [nbaLocks, setNbaLocks] = useState<string[]>([]);
  const [nbaExcludes, setNbaExcludes] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [gateReady, setGateReady] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(readDisclaimerAccepted());
    setSport(readSport());
    setGateReady(true);
  }, []);

  function chooseSport(next: Sport) {
    setSport(next);
    try {
      localStorage.setItem("snapvalue.sport", next);
    } catch {
      /* ignore */
    }
    if (next === "NBA" && (tab === "pools" || tab === "ppr")) setTab("board");
  }

  const query = useQuery({
    queryKey: ["slate", draftGroupId ?? "auto"],
    queryFn: () => fetchSlate(draftGroupId),
    initialData: initial && draftGroupId === initialId ? initial : undefined,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: REFRESH_MS,
    retry: 2,
    enabled: sport === "NFL" && accepted,
  });

  const nbaQuery = useQuery({
    queryKey: ["nba-slate", nbaGroupId ?? "auto"],
    queryFn: () => fetchNbaSlate(nbaGroupId),
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: NBA_REFRESH_MS,
    retry: 2,
    enabled: sport === "NBA" && accepted,
  });

  const data = query.data;
  const nba = nbaQuery.data;
  const nbaData = nba && nba.ok ? nba : undefined;
  const nbaError =
    nba && !nba.ok
      ? nba.error
      : !nbaQuery.isLoading && nbaQuery.isError
        ? nbaQuery.error instanceof Error
          ? nbaQuery.error.message
          : "NBA slate failed"
        : null;


  function toggleLock(id: string) {
    setLocks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setExcludes((prev) => prev.filter((x) => x !== id));
  }
  function toggleExclude(id: string) {
    setExcludes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setLocks((prev) => prev.filter((x) => x !== id));
  }
  function toggleNbaLock(id: string) {
    setNbaLocks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setNbaExcludes((prev) => prev.filter((x) => x !== id));
  }
  function toggleNbaExclude(id: string) {
    setNbaExcludes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setNbaLocks((prev) => prev.filter((x) => x !== id));
  }

  async function refresh() {
    setRefreshing(true);
    try {
      if (sport === "NBA") {
        const next = await fetchNbaSlate(nbaGroupId, true);
        queryClient.setQueryData(["nba-slate", nbaGroupId ?? "auto"], next);
      } else {
        const next = await fetchSlate(draftGroupId, true);
        queryClient.setQueryData(["slate", draftGroupId ?? "auto"], next);
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (!gateReady) return <BootScreen />;
  if (!accepted) {
    return (
      <DisclaimerGate
        onAccept={() => {
          writeDisclaimerAccepted();
          setAccepted(true);
        }}
      />
    );
  }

  if (sport === "NBA") {
    return (
      <NbaShell
        nba={nbaData}
        error={nbaError}
        loading={nbaQuery.isLoading && !nbaData}

        tab={tab === "pools" || tab === "ppr" ? "board" : tab}
        onTab={setTab}
        onSport={chooseSport}
        onSlate={setNbaGroupId}
        onRefresh={() => void refresh()}
        refreshing={refreshing || nbaQuery.isFetching}
        locks={nbaLocks}
        excludes={nbaExcludes}
        onToggleLock={toggleNbaLock}
        onToggleExclude={toggleNbaExclude}
      />
    );
  }

  if (query.isLoading && !data) return <BootScreen />;
  if (!data || !data.ok) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="display text-3xl font-semibold">SNAPVALUE</p>
        <p className="text-muted-foreground text-sm">
          {data && !data.ok ? data.error : "DraftKings blocked slate fetch — retry"}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => chooseSport("NBA")} variant="secondary">
            NBA
          </Button>
          <Button onClick={() => void refresh()}>
            <RefreshCw /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="hash-bg min-h-dvh">
      <Header
        sport="NFL"
        data={data}
        tab={tab}
        onSport={chooseSport}
        onSlate={setDraftGroupId}
        onRefresh={() => void refresh()}
        onPpr={() => setTab(tab === "ppr" ? "board" : "ppr")}
        refreshing={refreshing || query.isFetching}
      />
      <MatchupStrip games={data.games} />
      {data.stale ? (
        <p className="bg-warn/15 text-warn mx-auto max-w-[1440px] px-4 py-2 text-center text-sm lg:px-6">
          DraftKings blocked a live refresh — showing cached slate. Retry in a bit.
        </p>
      ) : null}
      <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-6">
        <StatsBar data={data} />
        <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
          {(
            [
              ["board", "Players"],
              ["lineups", "Lineups"],
              ["pools", "Survivor / Loser"],
              ["bets", "Bets"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTab(id);
              }}
              className={cn(
                "h-11 flex-1 rounded-md px-1 text-center text-xs font-medium leading-tight transition-colors duration-150 sm:text-sm",
                tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === "board" && (
            <>
              <PlayerBoard
                data={data}
                locks={locks}
                excludes={excludes}
                onToggleLock={toggleLock}
                onToggleExclude={toggleExclude}
              />
              <DvpBoard data={data} />
            </>
          )}
          {tab === "lineups" && (
            <LineupStudio
              players={data.players}
              games={data.games}
              locks={locks}
              excludes={excludes}
              onToggleLock={toggleLock}
              format={data.format ?? "classic"}
            />
          )}
          {tab === "pools" && <PoolStudio games={data.games} week={data.week} season={data.season} />}
          {tab === "bets" && (
            <BetDesk games={data.games} players={data.players} week={data.week} season={data.season} />
          )}
          {tab === "ppr" && <PprBoard data={data} />}
        </div>
      </div>
      <DisclaimerFooter />
    </div>
  );
}

function NbaShell({
  nba,
  error,
  loading,
  tab,
  onTab,
  onSport,
  onSlate,
  onRefresh,
  refreshing,
  locks,
  excludes,
  onToggleLock,
  onToggleExclude,
}: {
  nba?: NbaSlateData;
  error: string | null;
  loading: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onSport: (s: Sport) => void;
  onSlate: (id: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
  locks: string[];
  excludes: string[];
  onToggleLock: (id: string) => void;
  onToggleExclude: (id: string) => void;
}) {
  if (loading) return <BootScreen sport="NBA" />;
  if (error && !nba) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="display text-3xl font-semibold">SNAPVALUE</p>
        <p className="text-muted-foreground text-sm">{error}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onSport("NFL")}>
            NFL
          </Button>
          <Button onClick={onRefresh}>
            <RefreshCw /> Retry
          </Button>
        </div>
      </div>
    );
  }
  if (!nba) return <BootScreen sport="NBA" />;

  return (
    <div className="hash-bg min-h-dvh">
      <Header
        sport="NBA"
        nba={nba}
        tab={tab}
        onSport={onSport}
        onSlate={onSlate}
        onRefresh={onRefresh}
        onPpr={() => onTab("board")}
        refreshing={refreshing}
      />
      <MatchupStrip games={nba.games} />
      {nba.notice ? (
        <p className="bg-ink/10 text-ink mx-auto max-w-[1440px] px-4 py-2 text-center text-sm lg:px-6">{nba.notice}</p>
      ) : null}
      <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-6">
        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
          <span>
            <span className="text-faint">SITE </span>DraftKings NBA Classic
          </span>
          <span>
            <span className="text-faint">CAP </span>$50,000
          </span>
          <span>
            <span className="text-faint">PLAYERS </span>
            {nba.players.length}
          </span>
          <span>
            <span className="text-faint">GAMES </span>
            {nba.games.length}
          </span>
          <span className="min-w-0">
            <span className="text-faint">SOURCES </span>
            {nba.sources.filter((s) => s.ok).map((s) => `${s.label}${s.players ? ` ${s.players}` : ""}`).join(" · ") || "—"}
          </span>
        </div>
        <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
          {(
            [
              ["board", "Players"],
              ["lineups", "Lineups"],
              ["bets", "Bets"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className={cn(
                "h-11 flex-1 rounded-md px-1 text-center text-xs font-medium sm:text-sm",
                tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          {tab === "board" && (
            <NbaBoard data={nba} locks={locks} excludes={excludes} onToggleLock={onToggleLock} onToggleExclude={onToggleExclude} />
          )}
          {tab === "lineups" && (
            <NbaLineups data={nba} locks={locks} excludes={excludes} onToggleLock={onToggleLock} />
          )}
          {tab === "bets" && <NbaBets data={nba} />}
        </div>
      </div>
      <DisclaimerFooter />
    </div>
  );
}

function slateName(suffix: string): string {
  const raw = suffix.replace(/[()]/g, "").trim() || "Main";
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const names: Record<string, string> = {
    main: "Main",
    early: "Early",
    afternoon: "Afternoon",
    primetime: "Primetime",
    "prime time": "Primetime",
    "sun-mon": "Sun–Mon",
    "thu-mon": "Thu–Mon",
    "thu-sun": "Thu–Sun",
    "fri-mon": "Fri–Mon",
    sun: "Sunday",
    "sun only": "Sunday",
    showdown: "Showdown",
  };
  return names[key] ?? raw.replace(/-/g, "–");
}

function formatCap(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

function Header({
  sport,
  data,
  nba,
  tab,
  onSport,
  onSlate,
  onRefresh,
  onPpr,
  refreshing,
}: {
  sport: Sport;
  data?: SlateData;
  nba?: NbaSlateData;
  tab: Tab;
  onSport: (s: Sport) => void;
  onSlate: (id: number) => void;
  onRefresh: () => void;
  onPpr: () => void;
  refreshing: boolean;
}) {
  const fetchedAt = sport === "NBA" ? nba?.fetchedAt ?? "" : data?.fetchedAt ?? "";
  const [now, setNow] = useState(() => Date.parse(fetchedAt) || 0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [fetchedAt]);
  const slates = sport === "NBA" ? nba?.slates ?? [] : data?.slates ?? [];
  const activeId = sport === "NBA" ? nba?.draftGroupId : data?.draftGroupId;
  return (
    <header className="border-border/80 border-b">
      <div className="relative overflow-hidden">
        <img
          src="/command-center.jpg"
          alt=""
          className="h-36 w-full object-cover object-[center_85%] sm:h-44 lg:h-52"
        />
        <div className="from-background absolute inset-0 bg-gradient-to-t via-background/80 to-background/40" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1440px] px-4 pb-4 lg:px-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="display text-4xl leading-none font-semibold tracking-wide sm:text-5xl">SNAPVALUE</h1>
            <p className="display text-2xl leading-none font-semibold tracking-wide text-ink sm:text-3xl">
              DFS Command Center
            </p>
          </div>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm sm:text-base">
            {sport === "NBA" ? "Tonight’s board. Spend the cap. Smash the slate." : "Read the tape. Spend the cap. Smash the slate."}
          </p>
        </div>
      </div>
      <div className="border-border/80 sticky top-0 z-30 border-t bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 pt-3 pb-2 lg:px-6">
        <p className="display text-lg leading-none font-semibold tracking-wide">SNAPVALUE</p>
        <div className="flex rounded-md bg-secondary p-0.5 shadow-[var(--shadow-border)]">
          {(["NFL", "NBA"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSport(s)}
              className={cn(
                "h-9 min-w-12 rounded-sm px-3 text-xs font-semibold tracking-wide",
                sport === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 font-mono text-xs">
          {sport === "NBA" ? "DAILY" : `WK ${data?.week ?? ""}`}
        </span>
        <p className="text-faint hidden min-w-0 truncate font-mono text-[11px] md:block">
          {fetchedAt ? `Updated ${relativeTime(fetchedAt, now)}` : ""}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {sport === "NFL" ? (
            <Button variant={tab === "ppr" ? "default" : "secondary"} size="sm" onClick={onPpr}>
              Weekly PPR
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 pb-3 lg:px-6">
        {slates.length ? (
          <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:snap-none [&::-webkit-scrollbar]:hidden">
            {slates.map((s) => {
              const on = s.draftGroupId === activeId;
              return (
                <button
                  key={s.draftGroupId}
                  type="button"
                  onClick={() => onSlate(s.draftGroupId)}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-11 min-w-[9.25rem] shrink-0 snap-start flex-col items-start justify-center rounded-lg px-3 py-2 text-left transition-colors duration-150",
                    on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {on ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                    <span className="display text-sm leading-none font-semibold tracking-wide">
                      {s.format === "showdown" ? s.suffix : slateName(s.suffix)}
                    </span>
                  </span>
                  <span className={cn("mt-1 font-mono text-[11px] tabular-nums", on ? "text-primary-foreground/70" : "text-faint")}>
                    {s.gameCount} {s.gameCount === 1 ? "game" : "games"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : sport === "NBA" ? (
          <p className="text-muted-foreground text-sm">No DraftKings NBA Classic slate posted yet.</p>
        ) : null}
        <p className="text-faint mt-2 font-mono text-[11px]">
          {sport === "NBA"
            ? `DraftKings NBA Classic · ${formatCap(nba?.salaryCap ?? 50000)}`
            : `${data?.format === "showdown" ? "DraftKings Showdown · CPT 1.5×" : "DraftKings Classic"} · ${formatCap(data?.salaryCap ?? 50000)}`}
        </p>
      </div>
      </div>
    </header>
  );
}

function MatchupStrip({ games }: { games: SlateData["games"] }) {
  if (!games.length) return null;
  return (
    <div className="border-border/60 border-b">
      <div className="mx-auto flex max-w-[1440px] gap-2 overflow-x-auto px-4 py-3 lg:px-6">
        {games.map((g) => (
          <div key={g.id} className="bg-card shrink-0 rounded-lg px-3 py-2 shadow-[var(--shadow-border)]">
            <p className="display text-sm leading-none font-semibold">
              {g.awayAbbr} <span className="text-faint font-sans text-[10px]">@</span> {g.homeAbbr}
            </p>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[11px]">
              {kickoffLabel(g.startTime)}
              {g.total != null ? ` · O/U ${g.total.toFixed(1)}` : null}
              {g.spread != null ? ` · ${g.homeAbbr} ${g.spread > 0 ? "+" : ""}${g.spread}` : null}
              {g.isDome ? " · Dome" : g.weather ? ` · ${g.weather.replace(/-/g, " ")}` : null}
            </p>
            {(g.awayImplied != null || g.homeImplied != null) && (
              <p className="text-faint mt-0.5 font-mono text-[11px] tabular-nums">
                {g.awayImplied?.toFixed(1) ?? "—"} @ {g.homeImplied?.toFixed(1) ?? "—"}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsBar({ data }: { data: SlateData }) {
  const summary = useMemo(() => {
    const values = data.players.filter((p) => p.isValuePlay);
    const it = data.players.filter((p) => p.itFactor);
    const vegas = data.players.filter((p) => p.rankingMethod === "props");
    return {
      players: data.players.length,
      values: values.length,
      it: it.length,
      vegas: vegas.length,
    };
  }, [data]);
  const live = data.sources.filter((s) => s.ok);
  return (
    <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
      <span>
        <span className="text-faint">SITE </span>DraftKings Classic
      </span>
      <span>
        <span className="text-faint">CAP </span>$50,000
      </span>
      <span>
        <span className="text-faint">PLAYERS </span>
        {summary.players}
      </span>
      <span className="text-ink">
        <span className="text-faint">VEGAS PROPS </span>
        {summary.vegas}
      </span>
      <span className="text-value">
        <span className="text-faint">VALUE </span>
        {summary.values}
      </span>
      <span className="text-ink">
        <span className="text-faint">IT FACTOR </span>
        {summary.it}
      </span>
      <span className="min-w-0">
        <span className="text-faint">SOURCES </span>
        {live.map((s) => `${s.label}${s.players ? ` ${s.players}` : ""}`).join(" · ") || "—"}
      </span>
    </div>
  );
}

function BootScreen({ sport }: { sport?: Sport }) {
  return (
    <div className="hash-bg flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="display text-4xl font-semibold tracking-wide">SNAPVALUE</p>
      <p className="text-muted-foreground text-sm">
        {sport === "NBA" ? "Pulling DraftKings NBA Classic, ESPN, and FanDuel…" : "Pulling Yahoo, CBS, FantasyPros, Vegas props, and X tape…"}
      </p>
    </div>
  );
}