import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { REFRESH_MS } from "@/lib/dfs/constants";
import { kickoffLabel, relativeTime } from "@/lib/dfs/format-ui";
import type { SlateData, SlateResponse } from "@/lib/dfs/types";
import { cn } from "@/lib/utils";
import { BetDesk } from "./bet-desk";
import { DisclaimerFooter, DisclaimerGate, readDisclaimerAccepted, writeDisclaimerAccepted } from "./disclaimer-gate";
import { DvpBoard } from "./dvp-board";
import { LineupStudio } from "./lineup-studio";
import { PlayerBoard } from "./player-board";
import { PoolStudio } from "./pool-studio";
import { PprBoard } from "./ppr-board";

type Tab = "board" | "lineups" | "pools" | "bets" | "ppr";

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

export function SnapApp({ initial }: { initial?: SlateResponse }) {
  const queryClient = useQueryClient();
  const initialId = initial?.ok ? initial.draftGroupId : undefined;
  const [draftGroupId, setDraftGroupId] = useState<number | undefined>(initialId);
  const [tab, setTab] = useState<Tab>("board");
  const [locks, setLocks] = useState<string[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [gateReady, setGateReady] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(readDisclaimerAccepted());
    setGateReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["slate", draftGroupId ?? "auto"],
    queryFn: () => fetchSlate(draftGroupId),
    initialData: initial && draftGroupId === initialId ? initial : undefined,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: REFRESH_MS,
    retry: 2,
  });

  const data = query.data;

  function toggleLock(id: string) {
    setLocks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setExcludes((prev) => prev.filter((x) => x !== id));
  }
  function toggleExclude(id: string) {
    setExcludes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setLocks((prev) => prev.filter((x) => x !== id));
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const next = await fetchSlate(draftGroupId, true);
      queryClient.setQueryData(["slate", draftGroupId ?? "auto"], next);
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

  if (query.isLoading && !data) return <BootScreen />;
  if (!data || !data.ok) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="display text-3xl font-semibold">SNAPVALUE</p>
        <p className="text-muted-foreground text-sm">
          {data && !data.ok ? data.error : "Could not load this week's slate."}
        </p>
        <Button onClick={() => void refresh()}>
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="hash-bg min-h-dvh">
      <Header
        data={data}
        tab={tab}
        onSlate={setDraftGroupId}
        onRefresh={() => void refresh()}
        onPpr={() => setTab(tab === "ppr" ? "board" : "ppr")}
        refreshing={refreshing || query.isFetching}
      />
      <MatchupStrip games={data.games} />
      <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-6">
        <StatsBar data={data} />
        <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)]">
          {(
            [
              ["board", "Players"],
              ["lineups", "Lineups"],
              ["pools", "Pools"],
              ["bets", "Bets"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "h-11 flex-1 rounded-md text-sm font-medium transition-colors duration-150",
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
              locks={locks}
              excludes={excludes}
              onToggleLock={toggleLock}
            />
          )}
          {tab === "pools" && <PoolStudio games={data.games} />}
          {tab === "bets" && <BetDesk games={data.games} players={data.players} />}
          {tab === "ppr" && <PprBoard data={data} />}
        </div>
      </div>
      <DisclaimerFooter />
    </div>
  );
}

function Header({
  data,
  tab,
  onSlate,
  onRefresh,
  onPpr,
  refreshing,
}: {
  data: SlateData;
  tab: Tab;
  onSlate: (id: number) => void;
  onRefresh: () => void;
  onPpr: () => void;
  refreshing: boolean;
}) {
  const [now, setNow] = useState(() => Date.parse(data.fetchedAt) || 0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [data.fetchedAt]);
  return (
    <header className="border-border/80 border-b">
      <div className="relative overflow-hidden">
        <img
          src="/command-center.jpg"
          alt=""
          className="h-40 w-full object-cover object-center sm:h-52 lg:h-60"
        />
        <div className="from-background absolute inset-0 bg-gradient-to-t via-background/55 to-background/20" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1440px] px-4 pb-4 lg:px-6">
          <p className="display text-ink text-[11px] tracking-[0.28em] uppercase">SNAPVALUE</p>
          <h1 className="display text-4xl leading-none font-semibold tracking-wide sm:text-5xl">DFS Command Center</h1>
          <p className="text-muted-foreground mt-1.5 max-w-xl text-sm sm:text-base">
            Read the tape. Spend the cap. Smash the slate.
          </p>
        </div>
      </div>
      <div className="border-border/80 sticky top-0 z-30 border-t bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 lg:px-6">
        <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 font-mono text-xs">
          WK {data.week}
        </span>
        <p className="text-faint hidden min-w-0 truncate font-mono text-[11px] md:block">
          Updated {relativeTime(data.fetchedAt, now)} · auto {relativeTime(data.nextRefreshAt, now)}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button variant={tab === "ppr" ? "default" : "secondary"} size="sm" onClick={onPpr}>
            Weekly PPR
          </Button>
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1440px] gap-1.5 overflow-x-auto px-4 pb-3 lg:px-6">
        {data.slates.map((s) => (
          <button
            key={s.draftGroupId}
            type="button"
            onClick={() => onSlate(s.draftGroupId)}
            className={cn(
              "h-10 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-150",
              s.draftGroupId === data.draftGroupId
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {s.suffix} · {s.gameCount}g
          </button>
        ))}
      </div>
      </div>
    </header>
  );
}

function MatchupStrip({ games }: { games: SlateData["games"] }) {
  return (
    <div className="border-border/60 border-b">
      <div className="mx-auto flex max-w-[1440px] gap-2 overflow-x-auto px-4 py-3 lg:px-6">
        {games.map((g) => (
          <div
            key={g.id}
            className="bg-card shrink-0 rounded-lg px-3 py-2 shadow-[var(--shadow-border)]"
          >
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

function BootScreen() {
  return (
    <div className="hash-bg flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="display text-4xl font-semibold tracking-wide">SNAPVALUE</p>
      <p className="text-muted-foreground text-sm">Pulling Yahoo, CBS, FantasyPros, Vegas props, and X tape…</p>
    </div>
  );
}
