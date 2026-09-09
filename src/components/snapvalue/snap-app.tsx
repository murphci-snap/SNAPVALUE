import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { REFRESH_MS } from "@/lib/dfs/constants";
import { kickoffLabel, relativeTime } from "@/lib/dfs/format-ui";
import type { SlateData, SlateResponse } from "@/lib/dfs/types";
import { cn } from "@/lib/utils";
import { DvpBoard } from "./dvp-board";
import { LineupStudio } from "./lineup-studio";
import { PlayerBoard } from "./player-board";

type Tab = "board" | "lineups";

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
      <Header data={data} onSlate={setDraftGroupId} onRefresh={() => void refresh()} refreshing={refreshing || query.isFetching} />
      <MatchupStrip games={data.games} />
      <div className="mx-auto max-w-[1440px] px-4 pb-16 lg:px-6">
        <StatsBar data={data} />
        <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1 shadow-[var(--shadow-border)] lg:hidden">
          {(
            [
              ["board", "Players"],
              ["lineups", "Lineups"],
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
          <div className={cn(tab === "lineups" && "max-lg:hidden")}>
            <PlayerBoard
              data={data}
              locks={locks}
              excludes={excludes}
              onToggleLock={toggleLock}
              onToggleExclude={toggleExclude}
            />
            <DvpBoard data={data} />
          </div>
          <div className={cn("mt-8", tab === "board" && "max-lg:hidden")} id="lineups">
            <LineupStudio
              players={data.players}
              locks={locks}
              excludes={excludes}
              onToggleLock={toggleLock}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({
  data,
  onSlate,
  onRefresh,
  refreshing,
}: {
  data: SlateData;
  onSlate: (id: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [now, setNow] = useState(() => Date.parse(data.fetchedAt) || 0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [data.fetchedAt]);
  return (
    <header className="border-border/80 sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 lg:px-6">
        <div className="min-w-0 shrink-0">
          <p className="display hidden text-[11px] tracking-[0.22em] text-faint uppercase sm:block">Weekly DFS</p>
          <h1 className="display text-2xl leading-none font-semibold tracking-wide sm:text-3xl">SNAPVALUE</h1>
        </div>
        <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 font-mono text-xs">
          WK {data.week}
        </span>
        <p className="text-faint hidden min-w-0 truncate font-mono text-[11px] md:block">
          Updated {relativeTime(data.fetchedAt, now)} · auto {relativeTime(data.nextRefreshAt, now)}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="#lineups"
            className="text-muted-foreground hover:text-foreground hidden h-10 items-center rounded-full px-3 text-xs font-medium lg:inline-flex"
          >
            Lineup lab
          </a>
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
      <p className="text-muted-foreground text-sm">Pulling Vegas props, consensus rankings, and matchups…</p>
    </div>
  );
}
