import type { DeskTighten, TdParlay, WeeklyDesk } from "./desk";
import { NO_TIGHTEN } from "./desk";
import type { Game, Player } from "./types";
import {
  loadStampedBets,
  maybeStampNflDesk,
  maybeStampUfcDesk,
  type StampedBet,
} from "./bet-stamp";
import {
  gradeMl,
  gradeNflStamped,
  gradeParlay,
  gradeProp,
  gradeSpread,
  gradeTotal,
  pnlOf,
  type GradeResult,
} from "./bet-grade";

export type { StampedBet, GradeResult };
export { loadStampedBets, maybeStampNflDesk, maybeStampUfcDesk };

export interface GradedBet {
  id: string;
  week: number;
  season: number;
  market: string;
  pick: string;
  unit: number;
  result: GradeResult;
  pnl: number;
  settledAt: string;
  sport?: string;
  eventId?: string;
}

export interface LedgerStore {
  bets: GradedBet[];
}

const LS = "sv-bet-ledger-v1";

export function parseUnits(unit: string | undefined): number {
  const m = (unit ?? "0").match(/([\d.]+)\s*u/i);
  if (!m) return 0;
  return Number.parseFloat(m[1] ?? "0") || 0;
}

function canUseLs(): boolean {
  return typeof localStorage !== "undefined";
}

function readStore(): LedgerStore {
  try {
    if (!canUseLs()) return { bets: [] };
    const raw = localStorage.getItem(LS);
    if (!raw) return { bets: [] };
    const parsed = JSON.parse(raw) as LedgerStore;
    return { bets: Array.isArray(parsed.bets) ? parsed.bets : [] };
  } catch {
    return { bets: [] };
  }
}

function writeStore(store: LedgerStore) {
  try {
    if (!canUseLs()) return;
    localStorage.setItem(LS, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function loadLedger(): GradedBet[] {
  return readStore().bets;
}

/** Raise floors on cold markets. Ignore until ≥5 graded decisions. */
export function deskTighten(bets: GradedBet[]): DeskTighten {
  const decided = bets.filter((b) => b.result === "win" || b.result === "loss");
  const out: DeskTighten = { ...NO_TIGHTEN, notes: [] };
  const of = (m: string) => decided.filter((b) => b.market === m);
  const cold = (rows: GradedBet[]) => {
    if (rows.length < 5) return false;
    const units = rows.reduce((s, b) => s + b.pnl, 0);
    const w = rows.filter((b) => b.result === "win").length;
    const hit = w / rows.length;
    return units < -0.4 || hit < 0.4;
  };
  const spread = of("spread");
  if (cold(spread)) {
    out.atsAdd = spread.length >= 8 ? 0.022 : 0.015;
    out.notes.push("Spreads tightened from track record");
  }
  const totals = of("total");
  if (totals.length >= 5) {
    const overs = totals.filter((b) => /^over/i.test(b.pick));
    const unders = totals.filter((b) => /^under/i.test(b.pick));
    if (overs.length >= 4 && cold(overs)) {
      out.overAdd = 0.6;
      out.notes.push("Overs tightened from track record");
    }
    if (unders.length >= 4 && cold(unders)) {
      out.underAdd = 0.4;
      out.notes.push("Unders tightened from track record");
    }
    if (!out.overAdd && !out.underAdd && cold(totals)) {
      out.overAdd = 0.4;
      out.underAdd = 0.3;
      out.notes.push("Totals tightened from track record");
    }
  }
  const props = of("prop");
  if (cold(props)) {
    out.propAdd = props.length >= 8 ? 0.035 : 0.025;
    out.notes.push("Props tightened from track record");
  }
  const atd = [...of("atd"), ...of("atd3")];
  if (cold(atd)) {
    out.atdMinEdge = atd.length >= 8 ? 0.1 : 0.08;
    out.hideAtd3 = true;
    out.notes.push("ATD parlays tightened from track record");
  }
  if (cold(of("lotto"))) {
    out.hideLotto = true;
    out.notes.push("Lotto hidden from track record");
  }
  return out;
}

/**
 * Settle NFL desk: prefer stamped published bets (stable across desk regen),
 * then fall back to live desk for anything not yet stamped.
 */
export function settleDesk(opts: {
  desk: WeeklyDesk;
  games: Game[];
  players: Player[];
  week: number;
  season: number;
}): GradedBet[] {
  maybeStampNflDesk({ desk: opts.desk, games: opts.games, week: opts.week, season: opts.season });

  const store = readStore();
  const have = new Set(store.bets.filter((b) => b.week === opts.week && b.season === opts.season).map((b) => b.id));
  const fresh: GradedBet[] = [];

  const push = (id: string, market: string, pick: string, unitStr: string | undefined, result: GradeResult | null) => {
    if (!result || have.has(id)) return;
    const unit = parseUnits(unitStr);
    if (unit <= 0 && result !== "void") return;
    fresh.push({
      id,
      week: opts.week,
      season: opts.season,
      market,
      pick,
      unit,
      result,
      pnl: pnlOf(result, unit),
      settledAt: new Date().toISOString(),
      sport: "NFL",
    });
    have.add(id);
  };

  const stamped = loadStampedBets({ sport: "NFL", week: opts.week, season: opts.season });
  const stampedIds = new Set(stamped.map((s) => s.id));

  for (const s of stamped) {
    push(s.id, s.market, s.pick, s.unit, gradeNflStamped(s, opts.games, opts.players));
  }

  for (const b of [...opts.desk.bestBets, opts.desk.spreadLock, opts.desk.moneylineDog, ...opts.desk.playerProps]) {
    if (!b || stampedIds.has(b.id)) continue;
    let r: GradeResult | null = null;
    if (b.market === "spread") r = gradeSpread(b, opts.games);
    else if (b.market === "total") r = gradeTotal(b, opts.games);
    else if (b.market === "moneyline") r = gradeMl(b, opts.games);
    else if (b.market === "prop") r = gradeProp(b, opts.players, opts.games);
    push(b.id, b.market, b.pick, b.unit, r);
  }
  if (opts.desk.atdParlay && !stampedIds.has("atd-2")) {
    push(
      "atd-2",
      "atd",
      opts.desk.atdParlay.legs.map((l) => l.name).join(" + "),
      opts.desk.atdParlay.unit ?? "0.5u",
      gradeParlay(opts.desk.atdParlay, opts.players, opts.games, false),
    );
  }
  if (opts.desk.atdParlay3 && !stampedIds.has("atd-3")) {
    push(
      "atd-3",
      "atd3",
      opts.desk.atdParlay3.legs.map((l) => l.name).join(" + "),
      opts.desk.atdParlay3.unit ?? "0.25u",
      gradeParlay(opts.desk.atdParlay3, opts.players, opts.games, false),
    );
  }
  if (opts.desk.multiTdParlay && !stampedIds.has("multi-td")) {
    push(
      "multi-td",
      "multi_td",
      opts.desk.multiTdParlay.legs.map((l) => l.name).join(" + "),
      opts.desk.multiTdParlay.unit ?? "0.25u",
      gradeParlay(opts.desk.multiTdParlay, opts.players, opts.games, true),
    );
  }
  if (opts.desk.lottoTicket && !stampedIds.has("lotto")) {
    push(
      "lotto",
      "lotto",
      opts.desk.lottoTicket.legs.map((l) => l.name).join(" + "),
      opts.desk.lottoTicket.unit ?? "0.1u",
      gradeParlay(opts.desk.lottoTicket, opts.players, opts.games, false),
    );
  }

  if (fresh.length) {
    store.bets = [...store.bets, ...fresh];
    writeStore(store);
  }
  return store.bets;
}

export function ledgerSummary(bets: GradedBet[], week: number, season: number) {
  const decided = bets.filter((b) => b.result === "win" || b.result === "loss");
  const weekBets = decided.filter((b) => b.week === week && b.season === season);
  const tally = (rows: GradedBet[]) => {
    const w = rows.filter((b) => b.result === "win").length;
    const l = rows.filter((b) => b.result === "loss").length;
    const units = rows.reduce((s, b) => s + b.pnl, 0);
    const hit = w + l ? w / (w + l) : 0;
    return { w, l, units, hit };
  };
  const byMarket: Record<string, ReturnType<typeof tally>> = {};
  for (const b of decided) {
    const k = b.market;
    const rows = decided.filter((x) => x.market === k);
    byMarket[k] = tally(rows);
  }
  return {
    season: tally(decided),
    week: tally(weekBets),
    byMarket,
    weekRows: bets.filter((b) => b.week === week && b.season === season),
  };
}

export function recordSettledBets(rows: GradedBet[]): GradedBet[] {
  const store = readStore();
  const have = new Set(store.bets.map((b) => `${b.week}:${b.season}:${b.id}`));
  const fresh = rows.filter((r) => !have.has(`${r.week}:${r.season}:${r.id}`));
  if (fresh.length) {
    store.bets = [...store.bets, ...fresh];
    writeStore(store);
  }
  return store.bets;
}

/** Brief empty-state copy for track record UI. */
export function emptyGradeHint(opts: {
  sport: "NFL" | "UFC";
  stampedCount: number;
  gradedCount: number;
}): string {
  if (opts.gradedCount > 0) return "";
  if (opts.stampedCount === 0) {
    return opts.sport === "UFC"
      ? "Nothing graded yet. No stamped card — grades lock when the card is first shown near fight time. Empty bets are fine."
      : "No stamped slate yet — grades appear after lock. Empty bets are fine — not a dead model.";
  }
  return opts.sport === "UFC"
    ? "Card stamped. Nothing graded yet — grades when fights are final (ESPN completed + winner)."
    : "Slate stamped. Nothing graded yet — grades when games are final (scores / box when needed).";
}
