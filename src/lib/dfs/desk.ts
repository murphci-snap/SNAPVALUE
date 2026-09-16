import {
  clamp,
  formatPct,
  formatSpread,
  isUpcoming,
  parlayProb,
  probToAmerican,
  teamWinProb,
} from "./markets";
import { americanToProb, expectedTdsFromAnytime, isSidelined } from "./scoring";
import type { Game, Player } from "./types";

export type BetMarket = "spread" | "total" | "moneyline" | "prop";

export interface DeskBet {
  id: string;
  title: string;
  market: BetMarket;
  pick: string;
  line: string;
  edge: number;
  confidence: number;
  why: string;
  books: string;
  tape: string;
  unit: string;
}

export interface TdLeg {
  name: string;
  team: string;
  opponent: string;
  american: number;
  prob: number;
  why: string;
  kind?: "multi_td" | "atd";
  marketLabel?: string;
}

export interface TdParlay {
  legs: TdLeg[];
  combinedAmerican: number;
  combinedProb: number;
  why: string;
  tape: string;
  unit?: string;
}

export interface WeeklyDesk {
  bestBets: DeskBet[];
  spreadLock: DeskBet | null;
  moneylineDog: DeskBet | null;
  fades: DeskBet[];
  playerProps: DeskBet[];
  atdParlay: TdParlay | null;
  atdParlay3: TdParlay | null;
  multiTdParlay: TdParlay | null;
  lottoTicket: TdParlay | null;
  sources: string[];
  remainingOnly: boolean;
}

function playerAtd(p: Player): number {
  if (p.anytimeTd != null && p.anytimeTd > 0 && p.anytimeTd < 1) return p.anytimeTd;
  if (p.anytimeTd != null && Math.abs(p.anytimeTd) >= 100) return americanToProb(p.anytimeTd);
  if (p.week) {
    const exp = p.week.rushTd + p.week.recTd + (p.position === "QB" ? p.week.passTd * 0.1 : 0);
    return Math.min(0.55, Math.max(0, exp) * 0.72);
  }
  return 0;
}

/** Dampened team TDs — independence + rank decay. Not a raw ATD sum. */
function teamTdExpect(players: Player[], team: string): number {
  const probs = players
    .filter((p) => p.team === team && p.position !== "DST")
    .map(playerAtd)
    .filter((x) => x >= 0.08)
    .sort((a, b) => b - a)
    .slice(0, 5);
  if (!probs.length) return 1.6;
  let none = 1;
  let decayed = 0;
  probs.forEach((p, i) => {
    const x = Math.min(0.82, p);
    none *= 1 - x;
    decayed += x * Math.pow(0.64, i);
  });
  const atLeastOne = 1 - none;
  return clamp(Math.max(atLeastOne, decayed), 0.9, 3.1);
}

function impliedTdShare(players: Player[], team: string): number {
  return teamTdExpect(players, team);
}

function expectedTotal(game: Game, players: Player[]): { expected: number; market: number | null; tdNote: string } {
  const posted = game.total;
  const market =
    game.homeImplied != null && game.awayImplied != null ? game.homeImplied + game.awayImplied : null;
  const tds = teamTdExpect(players, game.homeAbbr) + teamTdExpect(players, game.awayAbbr);
  const fromTd = tds * 6.8 + 9.2 + (game.isDome ? 0.7 : 0);
  let expected = market != null && market >= 30 && market <= 62 ? market : (posted ?? fromTd);
  const weather = weatherUnderBias(game);
  expected -= weather;
  const tdGap = clamp(fromTd - expected, -2.4, 2.4) * 0.1;
  expected += tdGap;
  const tdNote =
    Math.abs(fromTd - (market ?? posted ?? 44)) >= 3
      ? `TD board leans ${fromTd > (market ?? posted ?? 44) ? "higher" : "lower"} — advisory only.`
      : "";
  return { expected: round1(clamp(expected, 33, 58)), market, tdNote };
}

function weatherUnderBias(game: Game): number {
  if (game.isDome) return 0;
  const w = (game.weather ?? "").toLowerCase();
  if (/rain|storm|shower|snow/.test(w)) return 1.8;
  if (/wind/.test(w)) return 1.2;
  return 0;
}

function weatherHarsh(game: Game | undefined): boolean {
  if (!game || game.isDome) return false;
  return /rain|storm|shower|snow|wind/.test((game.weather ?? "").toLowerCase());
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function booksFor(game: Game, board: Player[] = []): string {
  const labels = new Set<string>();
  for (const p of board) {
    if (p.team !== game.homeAbbr && p.team !== game.awayAbbr) continue;
    for (const b of p.props?.books ?? []) {
      const t = b.trim();
      if (t) labels.add(t);
    }
  }
  if (!labels.size && (game.spread != null || game.total != null)) labels.add("Vegas");
  return [...labels].join(" · ") || "Books";
}

function propUnit(edge: number): string {
  if (edge >= 0.12) return "0.75u";
  if (edge >= 0.09) return "0.5u";
  return "0.25u";
}

function atd2Unit(edgeSum: number): string {
  if (edgeSum >= 0.14) return "0.75u";
  if (edgeSum >= 0.08) return "0.5u";
  return "0.25u";
}

function totalUnit(gap: number): string {
  if (Math.abs(gap) >= 3.5) return "1u";
  if (Math.abs(gap) >= 2.4) return "0.5u";
  return "0.25u";
}

function atsUnit(edge: number): string {
  if (edge >= 0.1) return "1u";
  if (edge >= 0.075) return "0.5u";
  return "0.25u";
}

const ATS_FLOOR = 0.065;
const ML_FLOOR = 0.05;

function scoreAts(game: Game, players: Player[]): { side: "home" | "away"; edge: number; why: string } | null {
  if (game.spread == null) return null;
  const homeP = teamWinProb(game, game.homeAbbr) ?? 0.5;
  const homeTd = impliedTdShare(players, game.homeAbbr);
  const awayTd = impliedTdShare(players, game.awayAbbr);
  const tdGap = homeTd - awayTd;
  const impliedGap = (game.homeImplied ?? 0) - (game.awayImplied ?? 0);
  const homeDog = game.spread > 0;
  const blowout = game.spread <= -7;
  const trap = game.spread <= -2.5 && game.spread >= -3.5 && Math.abs(tdGap) < 0.15;

  let homeEdge = 0;
  const bits: string[] = [];
  if (homeDog) {
    homeEdge += 0.035;
    bits.push(`${game.homeAbbr} is a home dog (${formatSpread(game.spread)}) — a long-run ATS lean`);
  }
  if (blowout && tdGap > 0.12) {
    homeEdge += 0.05;
    bits.push(`TD market + implied points both say ${game.homeAbbr} can separate`);
  }
  if (tdGap > 0.22 && game.spread > -3) {
    homeEdge += 0.045;
    bits.push(`Anytime-TD prices are lopsided toward ${game.homeAbbr} versus a short number`);
  }
  if (tdGap < -0.22 && game.spread < -1) {
    homeEdge -= 0.04;
    bits.push(`TD board prefers ${game.awayAbbr} even though they are the visitor`);
  }
  if (trap) {
    homeEdge -= 0.03;
    bits.push(`Short favorite in a noisy spot — casual money often overrates ${game.homeAbbr}`);
  }
  if (impliedGap <= -6 && game.spread > -7) {
    homeEdge -= 0.02;
  }

  const side: "home" | "away" = homeEdge >= 0 ? "home" : "away";
  const edge = Math.abs(homeEdge) + Math.abs(homeP - 0.5) * 0.08;
  if (edge < ATS_FLOOR) return null;
  if (bits.length <= 1 && bits[0]?.includes("home dog") && edge < 0.08) return null;
  const team = side === "home" ? game.homeAbbr : game.awayAbbr;
  const spread = side === "home" ? game.spread : -game.spread;
  const why =
    bits[0] ??
    `${team} ${formatSpread(spread)} is the side the books + TD market least disagree on.`;
  return { side, edge, why: `${why}. Cover number ${formatSpread(spread)}. ` };
}

function scoreTotal(game: Game, players: Player[]): { pick: "over" | "under"; edge: number; why: string; expected: number } | null {
  if (game.total == null) return null;
  const posted = game.total;
  const { expected, market, tdNote } = expectedTotal(game, players);
  const gap = expected - posted;
  const overGate = 2.0;
  const underGate = 1.5;
  if (gap >= overGate) {
    const edge = Math.min(0.12, gap / 16);
    if (edge < 0.07) return null;
    const why = `Implied total ${market?.toFixed(1) ?? "n/a"} vs posted ${posted}. Model ${expected.toFixed(1)}.${game.isDome ? " Dome." : ""}${tdNote ? ` ${tdNote}` : ""}`;
    return { pick: "over", edge, why, expected };
  }
  if (gap <= -underGate) {
    const edge = Math.min(0.12, Math.abs(gap) / 16);
    if (edge < 0.07) return null;
    const wx = weatherUnderBias(game);
    const why = `Posted ${posted} sits above implied ${market?.toFixed(1) ?? expected.toFixed(1)}. Model ${expected.toFixed(1)}${wx ? " after outdoor weather" : ""}.${tdNote ? ` ${tdNote}` : ""}`;
    return { pick: "under", edge, why, expected };
  }
  return null;
}

function gameOf(p: Player, games: Game[]): Game | undefined {
  return games.find((g) => g.homeAbbr === p.team || g.awayAbbr === p.team);
}

function independentYards(p: Player, kind: "pass" | "rush" | "rec", games: Game[]): number | null {
  const st = p.stats;
  const gp = st && st.games >= 3 ? st.games : 0;
  let pace = 0;
  if (gp) {
    pace = kind === "pass" ? st!.passYds / gp : kind === "rush" ? st!.rushYds / gp : st!.recYds / gp;
  }
  if (pace < 8) {
    const cons = p.consensusProjection ?? (p.fppg > 1 ? p.fppg : 0);
    if (cons < 4) return null;
    if (kind === "pass") pace = cons * 13.2;
    else if (kind === "rush") pace = p.position === "RB" ? cons * 5.6 : cons * 2.1;
    else pace = p.position === "TE" ? cons * 4.3 : cons * 5.1;
  }
  if (pace < 8) return null;
  if (p.oppRank >= 24) pace *= 1.06;
  else if (p.oppRank >= 20) pace *= 1.03;
  else if (p.oppRank <= 8) pace *= 0.94;
  const g = gameOf(p, games);
  if (g?.total != null) {
    if (g.total >= 49) pace *= 1.03;
    else if (g.total <= 41) pace *= 0.96;
  }
  const imp = g ? (p.home ? g.homeImplied : g.awayImplied) : null;
  if (imp != null && imp >= 27 && kind !== "rush") pace *= 1.03;
  if (imp != null && imp <= 17) pace *= 0.95;
  if (weatherHarsh(g) && kind === "pass") pace *= 0.94;
  return pace;
}

function propCard(
  p: Player,
  line: number,
  kind: "pass" | "rush" | "rec",
  games: Game[],
): DeskBet | null {
  if (line < 12) return null;
  const model = independentYards(p, kind, games);
  if (model == null) return null;
  const gap = model - line;
  const over = gap > 0;
  const rel = Math.abs(gap) / line;
  if (over && (rel < 0.05 || Math.abs(gap) < 8)) return null;
  if (!over && (rel < 0.045 || Math.abs(gap) < 6)) return null;
  const edge = Math.min(0.16, Math.abs(gap) / Math.max(40, line));
  if (over && edge < 0.09) return null;
  if (!over && edge < 0.07) return null;
  const label = kind === "pass" ? "pass yds" : kind === "rush" ? "rush yds" : "rec yds";
  const g = gameOf(p, games);
  const bookList = p.props?.books?.length ? p.props.books : [];
  const books = bookList.join(" · ") || "Vegas";
  return {
    id: `prop-${kind}-${p.id}`,
    title: `${over ? "Over" : "Under"} ${line.toFixed(1)}`,
    market: "prop",
    pick: `${p.name} ${over ? "o" : "u"}${line.toFixed(1)} ${label}`,
    line: `${p.position} · ${p.team} ${p.home ? "vs" : "@"} ${p.opponent}${g?.total != null ? ` · O/U ${g.total}` : ""}`,
    edge,
    confidence: Math.round(54 + Math.min(12, Math.abs(gap) / 3)),
    why: `Posted ${line.toFixed(1)} ${label} (${books}). Independent pace ${model.toFixed(0)} from season / site consensus — not the same prop. Gap ${gap > 0 ? "+" : ""}${gap.toFixed(0)}.`,
    books,
    tape: over
      ? "Public leans overs on star skill. Need a real gap vs an independent number."
      : "Under only with a real gap. Casual money still hammers the over.",
    unit: propUnit(edge),
  };
}

function bookCount(p: Player): number {
  return p.props?.books?.length ?? 0;
}

function bestProp(
  players: Player[],
  games: Game[],
  pos: Player["position"],
  kind: "pass" | "rush" | "rec",
  getter: (p: Player) => number | undefined,
): DeskBet | null {
  const eligible = players.filter((p) => {
    if (p.position !== pos) return false;
    if (p.isStarter === false) return false;
    if (isSidelined(p.injury, p.status)) return false;
    const line = getter(p);
    return line != null && line > 0;
  });
  const multi = eligible.filter((p) => bookCount(p) >= 2);
  const pool = multi.length ? multi : eligible.filter((p) => bookCount(p) >= 1);
  const rows: DeskBet[] = [];
  for (const p of pool) {
    const line = getter(p);
    if (line == null) continue;
    const card = propCard(p, line, kind, games);
    if (card) rows.push(card);
  }
  rows.sort((a, b) => b.edge - a.edge);
  return rows[0] ?? null;
}

function postedAtd(p: Player): number {
  const raw = p.anytimeTd;
  if (raw != null && raw > 0 && raw < 1) return raw;
  if (raw != null && Math.abs(raw) >= 100) return americanToProb(raw);
  if (p.props?.anytimeTd != null && p.props.anytimeTd > 0 && p.props.anytimeTd < 1) return p.props.anytimeTd;
  return 0;
}

function fairAtd(p: Player, games: Game[]): number {
  const st = p.stats;
  const gp = st && st.games >= 3 ? st.games : 0;
  let lambda = 0;
  if (gp) {
    lambda = (st!.rushTd + st!.recTd) / gp;
    if (p.position === "QB") lambda += (st!.passTd / gp) * 0.12;
  }
  if (lambda < 0.12) {
    const cons = p.consensusProjection ?? p.fppg;
    lambda = p.position === "RB" ? cons / 22 : p.position === "QB" ? cons / 28 : cons / 24;
  }
  if (p.oppRank >= 24) lambda *= 1.12;
  else if (p.oppRank <= 8) lambda *= 0.9;
  const g = gameOf(p, games);
  const imp = g ? (p.home ? g.homeImplied : g.awayImplied) : null;
  if (imp != null && imp >= 26) lambda *= 1.08;
  if (imp != null && imp <= 17) lambda *= 0.9;
  if (g?.total != null && g.total >= 49) lambda *= 1.05;
  return clamp(1 - Math.exp(-Math.max(0.05, lambda)), 0.1, 0.52);
}

function atdEdgeScore(posted: number, fair: number): number {
  const edge = fair - posted;
  let s = edge;
  if (posted >= 0.28 && posted <= 0.42) s += 0.04;
  if (posted >= 0.62 && edge < 0.05) s -= 0.25;
  else if (posted >= 0.55 && edge < 0.06) s -= 0.08;
  if (posted > 0.5) s -= 0.03;
  return s;
}

/** P(2+ TDs). Posted 2+ market when present; else Poisson from ATD / week TDs. */
function twoPlusProb(p: Player): { prob: number; priced: boolean } {
  const posted = p.props?.twoPlusTd;
  if (posted != null && posted > 0.02 && posted < 0.7) return { prob: clamp(posted, 0.02, 0.55), priced: true };
  const atd = postedAtd(p);
  const st = p.stats;
  const gp = st && st.games >= 3 ? st.games : 0;
  const seasonLam = gp
    ? (st!.rushTd + st!.recTd) / gp + (p.position === "QB" ? (st!.passTd / gp) * 0.15 : 0)
    : 0;
  const lambda = Math.max(expectedTdsFromAnytime(atd), seasonLam);
  const multiTdProb = clamp(1 - Math.exp(-lambda) * (1 + lambda), 0.02, 0.55);
  return { prob: multiTdProb, priced: false };
}

function gameOfPlayer(p: Player, games: Game[]): Game | undefined {
  return games.find((g) => g.homeAbbr === p.team || g.awayAbbr === p.team);
}

export function buildWeeklyDesk(games: Game[], players: Player[]): WeeklyDesk {
  const live = games.filter((g) => isUpcoming(g));
  const remainingOnly = games.some((g) => !isUpcoming(g));
  const liveTeams = new Set(live.flatMap((g) => [g.homeAbbr, g.awayAbbr]));
  const board = players.filter((p) => {
    if (p.showdownRole === "CPT") return false;
    if (p.position === "K") return false;
    const gAll = gameOf(p, games);
    if (gAll && !isUpcoming(gAll)) return false;
    if (!liveTeams.has(p.team) && gAll) return false;
    const t = Date.parse(p.startTime);
    if (Number.isFinite(t) && t <= Date.now() - 8 * 60 * 1000) return false;
    return true;
  });
  const ats: DeskBet[] = [];
  const totals: DeskBet[] = [];

  for (const g of live) {
    const a = scoreAts(g, board);
    if (a) {
      const team = a.side === "home" ? g.homeAbbr : g.awayAbbr;
      const spread = a.side === "home" ? g.spread! : -g.spread!;
      ats.push({
        id: `ats-${g.id}`,
        title: `${team} ${formatSpread(spread)}`,
        market: "spread",
        pick: `${team} ${formatSpread(spread)}`,
        line: `${g.awayAbbr} @ ${g.homeAbbr} · O/U ${g.total ?? "—"}`,
        edge: a.edge,
        confidence: Math.round(52 + a.edge * 180),
        why: a.why,
        books: booksFor(g, board),
        tape:
          Math.abs(spread) >= 7
            ? "Heavy public favorite for spreads and survivor. Only lean this side if anytime-TD / scoring prices also back a cover — not just the spread."
            : Math.abs(spread) <= 3
              ? "Short favorites get bet just because the number looks small. Only take it if the matchup or TD prices actually disagree with the market."
              : "Mid-range number — books and public usually split. Lean it only with a real mismatch.",
        unit: atsUnit(a.edge),
      });
    }
    const t = scoreTotal(g, board);
    if (t && g.total != null) {
      const gap = t.expected - g.total;
      totals.push({
        id: `ou-${g.id}`,
        title: `${t.pick === "over" ? "Over" : "Under"} ${g.total}`,
        market: "total",
        pick: `${t.pick} ${g.total}`,
        line: `${g.awayAbbr} @ ${g.homeAbbr}`,
        edge: t.edge,
        confidence: Math.round(51 + t.edge * 160),
        why: t.why,
        books: booksFor(g, board),
        tape: t.pick === "over"
          ? "Overs are the public side. Need implied points (not just ATD juice) to clear a 2-point gap."
          : "Unders need a real gap vs implied, or outdoor weather. No forced 1u under.",
        unit: totalUnit(gap),
      });
    }
  }

  ats.sort((a, b) => b.edge - a.edge);
  totals.sort((a, b) => b.edge - a.edge);

  const spreadLock = ats[0] ?? null;
  const bestBets = [...ats, ...totals].sort((a, b) => b.edge - a.edge).slice(0, 3);

  const playerProps = [
    bestProp(board, live, "QB", "pass", (p) => p.props?.passYds),
    bestProp(board, live, "RB", "rush", (p) => p.props?.rushYds),
    bestProp(board, live, "RB", "rec", (p) => p.props?.recYds),
    bestProp(board, live, "WR", "rec", (p) => p.props?.recYds),
    bestProp(board, live, "TE", "rec", (p) => p.props?.recYds),
  ].filter((x): x is DeskBet => !!x);

  const kickoffOk = (iso: string) => {
    const t = Date.parse(iso);
    return !Number.isFinite(t) || t > Date.now() - 8 * 60 * 1000;
  };

  const atdRows = board
    .filter((p) => p.position !== "DST" && p.isStarter && kickoffOk(p.startTime) && !isSidelined(p.injury, p.status))
    .map((p) => {
      const posted = postedAtd(p);
      const fair = fairAtd(p, live);
      const edge = fair - posted;
      const s = atdEdgeScore(posted, fair);
      return {
        p,
        prob: posted,
        fair,
        edge,
        s,
        american: posted > 0 ? probToAmerican(posted) : 0,
      };
    })
    .filter((x) => x.prob > 0.02 && x.prob < 0.85);

  const scored = atdRows
    .filter((x) => {
      if (x.prob < 0.14 || x.prob > 0.78) return false;
      if (x.prob >= 0.62 && x.edge < 0.05) return false;
      return x.s > -0.1;
    })
    .sort((a, b) => b.s - a.s || Math.abs(a.prob - 0.35) - Math.abs(b.prob - 0.35));

  const postedBest = [...atdRows].sort(
    (a, b) => b.s - a.s || Math.abs(a.prob - 0.35) - Math.abs(b.prob - 0.35),
  );

  function pairHaircut(a: Player, b: Player): number {
    const ga = gameOf(a, live);
    const gb = gameOf(b, live);
    if (!ga || !gb) return 1;
    const bothHigh = (ga.total ?? 0) >= 49 && (gb.total ?? 0) >= 49;
    const bothWx = weatherHarsh(ga) && weatherHarsh(gb);
    return bothHigh || bothWx ? 0.92 : 1;
  }

  function pickAtdPair(pool: typeof scored, allowSameGame = false): [typeof scored[number], typeof scored[number]] | null {
    let best: [typeof scored[number], typeof scored[number]] | null = null;
    let bestS = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i]!;
        const b = pool[j]!;
        if (a.p.team === b.p.team) continue;
        if (!allowSameGame && a.p.gameName === b.p.gameName) continue;
        const h = pairHaircut(a.p, b.p);
        const s = (a.s + b.s) * h;
        if (s > bestS) {
          bestS = s;
          best = [a, b];
        }
      }
    }
    return best;
  }

  const pairEdged = pickAtdPair(scored);
  const pair = pairEdged ?? pickAtdPair(postedBest) ?? pickAtdPair(postedBest, true);
  const pairLean = !pairEdged && !!pair;
  let atdParlay: TdParlay | null = null;
  if (pair) {
    const [a, b] = pair;
    const h = pairHaircut(a.p, b.p);
    const combined = parlayProb([a.prob, b.prob]) * h;
    const booksA = a.p.props?.books?.join("/") || "Vegas";
    const booksB = b.p.props?.books?.join("/") || "Vegas";
    atdParlay = {
      legs: [
        {
          name: a.p.name,
          team: a.p.team,
          opponent: a.p.opponent,
          american: a.american,
          prob: a.prob,
          why: `${a.p.team} ${a.p.home ? "vs" : "@"} ${a.p.opponent} · posted ${formatPct(a.prob)} vs fair ${formatPct(a.fair)} (${booksA})`,
        },
        {
          name: b.p.name,
          team: b.p.team,
          opponent: b.p.opponent,
          american: b.american,
          prob: b.prob,
          why: `${b.p.team} ${b.p.home ? "vs" : "@"} ${b.p.opponent} · posted ${formatPct(b.prob)} vs fair ${formatPct(b.fair)} (${booksB})`,
        },
      ],
      combinedAmerican: probToAmerican(combined),
      combinedProb: combined,
      why: pairLean
        ? "Best available posted ATDs on remaining games. Model lean — thin edge board."
        : `Two independent games. Picked on ATD edge vs posted price, not juiced chalk. ${booksA} · ${booksB}.${h < 1 ? " Soft haircut — both games sit in extreme totals/weather." : ""}`,
      tape: pairLean
        ? "best available · model lean"
        : "Mid-board ATD (roughly 28–42%) with a real edge beats a −150 chalk name. Cross-game only.",
      unit: pairLean ? "0.1u" : atd2Unit(a.edge + b.edge),
    };
  }

  const atd2Names = new Set((atdParlay?.legs ?? []).map((l) => l.name));

  function pickAtdTriple(pool: typeof scored, avoidTwo: boolean): typeof scored | null {
    const rows = avoidTwo ? pool.filter((x) => !atd2Names.has(x.p.name)) : pool;
    let best: typeof scored | null = null;
    let bestS = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        for (let k = j + 1; k < rows.length; k++) {
          const a = rows[i]!;
          const b = rows[j]!;
          const c = rows[k]!;
          const teams = new Set([a.p.team, b.p.team, c.p.team]);
          const gset = new Set([a.p.gameName, b.p.gameName, c.p.gameName]);
          if (teams.size < 3 || gset.size < 3) continue;
          let h = pairHaircut(a.p, b.p) * pairHaircut(a.p, c.p) * pairHaircut(b.p, c.p);
          h = Math.max(0.85, h);
          const s = (a.s + b.s + c.s) * h;
          if (s > bestS) {
            bestS = s;
            best = [a, b, c];
          }
        }
      }
    }
    return best;
  }

  const tripleEdged = pickAtdTriple(scored, true) ?? pickAtdTriple(scored, false);
  const triple = tripleEdged ?? pickAtdTriple(postedBest, true) ?? pickAtdTriple(postedBest, false);
  const tripleLean = !tripleEdged && !!triple;
  let atdParlay3: TdParlay | null = null;
  if (triple) {
    const combined = parlayProb(triple.map((x) => x.prob));
    const edgeSum = triple.reduce((s, x) => s + x.edge, 0);
    const unit = tripleLean ? "0.1u" : edgeSum >= 0.12 ? "0.25u" : "0.1u";
    atdParlay3 = {
      unit,
      legs: triple.map((x) => ({
        name: x.p.name,
        team: x.p.team,
        opponent: x.p.opponent,
        american: x.american,
        prob: x.prob,
        why: `${x.p.team} ${x.p.home ? "vs" : "@"} ${x.p.opponent} · posted ${formatPct(x.prob)} vs fair ${formatPct(x.fair)}`,
      })),
      combinedAmerican: probToAmerican(combined),
      combinedProb: combined,
      why: tripleLean
        ? "Best available posted ATDs on remaining games. Model lean — thin edge board."
        : "Three independent games. Ranked by ATD edge vs posted American, not highest juice.",
      tape: tripleLean ? "best available · model lean" : `${unit} cap. Mid-board names. One miss kills it.`,
    };
  }

  const atdNames = new Set([...(atdParlay?.legs ?? []), ...(atdParlay3?.legs ?? [])].map((l) => l.name));

  type MultiRow = {
    p: Player;
    kind: "multi_td" | "atd";
    prob: number;
    priced: boolean;
    american: number;
    s: number;
  };

  const multiRows: MultiRow[] = board
    .filter((p) => {
      if (p.position === "DST" || !p.isStarter) return false;
      if (isSidelined(p.injury, p.status)) return false;
      if (!kickoffOk(p.startTime)) return false;
      return true;
    })
    .map((p) => {
      const two = twoPlusProb(p);
      const atd = postedAtd(p);
      const asMulti = two.priced || two.prob >= 0.14 || (p.position === "RB" && two.prob >= 0.12);
      const kind: "multi_td" | "atd" = asMulti ? "multi_td" : "atd";
      const prob = kind === "multi_td" ? two.prob : atd;
      const g = gameOfPlayer(p, live);
      const total = g?.total ?? 44;
      const imp = g ? (p.home ? g.homeImplied : g.awayImplied) : null;
      let s = (kind === "multi_td" ? two.prob : atdEdgeScore(atd, fairAtd(p, live))) * (kind === "multi_td" ? 8 : 1);
      if (p.position === "RB") s += 0.9;
      else if (p.position === "QB") s += 0.1;
      else s += 0.1;
      if (p.oppRank >= 24) s += 0.3;
      if (total >= 47) s += 0.2;
      if (imp != null && imp >= 26) s += 0.15;
      return { p, kind, prob, priced: kind === "multi_td" && two.priced, american: probToAmerican(prob), s };
    })
    .filter((x) => (x.kind === "multi_td" ? x.prob >= 0.08 && x.prob <= 0.55 : x.prob >= 0.22 && x.prob <= 0.72))
    .sort((a, b) => b.s - a.s);

  function okPair(a: MultiRow, b: MultiRow, avoidAtd: boolean) {
    if (a.p.team === b.p.team) return false;
    if (a.p.gameName === b.p.gameName) return false;
    if (avoidAtd && atdNames.has(a.p.name) && atdNames.has(b.p.name)) return false;
    return true;
  }

  function pickMultiPair(): [MultiRow, MultiRow] | null {
    const ranked = [...multiRows].sort((a, b) => Number(b.priced) - Number(a.priced) || b.s - a.s);
    const multi = ranked.filter((x) => x.kind === "multi_td");
    for (const needPriced of [true, false]) {
      const pool = needPriced ? multi.filter((x) => x.priced) : multi;
      for (const avoid of [true, false]) {
        for (let i = 0; i < pool.length; i++) {
          for (let j = i + 1; j < pool.length; j++) {
            if (okPair(pool[i]!, pool[j]!, avoid)) return [pool[i]!, pool[j]!];
          }
        }
      }
    }
    for (const avoid of [true, false]) {
      for (const m of multi) {
        for (const other of ranked) {
          if (other.p.id === m.p.id) continue;
          const atd = postedAtd(other.p);
          if (atd < 0.18) continue;
          const a: MultiRow = {
            ...other,
            kind: "atd",
            prob: atd,
            american: probToAmerican(atd),
            priced: true,
          };
          if (okPair(m, a, avoid)) return [m, a];
        }
      }
    }
    return null;
  }

  const multiPair = pickMultiPair();
  let multiTdParlay: TdParlay | null = null;
  if (multiPair) {
    const [a, b] = multiPair;
    const combined = parlayProb([a.prob, b.prob]);
    const bothMulti = a.kind === "multi_td" && b.kind === "multi_td";
    const thin = !a.priced || !b.priced;
    const unit = a.priced && b.priced ? "0.25u" : "0.1u";
    const label = (row: MultiRow) =>
      row.kind === "multi_td" ? (row.priced ? "2+ TD" : "2+ TD · model lean") : "ATD";
    multiTdParlay = {
      unit,
      legs: [a, b].map((row) => ({
        name: row.p.name,
        team: row.p.team,
        opponent: row.p.opponent,
        american: row.american,
        prob: row.prob,
        kind: row.kind,
        marketLabel: label(row),
        why: `${row.p.position} · ${row.p.team} ${row.p.home ? "vs" : "@"} ${row.p.opponent} · ${label(row)}${row.kind === "multi_td" && !row.priced ? " — no posted 2+ price, Poisson from ATD" : ""}`,
      })),
      combinedAmerican: probToAmerican(combined),
      combinedProb: combined,
      why: bothMulti
        ? `Two independent games. Each 2+ TDs. Prefer booked 2+ markets.${thin ? " One or both legs are model leans — not a posted 2+ price." : ""}`
        : "Priced 2+ board was thin. Cross-game only. Not SGP.",
      tape: `${unit} cap. Longshot vs the ATD two-leg. One miss kills it.`,
    };
  }

  function pickLotto(pool: typeof atdRows, n: number): typeof atdRows {
    const out: typeof atdRows = [];
    const usedGames = new Set<string>();
    const usedTeams = new Set<string>();
    for (const row of pool) {
      if (out.length >= n) break;
      if (usedGames.has(row.p.gameName) || usedTeams.has(row.p.team)) continue;
      usedGames.add(row.p.gameName);
      usedTeams.add(row.p.team);
      out.push(row);
    }
    return out;
  }

  const lottoN = Math.min(5, live.length);
  const lottoMid = atdRows
    .filter((x) => x.prob >= 0.18 && x.prob <= 0.42)
    .sort((a, b) => b.s - a.s || Math.abs(a.prob - 0.28) - Math.abs(b.prob - 0.28));
  const lottoWide = atdRows
    .filter((x) => x.prob >= 0.14 && x.prob <= 0.55)
    .sort((a, b) => b.s - a.s || Math.abs(a.prob - 0.28) - Math.abs(b.prob - 0.28));
  let lottoPicked = pickLotto(lottoMid, lottoN);
  let lottoLean = false;
  if (lottoPicked.length < Math.min(lottoN, 3)) {
    lottoPicked = pickLotto(lottoWide, lottoN);
    lottoLean = true;
  }
  if (lottoPicked.length < Math.min(lottoN, 3)) {
    lottoPicked = pickLotto(postedBest, lottoN);
    lottoLean = true;
  }

  let lottoTicket: TdParlay | null = null;
  const lottoNeed = Math.min(lottoN, Math.max(3, live.length > 3 ? 3 : live.length));
  if (lottoPicked.length >= lottoNeed && lottoPicked.length >= 3) {
    const combined = parlayProb(lottoPicked.map((x) => x.prob));
    lottoTicket = {
      legs: lottoPicked.map((x) => ({
        name: x.p.name,
        team: x.p.team,
        opponent: x.p.opponent,
        american: x.american,
        prob: x.prob,
        why: `${x.p.position} · ${x.p.team} ${x.p.home ? "vs" : "@"} ${x.p.opponent}`,
      })),
      combinedAmerican: probToAmerican(combined),
      combinedProb: combined,
      why: lottoLean
        ? `Best available posted ATDs on remaining games (${lottoPicked.length} legs). Model lean. 0.1u cap.`
        : `${lottoPicked.length} independent games. Long-shot ATD parlay — one miss kills it. Fun only, 0.1u cap.`,
      tape: lottoLean
        ? "best available · model lean"
        : "Lotto: mid-price ATD names, no same-game stack. No IT / bargain juice in the score.",
      unit: "0.1u",
    };
  }

  const mlDogs: DeskBet[] = [];
  for (const g of live) {
    if (g.spread == null) continue;
    const dog = g.spread > 0 ? g.homeAbbr : g.awayAbbr;
    const fav = g.spread > 0 ? g.awayAbbr : g.homeAbbr;
    const abs = Math.abs(g.spread);
    if (abs < 2.5 || abs > 9.5) continue;
    const dogWin = teamWinProb(g, dog) ?? 0.4;
    const dogTd = impliedTdShare(board, dog);
    const favTd = impliedTdShare(board, fav);
    if (dogTd + 0.05 < favTd) continue;
    const edge = 0.03 + Math.max(0, dogTd - favTd) * 0.08 + (abs >= 6 && dogTd >= favTd ? 0.02 : 0);
    if (edge < ML_FLOOR) continue;
    mlDogs.push({
      id: `ml-${g.id}`,
      title: `${dog} ML`,
      market: "moneyline",
      pick: `${dog} moneyline`,
      line: `${g.awayAbbr} @ ${g.homeAbbr} · ${dog} ${formatSpread(dog === g.homeAbbr ? g.spread : -g.spread)}`,
      edge,
      confidence: Math.round(50 + edge * 140),
      why: `${dog} is a playable dog (${formatPct(dogWin)}). TD prices are not a wipeout versus ${fav}. Live-dog moneyline, not a desperate +10.`,
      books: booksFor(g, board),
      tape: "Public lives on favorites. A mid-range dog with TD equity is the plus-money we want.",
      unit: edge >= 0.07 ? "0.5u" : "0.25u",
    });
  }
  mlDogs.sort((a, b) => b.edge - a.edge);
  const moneylineDog = mlDogs[0] ?? null;

  const fades: DeskBet[] = [];
  for (const g of live) {
    if (g.spread == null) continue;
    const abs = Math.abs(g.spread);
    const fav = g.spread < 0 ? g.homeAbbr : g.awayAbbr;
    const dog = g.spread < 0 ? g.awayAbbr : g.homeAbbr;
    const favTd = impliedTdShare(board, fav);
    const dogTd = impliedTdShare(board, dog);
    if (abs >= 2.5 && abs <= 3.5 && Math.abs(favTd - dogTd) < 0.12) {
      fades.push({
        id: `fade-short-${g.id}`,
        title: `Fade ${fav}`,
        market: "spread",
        pick: `Pass ${fav} ${formatSpread(fav === g.homeAbbr ? g.spread : -g.spread)}`,
        line: `${g.awayAbbr} @ ${g.homeAbbr}`,
        edge: 0.05,
        confidence: 58,
        why: `Short favorite in a coin-flip TD market. Casual money will still pile on ${fav}. We stand down.`,
        books: booksFor(g, board),
        tape: "Classic trap number. Sit = 0u.",
        unit: "0u",
      });
    }
    if (g.total != null && g.total >= 48) {
      const { expected } = expectedTotal(g, board);
      if (expected < g.total - 1.5) {
        fades.push({
          id: `fade-over-${g.id}`,
          title: `Fade Over ${g.total}`,
          market: "total",
          pick: `Pass the over ${g.total}`,
          line: `${g.awayAbbr} @ ${g.homeAbbr}`,
          edge: 0.04,
          confidence: 55,
          why: `Posted ${g.total} is a public magnet. Model total ${expected.toFixed(1)}.`,
          books: booksFor(g, board),
          tape: "Do not chase the shootout just because the number is loud. Sit = 0u.",
          unit: "0u",
        });
      }
    }
  }
  fades.sort((a, b) => b.edge - a.edge);

  return {
    bestBets: bestBets
      .filter((b) => b.unit !== "0u")
      .slice(0, 3)
      .map((b, i) => ({ ...b, confidence: clampConf(b.confidence, i), unit: b.unit || "0.25u" })),
    spreadLock,
    moneylineDog,
    fades: fades.slice(0, 3),
    playerProps,
    atdParlay,
    atdParlay3,
    multiTdParlay,
    lottoTicket,
    sources: ["Vegas / Bovada", "FanDuel", "DraftKings", "SNAPVALUE model", "Public tape + X cappers"],
    remainingOnly,
  };
}

function clampConf(n: number, rank: number): number {
  return Math.max(52, Math.min(71, n - rank * 3));
}
