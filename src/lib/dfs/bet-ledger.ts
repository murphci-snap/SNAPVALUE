import { gamePhase } from "./markets";
import type { DeskBet, DeskTighten, TdParlay, WeeklyDesk } from "./desk";
import { NO_TIGHTEN } from "./desk";
import type { Game, Player } from "./types";

export type GradeResult = "win" | "loss" | "push" | "void";

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

function readStore(): LedgerStore {
  try {
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
    localStorage.setItem(LS, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function gameOfTeam(games: Game[], team: string): Game | undefined {
  return games.find((g) => g.homeAbbr === team || g.awayAbbr === team);
}

function gameFinal(g: Game): boolean {
  if (g.homeScore == null || g.awayScore == null) return gamePhase(g.startTime) === "final";
  return gamePhase(g.startTime) === "final";
}

function playerByName(players: Player[], name: string): Player | undefined {
  const n = name.trim().toLowerCase();
  return players.find((p) => p.showdownRole !== "CPT" && p.name.toLowerCase() === n)
    ?? players.find((p) => p.showdownRole !== "CPT" && p.name.toLowerCase().includes(n));
}

function tds(p: Player): number {
  const b = p.actualBox;
  if (!b) return 0;
  return (b.rushTd ?? 0) + (b.recTd ?? 0);
}

function gradeSpread(bet: DeskBet, games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^([A-Z]{2,3})\s+([+-]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const team = m[1]!;
  const line = Number.parseFloat(m[2]!);
  const g = gameOfTeam(games, team);
  if (!g || !gameFinal(g) || g.homeScore == null || g.awayScore == null) return null;
  const margin = team === g.homeAbbr ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
  const cover = margin + line;
  if (Math.abs(cover) < 0.05) return "push";
  return cover > 0 ? "win" : "loss";
}

function gradeTotal(bet: DeskBet, games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^(over|under)\s+(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const side = m[1]!.toLowerCase();
  const line = Number.parseFloat(m[2]!);
  const g = games.find((x) => bet.line.includes(x.awayAbbr) && bet.line.includes(x.homeAbbr)) ?? games.find((x) => bet.id.includes(String(x.id)));
  if (!g || !gameFinal(g) || g.homeScore == null || g.awayScore == null) return null;
  const tot = g.homeScore + g.awayScore;
  if (Math.abs(tot - line) < 0.05) return "push";
  if (side === "over") return tot > line ? "win" : "loss";
  return tot < line ? "win" : "loss";
}

function gradeMl(bet: DeskBet, games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^([A-Z]{2,3})\s+/);
  const team = m?.[1] ?? bet.title.replace(/\s+ML.*/, "");
  const g = gameOfTeam(games, team);
  if (!g || !gameFinal(g) || g.homeScore == null || g.awayScore == null) return null;
  if (g.homeScore === g.awayScore) return "push";
  const won = team === g.homeAbbr ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
  return won ? "win" : "loss";
}

function gradeProp(bet: DeskBet, players: Player[], games: Game[]): GradeResult | null {
  const m = bet.pick.match(/^(.*?)\s+([ou])(\d+(?:\.\d+)?)\s+(pass|rush|rec)\s+yds/i);
  if (!m) return null;
  const p = playerByName(players, m[1]!);
  if (!p) return null;
  const g = gameOfTeam(games, p.team);
  if (!g || !gameFinal(g)) return null;
  const box = p.actualBox;
  const actual = !box
    ? 0
    : m[4]!.toLowerCase() === "pass"
      ? box.passYds
      : m[4]!.toLowerCase() === "rush"
        ? box.rushYds
        : box.recYds;
  const line = Number.parseFloat(m[3]!);
  const over = m[2]!.toLowerCase() === "o";
  if (Math.abs(actual - line) < 0.05) return "push";
  return over ? (actual > line ? "win" : "loss") : actual < line ? "win" : "loss";
}

function gradeParlay(parlay: TdParlay, players: Player[], games: Game[], twoPlus: boolean): GradeResult | null {
  const results: GradeResult[] = [];
  for (const leg of parlay.legs) {
    const p = playerByName(players, leg.name);
    if (!p) return null;
    const g = gameOfTeam(games, p.team);
    if (!g || !gameFinal(g)) return null;
    const n = tds(p);
    const need = twoPlus && leg.kind !== "atd" ? 2 : 1;
    results.push(n >= need ? "win" : "loss");
  }
  if (results.some((r) => r === "loss")) return "loss";
  if (results.every((r) => r === "win")) return "win";
  return "push";
}

function pnlOf(result: GradeResult, unit: number): number {
  if (result === "win") return unit;
  if (result === "loss") return -unit;
  return 0;
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
    out.atsAdd = 0.025;
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
  if (cold(of("prop"))) {
    out.propAdd = 0.025;
    out.notes.push("Props tightened from track record");
  }
  const atd = [...of("atd"), ...of("atd3")];
  if (cold(atd)) {
    out.atdMinEdge = 0.08;
    out.hideAtd3 = true;
    out.notes.push("ATD parlays tightened from track record");
  }
  if (cold(of("lotto"))) {
    out.hideLotto = true;
    out.notes.push("Lotto hidden from track record");
  }
  return out;
}

export function settleDesk(opts: {
  desk: WeeklyDesk;
  games: Game[];
  players: Player[];
  week: number;
  season: number;
}): GradedBet[] {
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
    });
  };

  for (const b of [...opts.desk.bestBets, opts.desk.spreadLock, opts.desk.moneylineDog, ...opts.desk.playerProps]) {
    if (!b) continue;
    let r: GradeResult | null = null;
    if (b.market === "spread") r = gradeSpread(b, opts.games);
    else if (b.market === "total") r = gradeTotal(b, opts.games);
    else if (b.market === "moneyline") r = gradeMl(b, opts.games);
    else if (b.market === "prop") r = gradeProp(b, opts.players, opts.games);
    push(b.id, b.market, b.pick, b.unit, r);
  }
  if (opts.desk.atdParlay) {
    push("atd-2", "atd", opts.desk.atdParlay.legs.map((l) => l.name).join(" + "), opts.desk.atdParlay.unit ?? "0.5u", gradeParlay(opts.desk.atdParlay, opts.players, opts.games, false));
  }
  if (opts.desk.atdParlay3) {
    push("atd-3", "atd3", opts.desk.atdParlay3.legs.map((l) => l.name).join(" + "), opts.desk.atdParlay3.unit ?? "0.25u", gradeParlay(opts.desk.atdParlay3, opts.players, opts.games, false));
  }
  if (opts.desk.multiTdParlay) {
    push("multi-td", "multi_td", opts.desk.multiTdParlay.legs.map((l) => l.name).join(" + "), opts.desk.multiTdParlay.unit ?? "0.25u", gradeParlay(opts.desk.multiTdParlay, opts.players, opts.games, true));
  }
  if (opts.desk.lottoTicket) {
    push("lotto", "lotto", opts.desk.lottoTicket.legs.map((l) => l.name).join(" + "), opts.desk.lottoTicket.unit ?? "0.1u", gradeParlay(opts.desk.lottoTicket, opts.players, opts.games, false));
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
  return { season: tally(decided), week: tally(weekBets), byMarket, weekRows: bets.filter((b) => b.week === week && b.season === season) };
}