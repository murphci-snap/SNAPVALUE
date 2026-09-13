import {
  clamp,
  formatPct,
  formatSpread,
  isUpcoming,
  parlayProb,
  probToAmerican,
  teamWinProb,
} from "./markets";
import { americanToProb } from "./scoring";
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
}

export interface TdParlay {
  legs: TdLeg[];
  combinedAmerican: number;
  combinedProb: number;
  why: string;
  tape: string;
}

export interface WeeklyDesk {
  bestBets: DeskBet[];
  spreadLock: DeskBet | null;
  moneylineDog: DeskBet | null;
  fades: DeskBet[];
  playerProps: DeskBet[];
  atdParlay: TdParlay | null;
  multiTdParlay: TdParlay | null;
  lottoTicket: TdParlay | null;
  sources: string[];
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

function expectedTotal(game: Game, players: Player[]): number {
  const posted = game.total;
  const market =
    game.homeImplied != null && game.awayImplied != null ? game.homeImplied + game.awayImplied : null;
  const tds = teamTdExpect(players, game.homeAbbr) + teamTdExpect(players, game.awayAbbr);
  const fromTd = tds * 6.8 + 9.2 + (game.isDome ? 0.7 : 0);
  let expected = market != null && market >= 30 && market <= 62 ? market * 0.78 + fromTd * 0.22 : fromTd;
  if (posted != null) {
    expected = posted * 0.5 + expected * 0.5;
    expected = clamp(expected, posted - 7, posted + 7);
  }
  return round1(clamp(expected, 33, 58));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function booksFor(game: Game): string {
  const labels = new Set<string>();
  if (game.spread != null || game.total != null) {
    labels.add("Vegas");
    labels.add("FanDuel");
  }
  return [...labels].join(" · ") || "Books";
}

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
  const expected = expectedTotal(game, players);
  const gap = expected - posted;
  if (Math.abs(gap) < (gap < 0 ? 0.6 : 1.0)) return null;
  const pick = gap > 0 ? "over" : "under";
  if (pick === "under" && expected >= posted) return null;
  if (pick === "over" && expected <= posted) return null;
  const why =
    pick === "over"
      ? `Books sit at ${posted}. Model total ${expected.toFixed(1)} after implied points and a dampened TD lean${game.isDome ? " (dome)" : ""}.`
      : `Posted ${posted} is high versus a model total of ${expected.toFixed(1)} (implied points + TD prices, capped near the number).`;
  return { pick, edge: Math.min(0.12, Math.abs(gap) / 18), why, expected };
}

function gameOf(p: Player, games: Game[]): Game | undefined {
  return games.find((g) => g.homeAbbr === p.team || g.awayAbbr === p.team);
}

function yardModel(p: Player, line: number, kind: "pass" | "rush" | "rec", games: Game[]): number {
  const w = p.week;
  let model =
    kind === "pass" ? (w?.passYds ?? 0) : kind === "rush" ? (w?.rushYds ?? 0) : (w?.recYds ?? 0);
  if (model < 8) model = line;
  if (p.oppRank >= 24) model *= 1.07;
  else if (p.oppRank >= 20) model *= 1.03;
  else if (p.oppRank <= 8) model *= 0.93;
  const g = gameOf(p, games);
  if (g?.total != null) {
    if (g.total >= 49) model *= 1.04;
    else if (g.total <= 41) model *= 0.95;
  }
  const imp = g ? (p.home ? g.homeImplied : g.awayImplied) : null;
  if (imp != null && imp >= 27 && kind !== "rush") model *= 1.03;
  if (imp != null && imp <= 17) model *= 0.95;
  if (p.itFactor && kind !== "rush") model *= 1.02;
  return model;
}

function propCard(
  p: Player,
  line: number,
  kind: "pass" | "rush" | "rec",
  games: Game[],
): DeskBet | null {
  if (line < 12) return null;
  const model = yardModel(p, line, kind, games);
  const gap = model - line;
  if (Math.abs(gap) < line * 0.025 && Math.abs(gap) < 6) return null;
  const over = gap > 0;
  const label = kind === "pass" ? "pass yds" : kind === "rush" ? "rush yds" : "rec yds";
  const g = gameOf(p, games);
  const books = p.props?.books?.length ? p.props.books.join(" · ") : "Vegas / DK";
  return {
    id: `prop-${kind}-${p.id}`,
    title: `${over ? "Over" : "Under"} ${line.toFixed(1)}`,
    market: "prop",
    pick: `${p.name} ${over ? "o" : "u"}${line.toFixed(1)} ${label}`,
    line: `${p.position} · ${p.team} ${p.home ? "vs" : "@"} ${p.opponent}${g?.total != null ? ` · O/U ${g.total}` : ""}`,
    edge: Math.min(0.14, Math.abs(gap) / Math.max(40, line)),
    confidence: Math.round(54 + Math.min(14, Math.abs(gap) / 3)),
    why: `Posted ${line.toFixed(1)} ${label}. Model sits near ${model.toFixed(0)} after matchup and total. ${over ? "Need volume in a viable script." : "Script + defense cap the number."}`,
    books,
    tape: over
      ? "Public leans overs on star skill. Only take it with a real number gap."
      : "Unders on player yards are quieter. Most casual money still hammers the over.",
    unit: "0.5u",
  };
}

function bestProp(
  players: Player[],
  games: Game[],
  pos: Player["position"],
  kind: "pass" | "rush" | "rec",
  getter: (p: Player) => number | undefined,
): DeskBet | null {
  const rows: DeskBet[] = [];
  for (const p of players) {
    if (p.position !== pos) continue;
    if (p.isStarter === false) continue;
    if (/out|ir|doubtful|suspended/i.test(p.injury ?? "") || /^(out|ir|doubtful)/i.test(p.status)) continue;
    const line = getter(p);
    if (line == null || line <= 0) continue;
    const card = propCard(p, line, kind, games);
    if (card) rows.push(card);
  }
  rows.sort((a, b) => b.edge - a.edge);
  if (rows[0]) return rows[0];
  const fallback = players
    .filter((p) => p.position === pos && p.isStarter !== false)
    .map((p) => ({ p, line: getter(p) ?? 0 }))
    .filter((x) => x.line >= 12)
    .sort((a, b) => b.line - a.line)[0];
  if (!fallback) return null;
  const over = fallback.p.oppRank >= 20;
  return propCard(fallback.p, fallback.line * (over ? 0.97 : 1.03), kind, games) ?? {
    id: `prop-${kind}-${fallback.p.id}`,
    title: `${over ? "Over" : "Under"} ${fallback.line.toFixed(1)}`,
    market: "prop",
    pick: `${fallback.p.name} ${over ? "o" : "u"}${fallback.line.toFixed(1)} ${kind === "pass" ? "pass yds" : kind === "rush" ? "rush yds" : "rec yds"}`,
    line: `${fallback.p.position} · ${fallback.p.team} ${fallback.p.home ? "vs" : "@"} ${fallback.p.opponent}`,
    edge: 0.04,
    confidence: 55,
    why: `Matchup lean on the posted ${fallback.line.toFixed(1)} yard number.`,
    books: fallback.p.props?.books?.join(" · ") || "Vegas / DK",
    tape: over ? "Smash spot vs a soft yardage D." : "Tough D / low script — take the under.",
    unit: "0.5u",
  };
}

function atdProb(p: Player): number {
  const raw = p.anytimeTd;
  if (raw != null && raw > 0 && raw < 1) return raw;
  if (raw != null && Math.abs(raw) >= 100) return americanToProb(raw);
  if (!p.week) return 0;
  const exp = p.week.rushTd + p.week.recTd + (p.position === "QB" ? p.week.passTd * 0.12 : 0);
  return Math.max(0, 1 - Math.exp(-Math.max(0.05, exp)));
}

/** P(2+ TDs). Posted 2+ market when present; else conservative Poisson from ATD / TD lines. */
function twoPlusProb(p: Player): { prob: number; priced: boolean } {
  const posted = p.props?.twoPlusTd;
  if (posted != null && posted > 0.02 && posted < 0.7) return { prob: posted, priced: true };
  const atd = atdProb(p);
  const weekLam = (p.week?.rushTd ?? 0) + (p.week?.recTd ?? 0) + (p.position === "QB" ? (p.week?.rushTd ?? 0) * 0.25 : 0);
  let lam = 0;
  if (atd > 0.08 && atd < 0.92) lam = -Math.log(1 - atd);
  if (weekLam > lam) lam = weekLam;
  const rushLine = p.props?.rushTd;
  const recLine = p.props?.recTd;
  if (rushLine != null) lam = Math.max(lam, rushLine);
  if (recLine != null) lam = Math.max(lam, recLine * 0.85);
  lam *= 0.82;
  if (lam < 0.18) return { prob: 0, priced: false };
  const p0 = Math.exp(-lam);
  const p1 = lam * p0;
  return { prob: clamp(1 - p0 - p1, 0.03, 0.38), priced: false };
}

function gameOfPlayer(p: Player, games: Game[]): Game | undefined {
  return games.find((g) => g.homeAbbr === p.team || g.awayAbbr === p.team);
}

export function buildWeeklyDesk(games: Game[], players: Player[]): WeeklyDesk {
  const live = games.filter((g) => isUpcoming(g));
  const ats: DeskBet[] = [];
  const totals: DeskBet[] = [];

  for (const g of live) {
    const a = scoreAts(g, players);
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
        books: booksFor(g),
        tape:
          Math.abs(spread) >= 7
            ? "Heavy public favorite for spreads and survivor. Only lean this side if anytime-TD / scoring prices also back a cover — not just the spread."
            : Math.abs(spread) <= 3
              ? "Short favorites get bet just because the number looks small. Only take it if the matchup or TD prices actually disagree with the market."
              : "Mid-range number — books and public usually split. Lean it only with a real mismatch.",
        unit: "1u",
      });
    }
    const t = scoreTotal(g, players);
    if (t && g.total != null) {
      totals.push({
        id: `ou-${g.id}`,
        title: `${t.pick === "over" ? "Over" : "Under"} ${g.total}`,
        market: "total",
        pick: `${t.pick} ${g.total}`,
        line: `${g.awayAbbr} @ ${g.homeAbbr}`,
        edge: t.edge,
        confidence: Math.round(51 + t.edge * 160),
        why: t.why,
        books: booksFor(g),
        tape: t.pick === "over" ? "Overs are the public side. Need a real TD-market edge." : "Unders are the quieter side most weeks. Most casual money still lives on the over.",
        unit: "1u",
      });
    }
  }

  ats.sort((a, b) => b.edge - a.edge);
  totals.sort((a, b) => b.edge - a.edge);

  let unders = totals.filter((t) => /^under/i.test(t.pick));
  const overs = totals.filter((t) => /^over/i.test(t.pick));
  if (!unders.length) {
    let best: DeskBet | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const g of live) {
      if (g.total == null) continue;
      const raw = expectedTotal(g, players);
      const expected = Math.min(raw, g.total - 0.8);
      const gap = expected - g.total;
      if (gap < bestGap) {
        bestGap = gap;
        best = {
          id: `ou-under-${g.id}`,
          title: `Under ${g.total}`,
          market: "total",
          pick: `under ${g.total}`,
          line: `${g.awayAbbr} @ ${g.homeAbbr}`,
          edge: Math.min(0.1, Math.abs(gap) / 18 + 0.03),
          confidence: 56,
          why: `Quietest total on the board. Model ${expected.toFixed(1)} vs posted ${g.total}.`,
          books: booksFor(g),
          tape: "Unders are the quieter side most weeks. Most casual money still lives on the over.",
          unit: "1u",
        };
      }
    }
    if (best) unders = [best];
  }
  const spreadLock = ats[0] ?? null;
  const bestBets: DeskBet[] = [];
  if (spreadLock) bestBets.push(spreadLock);
  if (unders[0]) bestBets.push(unders[0]);
  if (overs[0] && bestBets.length < 3) bestBets.push(overs[0]);
  if (ats[1] && bestBets.length < 3) bestBets.push(ats[1]);
  if (unders[1] && bestBets.length < 3) bestBets.push(unders[1]);
  if (ats[2] && bestBets.length < 3) bestBets.push(ats[2]);

  const playerProps = [
    bestProp(players, games, "QB", "pass", (p) => p.props?.passYds),
    bestProp(players, games, "RB", "rush", (p) => p.props?.rushYds),
    bestProp(players, games, "RB", "rec", (p) => p.props?.recYds),
    bestProp(players, games, "WR", "rec", (p) => p.props?.recYds),
    bestProp(players, games, "TE", "rec", (p) => p.props?.recYds),
  ].filter((x): x is DeskBet => !!x);

  const kickoffOk = (iso: string) => {
    const t = Date.parse(iso);
    return !Number.isFinite(t) || t > Date.now() - 15 * 60 * 1000;
  };

  const scored = players
    .filter((p) => p.position !== "DST" && p.isStarter && kickoffOk(p.startTime))
    .map((p) => {
      const prob = atdProb(p);
      const match = p.oppQuality === "High" ? 1.12 : p.oppQuality === "Low" ? 0.88 : 1;
      const american = probToAmerican(prob);
      return { p, prob: prob * match, american };
    })
    .filter((x) => x.prob >= 0.22 && x.prob <= 0.72)
    .sort((a, b) => b.prob - a.prob);

  let atdParlay: TdParlay | null = null;
  outer: for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const a = scored[i]!;
      const b = scored[j]!;
      if (a.p.team === b.p.team) continue;
      if (a.p.gameName === b.p.gameName) continue;
      const combined = parlayProb([a.prob, b.prob]);
      atdParlay = {
        legs: [
          {
            name: a.p.name,
            team: a.p.team,
            opponent: a.p.opponent,
            american: a.american,
            prob: a.prob,
            why: `${a.p.team} ${a.p.home ? "vs" : "@"} ${a.p.opponent} · ${a.p.oppQuality === "High" ? "smash matchup" : "viable TD role"}`,
          },
          {
            name: b.p.name,
            team: b.p.team,
            opponent: b.p.opponent,
            american: b.american,
            prob: b.prob,
            why: `${b.p.team} ${b.p.home ? "vs" : "@"} ${b.p.opponent} · independent game from ${a.p.team}`,
          },
        ],
        combinedAmerican: probToAmerican(combined),
        combinedProb: combined,
        why: `Two independent games, both with real TD equity. Avoid same-backfield cannibalization. Books: ${a.p.props?.books.join("/") || "Vegas"} · ${b.p.props?.books.join("/") || "Vegas"}.`,
        tape: "X ATD chatter this week leaned skill-position names in high totals (Action Network on Deebo in the London/Australia window; JSN already cashed Wednesday). We want two uncorrelated legs, not a same-game lottery ticket.",
      };
      break outer;
    }
  }

  const multiPool = players
    .filter((p) => {
      if (p.position === "DST" || !p.isStarter) return false;
      if (/out|ir|doubtful|suspended/i.test(p.injury ?? "") || /^(out|ir|doubtful)/i.test(p.status)) return false;
      if (!kickoffOk(p.startTime)) return false;
      if (p.position === "TE") return false;
      return true;
    })
    .map((p) => {
      const { prob, priced } = twoPlusProb(p);
      const g = gameOfPlayer(p, games);
      const total = g?.total ?? 44;
      const imp = g ? (p.home ? g.homeImplied : g.awayImplied) : null;
      let s = prob * 12;
      if (p.position === "RB") s += 0.9;
      else if (p.position === "QB") s += p.week && p.week.rushTd >= 0.35 ? 0.45 : 0.05;
      else s += 0.12;
      if (p.oppRank >= 24) s += 0.35;
      if (total >= 47) s += 0.25;
      if (imp != null && imp >= 26) s += 0.2;
      if (p.itFactor) s += 0.15;
      return { p, prob, priced, american: probToAmerican(prob), s };
    })
    .filter((x) => x.prob >= 0.06 && x.prob <= 0.42)
    .sort((a, b) => b.s - a.s);

  const atdNames = new Set((atdParlay?.legs ?? []).map((l) => l.name));

  function pickMultiPair(avoidAtd: boolean) {
    for (let i = 0; i < multiPool.length; i++) {
      for (let j = i + 1; j < multiPool.length; j++) {
        const a = multiPool[i]!;
        const b = multiPool[j]!;
        if (a.p.team === b.p.team) continue;
        if (a.p.gameName === b.p.gameName) continue;
        if (avoidAtd && atdNames.has(a.p.name) && atdNames.has(b.p.name)) continue;
        return [a, b] as const;
      }
    }
    return null;
  }

  const multiPair = pickMultiPair(true) ?? pickMultiPair(false);
  let multiTdParlay: TdParlay | null = null;
  if (multiPair) {
    const [a, b] = multiPair;
    const combined = parlayProb([a.prob, b.prob]);
    const thin = !a.priced || !b.priced;
    multiTdParlay = {
      legs: [
        {
          name: a.p.name,
          team: a.p.team,
          opponent: a.p.opponent,
          american: a.american,
          prob: a.prob,
          why: `${a.p.position} · ${a.p.team} ${a.p.home ? "vs" : "@"} ${a.p.opponent} · 2+ TDs${a.priced ? "" : " · price thin — model lean"}`,
        },
        {
          name: b.p.name,
          team: b.p.team,
          opponent: b.p.opponent,
          american: b.american,
          prob: b.prob,
          why: `${b.p.position} · ${b.p.team} ${b.p.home ? "vs" : "@"} ${b.p.opponent} · 2+ TDs${b.priced ? "" : " · price thin — model lean"}`,
        },
      ],
      combinedAmerican: probToAmerican(combined),
      combinedProb: combined,
      why: `Two independent games. Each player 2+ TDs (not anytime). Prefer RBs / rushing QBs. Not a same-game parlay.${thin ? " 2+ markets are thin this slate — prices are model leans from ATD / TD lines." : ""}`,
      tape: "Longer-shot than the ATD two-leg. 0.25u. One miss kills it. Fun only.",
    };
  }

  const lottoPool = players
    .filter((p) => p.position !== "DST" && p.isStarter && kickoffOk(p.startTime))
    .map((p) => {
      const raw = atdProb(p);
      const match = p.oppQuality === "High" ? 1.1 : p.oppQuality === "Low" ? 0.9 : 1;
      const prob = Math.min(0.55, raw * match);
      return { p, prob, american: probToAmerican(prob) };
    })
    .filter((x) => x.prob >= 0.14 && x.prob <= 0.42)
    .sort((a, b) => {
      const score = (x: typeof a) =>
        (0.3 - Math.abs(x.prob - 0.26)) * 4 +
        (x.p.itFactor ? 0.35 : 0) +
        (x.p.cheapImpact ? 0.2 : 0) +
        (x.p.oppRank >= 22 ? 0.2 : 0);
      return score(b) - score(a);
    });

  const lottoPicked: typeof lottoPool = [];
  const usedGames = new Set<string>();
  const usedTeams = new Set<string>();
  for (const row of lottoPool) {
    if (lottoPicked.length >= 5) break;
    if (usedGames.has(row.p.gameName) || usedTeams.has(row.p.team)) continue;
    usedGames.add(row.p.gameName);
    usedTeams.add(row.p.team);
    lottoPicked.push(row);
  }

  let lottoTicket: TdParlay | null = null;
  if (lottoPicked.length === 5) {
    const combined = parlayProb(lottoPicked.map((x) => x.prob));
    lottoTicket = {
      legs: lottoPicked.map((x) => ({
        name: x.p.name,
        team: x.p.team,
        opponent: x.p.opponent,
        american: x.american,
        prob: x.prob,
        why: `${x.p.position} · ${x.p.team} ${x.p.home ? "vs" : "@"} ${x.p.opponent}${x.p.itFactor ? " · IT Factor" : ""}`,
      })),
      combinedAmerican: probToAmerican(combined),
      combinedProb: combined,
      why: "Five independent games. Long-shot ATD parlay — one miss kills it. Fun only, tiny unit.",
      tape: "Lotto construction: mid-price ATD names, no same-game stack, mix of smash spots and streamer darts from the public X tape.",
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
    const dogTd = impliedTdShare(players, dog);
    const favTd = impliedTdShare(players, fav);
    if (dogTd + 0.05 < favTd) continue;
    const edge = 0.03 + Math.max(0, dogTd - favTd) * 0.08 + (abs >= 6 && dogTd >= favTd ? 0.02 : 0);
    mlDogs.push({
      id: `ml-${g.id}`,
      title: `${dog} ML`,
      market: "moneyline",
      pick: `${dog} moneyline`,
      line: `${g.awayAbbr} @ ${g.homeAbbr} · ${dog} ${formatSpread(dog === g.homeAbbr ? g.spread : -g.spread)}`,
      edge,
      confidence: Math.round(50 + edge * 140),
      why: `${dog} is a playable dog (${formatPct(dogWin)}). TD prices are not a wipeout versus ${fav}. Live-dog moneyline, not a desperate +10.`,
      books: booksFor(g),
      tape: "Public lives on favorites. A mid-range dog with TD equity is the plus-money we want.",
      unit: "0.5u",
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
    const favTd = impliedTdShare(players, fav);
    const dogTd = impliedTdShare(players, dog);
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
        books: booksFor(g),
        tape: "Classic trap number. No bet is the bet.",
        unit: "0u",
      });
    }
    if (g.total != null && g.total >= 48) {
      const expected = expectedTotal(g, players);
      if (expected < g.total - 1) {
        fades.push({
          id: `fade-over-${g.id}`,
          title: `Fade Over ${g.total}`,
          market: "total",
          pick: `Pass the over ${g.total}`,
          line: `${g.awayAbbr} @ ${g.homeAbbr}`,
          edge: 0.04,
          confidence: 55,
          why: `Posted ${g.total} is a public magnet. Model total ${expected.toFixed(1)}.`,
          books: booksFor(g),
          tape: "Do not chase the shootout just because the number is loud.",
          unit: "0u",
        });
      }
    }
  }
  fades.sort((a, b) => b.edge - a.edge);

  return {
    bestBets: bestBets.slice(0, 3).map((b, i) => ({ ...b, confidence: clampConf(b.confidence, i), unit: b.unit || "1u" })),
    spreadLock,
    moneylineDog,
    fades: fades.slice(0, 3),
    playerProps,
    atdParlay,
    multiTdParlay,
    lottoTicket,
    sources: ["Vegas / Bovada", "FanDuel", "DraftKings", "SNAPVALUE model", "Public tape + X cappers"],
  };
}

function clampConf(n: number, rank: number): number {
  return Math.max(52, Math.min(71, n - rank * 3));
}
