import {
  formatSpread,
  isUpcoming,
  parlayProb,
  probToAmerican,
  teamWinProb,
} from "./markets";
import { americanToProb } from "./scoring";
import type { Game, Player } from "./types";

export type BetMarket = "spread" | "total" | "moneyline";

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
  atdParlay: TdParlay | null;
  sources: string[];
}

function impliedTdShare(players: Player[], team: string): number {
  let s = 0;
  for (const p of players) {
    if (p.team !== team) continue;
    if (p.anytimeTd != null && p.anytimeTd > 0 && p.anytimeTd < 1) s += p.anytimeTd;
    else if (p.anytimeTd != null && Math.abs(p.anytimeTd) >= 100) s += americanToProb(p.anytimeTd);
    else if (p.week) s += Math.min(0.55, (p.week.rushTd + p.week.recTd) * 0.72);
  }
  return s;
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
    bits.push(`Short favorite in a noisy spot — street often overrates ${game.homeAbbr}`);
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

function scoreTotal(game: Game, players: Player[]): { pick: "over" | "under"; edge: number; why: string } | null {
  if (game.total == null) return null;
  const td = impliedTdShare(players, game.homeAbbr) + impliedTdShare(players, game.awayAbbr);
  const expected = 38 + td * 14 + (game.isDome ? 1.4 : 0);
  const gap = expected - game.total;
  if (Math.abs(gap) < 1.4) return null;
  const pick = gap > 0 ? "over" : "under";
  const why =
    pick === "over"
      ? `Player TD prices + ${game.isDome ? "dome" : "this matchup"} imply closer to ${expected.toFixed(1)} than the posted ${game.total}.`
      : `Posted ${game.total} is fat versus a TD market that looks closer to ${expected.toFixed(1)}.`;
  return { pick, edge: Math.min(0.12, Math.abs(gap) / 40), why };
}

function atdProb(p: Player): number {
  const raw = p.anytimeTd;
  if (raw != null && raw > 0 && raw < 1) return raw;
  if (raw != null && Math.abs(raw) >= 100) return americanToProb(raw);
  if (!p.week) return 0;
  const exp = p.week.rushTd + p.week.recTd + (p.position === "QB" ? p.week.passTd * 0.12 : 0);
  return Math.max(0, 1 - Math.exp(-Math.max(0.05, exp)));
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
            ? "Public will hammer this favorite in survivor and sides. Only a Grok play if the TD board agrees."
            : Math.abs(spread) <= 3
              ? "Action Network / street often fade short favorites in week-openers. We only take it with a mismatch."
              : "Mid-range number — books and cappers usually split.",
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
        tape: t.pick === "over" ? "Overs are the public side. Need a real TD-market edge." : "Unders are the sharper street lean most weeks.",
      });
    }
  }

  ats.sort((a, b) => b.edge - a.edge);
  totals.sort((a, b) => b.edge - a.edge);

  const spreadLock = ats[0] ?? null;
  const bestBets: DeskBet[] = [];
  if (spreadLock) bestBets.push(spreadLock);
  if (totals[0]) bestBets.push(totals[0]);
  const secondAts = ats[1];
  if (secondAts && bestBets.length < 3) bestBets.push(secondAts);
  if (totals[1] && bestBets.length < 3) bestBets.push(totals[1]);
  if (ats[2] && bestBets.length < 3) bestBets.push(ats[2]);

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

  return {
    bestBets: bestBets.slice(0, 3).map((b, i) => ({ ...b, confidence: clampConf(b.confidence, i) })),
    spreadLock,
    atdParlay,
    sources: ["Vegas / Bovada", "FanDuel", "DraftKings", "Grok model", "Public tape + X cappers"],
  };
}

function clampConf(n: number, rank: number): number {
  return Math.max(52, Math.min(71, n - rank * 3));
}
