import { gamePhase, kickoffMs } from "./markets";
import type { TdParlay, WeeklyDesk } from "./desk";
import type { Game } from "./types";

/** Snapshot of a published desk bet for stable settlement after desk regenerates. */
export interface StampedBet {
  id: string;
  market: string;
  pick: string;
  unit: string;
  title?: string;
  line?: string;
  sport: "NFL" | "UFC";
  week: number;
  season: number;
  eventId?: string;
  fightId?: string;
  fighter?: string;
  /** NFL TD / multi-TD / lotto legs */
  legs?: Array<{ name: string; team?: string; kind?: "multi_td" | "atd" }>;
  /** UFC trifecta / lotto parlay legs (opaque JSON-safe) */
  ufcLegs?: Array<{
    kind: string;
    fighter: string;
    fightId: string;
    american?: number | null;
  }>;
  stampedAt: string;
}

export interface StampStore {
  stamps: StampedBet[];
}

const STAMP_LS = "sv-bet-stamp-v1";

/** Stamp when kickoff is within this window or already started. */
const STAMP_APPROACH_MS = 2 * 60 * 60 * 1000;

function canUseLs(): boolean {
  return typeof localStorage !== "undefined";
}

function readStampStore(): StampStore {
  try {
    if (!canUseLs()) return { stamps: [] };
    const raw = localStorage.getItem(STAMP_LS);
    if (!raw) return { stamps: [] };
    const parsed = JSON.parse(raw) as StampStore;
    return { stamps: Array.isArray(parsed.stamps) ? parsed.stamps : [] };
  } catch {
    return { stamps: [] };
  }
}

function writeStampStore(store: StampStore) {
  try {
    if (!canUseLs()) return;
    localStorage.setItem(STAMP_LS, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function stampKey(b: Pick<StampedBet, "sport" | "week" | "season" | "eventId" | "id">): string {
  const scope = b.sport === "UFC" ? `UFC:${b.eventId ?? b.week}` : `NFL:${b.season}:${b.week}`;
  return `${scope}:${b.id}`;
}

export function loadStampedBets(opts?: {
  sport?: "NFL" | "UFC";
  week?: number;
  season?: number;
  eventId?: string | number;
}): StampedBet[] {
  const all = readStampStore().stamps;
  return all.filter((s) => {
    if (opts?.sport && s.sport !== opts.sport) return false;
    if (opts?.week != null && s.week !== opts.week) return false;
    if (opts?.season != null && s.season !== opts.season) return false;
    if (opts?.eventId != null && String(s.eventId ?? "") !== String(opts.eventId)) return false;
    return true;
  });
}

function upsertStamps(rows: StampedBet[]): StampedBet[] {
  if (!rows.length) return readStampStore().stamps;
  const store = readStampStore();
  const have = new Set(store.stamps.map(stampKey));
  const fresh = rows.filter((r) => !have.has(stampKey(r)));
  if (fresh.length) {
    store.stamps = [...store.stamps, ...fresh];
    writeStampStore(store);
  }
  return store.stamps;
}

function nflShouldStamp(games: Game[], now: number): boolean {
  if (!games.length) return false;
  return games.some((g) => {
    const t = kickoffMs(g.startTime);
    if (!t) return false;
    if (now >= t - STAMP_APPROACH_MS) return true;
    return gamePhase(g.startTime, now) !== "pre";
  });
}

function ufcShouldStamp(startTimes: string[], now: number): boolean {
  if (!startTimes.length) return true;
  return startTimes.some((iso) => {
    const t = kickoffMs(iso);
    if (!t) return true;
    return now >= t - STAMP_APPROACH_MS;
  });
}

function collectNflPublishable(desk: WeeklyDesk): Array<{
  id: string;
  market: string;
  pick: string;
  unit: string;
  title?: string;
  line?: string;
  legs?: StampedBet["legs"];
}> {
  const rows: Array<{
    id: string;
    market: string;
    pick: string;
    unit: string;
    title?: string;
    line?: string;
    legs?: StampedBet["legs"];
  }> = [];
  for (const b of [...desk.bestBets, desk.spreadLock, desk.moneylineDog, ...desk.playerProps]) {
    if (!b) continue;
    rows.push({ id: b.id, market: b.market, pick: b.pick, unit: b.unit, title: b.title, line: b.line });
  }
  const parlays: Array<{ id: string; market: string; parlay: TdParlay; unitFallback: string }> = [];
  if (desk.atdParlay) parlays.push({ id: "atd-2", market: "atd", parlay: desk.atdParlay, unitFallback: "0.5u" });
  if (desk.atdParlay3) parlays.push({ id: "atd-3", market: "atd3", parlay: desk.atdParlay3, unitFallback: "0.25u" });
  if (desk.multiTdParlay) parlays.push({ id: "multi-td", market: "multi_td", parlay: desk.multiTdParlay, unitFallback: "0.25u" });
  if (desk.lottoTicket) parlays.push({ id: "lotto", market: "lotto", parlay: desk.lottoTicket, unitFallback: "0.1u" });
  for (const p of parlays) {
    rows.push({
      id: p.id,
      market: p.market,
      pick: p.parlay.legs.map((l) => l.name).join(" + "),
      unit: p.parlay.unit ?? p.unitFallback,
      legs: p.parlay.legs.map((l) => ({ name: l.name, team: l.team, kind: l.kind })),
    });
  }
  return rows;
}

/** Snapshot NFL published desk bets once kickoff approaches / slate locks. Idempotent per week. */
export function maybeStampNflDesk(opts: {
  desk: WeeklyDesk;
  games: Game[];
  week: number;
  season: number;
  now?: number;
}): StampedBet[] {
  const now = opts.now ?? Date.now();
  if (!nflShouldStamp(opts.games, now)) return loadStampedBets({ sport: "NFL", week: opts.week, season: opts.season });
  const published = collectNflPublishable(opts.desk);
  if (!published.length) return loadStampedBets({ sport: "NFL", week: opts.week, season: opts.season });
  const stampedAt = new Date(now).toISOString();
  return upsertStamps(
    published.map((b) => ({
      ...b,
      sport: "NFL" as const,
      week: opts.week,
      season: opts.season,
      stampedAt,
    })),
  );
}

/** Snapshot UFC published bets when card lock / first show with fights approaching. Idempotent per event. */
export function maybeStampUfcDesk(opts: {
  bets: Array<{
    id: string;
    market: string;
    pick: string;
    unit: string;
    title?: string;
    line?: string;
    fightId?: string;
    fighter?: string;
    legs?: Array<{ kind: string; fighter: string; fightId: string; american?: number | null }>;
  }>;
  fightStartTimes: string[];
  eventId: number;
  season: number;
  now?: number;
}): StampedBet[] {
  const now = opts.now ?? Date.now();
  if (!ufcShouldStamp(opts.fightStartTimes, now)) {
    return loadStampedBets({ sport: "UFC", eventId: opts.eventId, season: opts.season });
  }
  if (!opts.bets.length) {
    return loadStampedBets({ sport: "UFC", eventId: opts.eventId, season: opts.season });
  }
  const stampedAt = new Date(now).toISOString();
  return upsertStamps(
    opts.bets.map((b) => ({
      id: b.id,
      market: b.market,
      pick: b.pick,
      unit: b.unit,
      title: b.title,
      line: b.line,
      sport: "UFC" as const,
      week: opts.eventId,
      season: opts.season,
      eventId: String(opts.eventId),
      fightId: b.fightId,
      fighter: b.fighter,
      ufcLegs: b.legs,
      stampedAt,
    })),
  );
}
