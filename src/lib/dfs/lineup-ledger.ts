import type { ContestStyle } from "./optimizer";
import type { CashVerdict, LineupReview } from "./cash-review";
import type { Lineup, SlateFormat } from "./types";

export interface LineupLedgerEntry {
  id: string;
  /** Stable key: sport:season:week:contest:lineupId (or event for UFC) */
  key: string;
  week: number;
  season: number;
  sport: "NFL" | "UFC";
  contestStyle: string;
  format: SlateFormat | string;
  projection: number;
  actual: number | null;
  verdict: CashVerdict;
  line: number;
  lineLabel: string;
  playerNames: string[];
  recordedAt: string;
  updatedAt: string;
}

export interface LineupLedgerStore {
  entries: LineupLedgerEntry[];
}

const LS = "sv-lineup-ledger-v1";

function canUseLs(): boolean {
  return typeof localStorage !== "undefined";
}

function readStore(): LineupLedgerStore {
  try {
    if (!canUseLs()) return { entries: [] };
    const raw = localStorage.getItem(LS);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as LineupLedgerStore;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function writeStore(store: LineupLedgerStore) {
  try {
    if (!canUseLs()) return;
    localStorage.setItem(LS, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function loadLineupLedger(): LineupLedgerEntry[] {
  return readStore().entries;
}

function entryKey(opts: {
  sport: "NFL" | "UFC";
  season: number;
  week: number;
  contestStyle: string;
  lineupId: string;
}): string {
  return `${opts.sport}:${opts.season}:${opts.week}:${opts.contestStyle}:${opts.lineupId}`;
}

/**
 * Persist lineup review outcomes when shown/exported or post-slate review runs.
 * Updates actual/verdict if the same key already exists.
 */
export function recordLineupReviews(opts: {
  lineups: Lineup[];
  reviews: Array<LineupReview | null>;
  week: number;
  season: number;
  sport?: "NFL" | "UFC";
  contestStyle: ContestStyle | string;
  format: SlateFormat | string;
}): LineupLedgerEntry[] {
  const sport = opts.sport ?? "NFL";
  const store = readStore();
  const byKey = new Map(store.entries.map((e) => [e.key, e]));
  const now = new Date().toISOString();

  opts.lineups.forEach((lu, i) => {
    const rev = opts.reviews[i];
    if (!rev) return;
    const key = entryKey({
      sport,
      season: opts.season,
      week: opts.week,
      contestStyle: String(opts.contestStyle),
      lineupId: lu.id,
    });
    const prev = byKey.get(key);
    const next: LineupLedgerEntry = {
      id: lu.id,
      key,
      week: opts.week,
      season: opts.season,
      sport,
      contestStyle: String(opts.contestStyle),
      format: opts.format,
      projection: rev.projected,
      actual: rev.actual,
      verdict: rev.verdict,
      line: rev.line,
      lineLabel: rev.lineLabel,
      playerNames: lu.players.map((lp) => lp.player.name),
      recordedAt: prev?.recordedAt ?? now,
      updatedAt: now,
    };
    if (prev) {
      const settled = rev.verdict === "cash" || rev.verdict === "miss" || rev.verdict === "borderline";
      const prevSettled = prev.verdict === "cash" || prev.verdict === "miss" || prev.verdict === "borderline";
      if (prevSettled && !settled) {
        if (rev.actual != null && (prev.actual == null || rev.actual !== prev.actual)) {
          byKey.set(key, { ...prev, actual: rev.actual, updatedAt: now });
        }
        return;
      }
    }
    byKey.set(key, next);
  });

  store.entries = [...byKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (store.entries.length > 200) store.entries = store.entries.slice(0, 200);
  writeStore(store);
  return store.entries;
}

/** UFC: record projection-only snapshots on export / show (no DK actuals). */
export function recordUfcLineupSnapshots(opts: {
  lineups: Array<{ id: string; projection: number; players: Array<{ player: { name: string } }> }>;
  eventId: number;
  season: number;
  contestStyle: string;
  format: string;
}): LineupLedgerEntry[] {
  const store = readStore();
  const byKey = new Map(store.entries.map((e) => [e.key, e]));
  const now = new Date().toISOString();
  for (const lu of opts.lineups) {
    const key = entryKey({
      sport: "UFC",
      season: opts.season,
      week: opts.eventId,
      contestStyle: opts.contestStyle,
      lineupId: lu.id,
    });
    const prev = byKey.get(key);
    byKey.set(key, {
      id: lu.id,
      key,
      week: opts.eventId,
      season: opts.season,
      sport: "UFC",
      contestStyle: opts.contestStyle,
      format: opts.format,
      projection: lu.projection,
      actual: prev?.actual ?? null,
      verdict: prev?.verdict ?? "pending",
      line: prev?.line ?? 0,
      lineLabel: prev?.lineLabel ?? "UFC DFS (proj only)",
      playerNames: lu.players.map((lp) => lp.player.name),
      recordedAt: prev?.recordedAt ?? now,
      updatedAt: now,
    });
  }
  store.entries = [...byKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (store.entries.length > 200) store.entries = store.entries.slice(0, 200);
  writeStore(store);
  return store.entries;
}

export function lineupLedgerSummary(
  entries: LineupLedgerEntry[],
  week: number,
  season: number,
  sport: "NFL" | "UFC" = "NFL",
) {
  const scope = entries.filter((e) => e.sport === sport);
  const weekRows = scope.filter((e) => e.week === week && e.season === season);
  const decided = scope.filter((e) => e.verdict === "cash" || e.verdict === "miss" || e.verdict === "borderline");
  const weekDecided = weekRows.filter((e) => e.verdict === "cash" || e.verdict === "miss" || e.verdict === "borderline");
  const tally = (rows: LineupLedgerEntry[]) => {
    const cash = rows.filter((e) => e.verdict === "cash").length;
    const miss = rows.filter((e) => e.verdict === "miss").length;
    const borderline = rows.filter((e) => e.verdict === "borderline").length;
    const n = cash + miss + borderline;
    return { cash, miss, borderline, n, hit: n ? cash / n : 0 };
  };
  return {
    season: tally(decided),
    week: tally(weekDecided),
    weekRows,
    recent: scope.slice(0, 8),
  };
}

/** Clear empty-state copy when no lineup grades yet. */
export function emptyLineupGradeHint(sport: "NFL" | "UFC" = "NFL"): string {
  if (sport === "UFC") {
    return "No UFC lineups graded yet. Snapshots stamp when shown or exported; actuals stay pending for now.";
  }
  return "No stamped slate yet — grades appear after lock. Run post-slate review after boxes post.";
}
