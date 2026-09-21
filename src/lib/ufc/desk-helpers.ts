import { americanToProb } from "@/lib/dfs/scoring";
import { formatAmerican, parlayProb } from "@/lib/dfs/markets";
import { clamp, methodLabel, removeVigN, removeVigPair, round2 } from "./scoring";
import { methodProb } from "./lines";
import type { UfcBet, UfcFight, UfcFighter, UfcMethod, UfcTrifecta, UfcTrifectaLeg } from "./types";

export interface UfcDesk {
  trifecta: UfcTrifecta | null;
  trifectaNote: string;
  props: UfcBet[];
  lotto: UfcBet[];
  lottoParlay: UfcTrifecta | null;
  bestValue: UfcBet | null;
  moneyline: UfcBet | null;
  sources: string[];
  oddsOk: boolean;
}

export function unitFor(edge: number, lotto = false): string {
  if (lotto) return "0.1u";
  if (edge >= 0.12) return "0.75u";
  if (edge >= 0.08) return "0.5u";
  if (edge >= 0.05) return "0.25u";
  return "0.1u";
}

export function conf(edge: number, priced: boolean): number {
  return Math.round(clamp((priced ? 48 : 32) + edge * 280, 18, 86));
}

export function parlayPick(l: UfcTrifectaLeg): string {
  const price = l.american != null ? ` ${formatAmerican(l.american)}` : "";
  if (l.kind === "ml") return `${l.fighter} ML${price}`;
  return `${l.fighter} by ${methodLabel(l.kind)}${price}`;
}

export function parlayAmerican(odds: number[]): number {
  let dec = 1;
  for (const a of odds) {
    if (!Number.isFinite(a) || a === 0) continue;
    dec *= a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
  }
  if (dec <= 1.01) return -10000;
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}

export function probToLongAmerican(p: number): number {
  const x = clamp(p, 0.004, 0.97);
  if (x >= 0.5) return Math.round((-100 * x) / (1 - x));
  return Math.round((100 * (1 - x)) / x);
}

export function trifectaUnit(_edge: number, combinedProb: number): string {
  if (combinedProb < 0.03) return "0.1u";
  return "0.25u";
}

export function lottoFairWin(p: UfcFighter, opp: UfcFighter | undefined): number | null {
  let prior: number | null = null;
  if (p.ml != null && opp?.ml != null) prior = removeVigPair(p.ml, opp.ml).pa;
  else if (p.ml != null) prior = americanToProb(p.ml);
  if (prior == null) return null;
  let fair = prior;
  const pGames = p.wins + p.losses;
  if (pGames >= 3 && p.record !== "0-0-0") {
    const finish = (p.koWins + p.subWins) / Math.max(1, p.wins);
    fair += clamp((finish - 0.42) * 0.1, -0.04, 0.07);
    fair += clamp((p.wins / pGames - 0.55) * 0.08, -0.04, 0.05);
  }
  const oGames = opp ? opp.wins + opp.losses : 0;
  if (opp && oGames >= 3 && opp.record !== "0-0-0" && pGames >= 3) {
    fair += clamp((p.wins / pGames - opp.wins / oGames) * 0.12, -0.06, 0.06);
  }
  return clamp(fair, 0.08, 0.78);
}

export function methodProfileFits(p: UfcFighter, kind: "ko" | "sub"): boolean {
  const wins = Math.max(1, p.wins);
  if (kind === "ko") return p.koWins >= 2 || p.koWins / wins >= 0.28;
  return p.subWins >= 1 || p.subWins / wins >= 0.16;
}

export function buildLottoParlay(live: UfcFight[], pool: UfcFighter[]): UfcTrifecta | null {
  const EDGE_FLOOR = 0.04;
  const BAND_LO = 125;
  const BAND_HI = 800;
  type Cand = UfcTrifectaLeg & { books: string; edge: number };
  const options: Cand[] = [];

  for (const p of pool) {
    if (p.ml == null || p.ml < 100) continue;
    const f = live.find((x) => x.id === p.fightId);
    if (!f) continue;
    const opp = pool.find((x) => x.fightId === p.fightId && x.id !== p.id);
    const fair = lottoFairWin(p, opp);
    const line = `${f.name} · ${f.weightClass} · ${f.card}`;
    const books = f.books.join("/") || "FanDuel";

    if (fair != null && p.ml != null && p.ml >= BAND_LO && p.ml <= BAND_HI) {
      const implied = americanToProb(p.ml);
      const edge = fair - implied;
      if (edge >= EDGE_FLOOR) {
        options.push({
          kind: "ml",
          fighter: p.name,
          fightName: f.name,
          fightId: f.id,
          line,
          american: p.ml,
          priced: true,
          model: fair,
          why: `Model ${Math.round(fair * 100)}% vs ${Math.round(implied * 100)}% implied (${formatAmerican(p.ml)}). +${Math.round(edge * 100)} pts.`,
          books,
          edge,
        });
      }
    }

    for (const kind of ["ko", "sub"] as const) {
      const e = methodEdge(p, f, kind);
      if (!e.priced || e.american == null) continue;
      if (e.american < BAND_LO || e.american > BAND_HI) continue;
      if (!methodProfileFits(p, kind)) continue;
      if (p.wins + p.losses < 3 || p.record === "0-0-0") continue;
      const implied = e.market ?? americanToProb(e.american);
      const winPrior =
        p.ml != null && opp?.ml != null ? removeVigPair(p.ml, opp.ml).pa : p.ml != null ? americanToProb(p.ml) : null;
      if (winPrior == null) continue;
      const wins = Math.max(1, p.wins);
      const share = kind === "ko" ? p.koWins / wins : p.subWins / wins;
      let model = winPrior * clamp(share, 0.08, 0.72);
      if (kind === "ko" && opp && opp.losses >= 2) model += 0.02;
      if (kind === "sub" && opp && opp.subWins === 0 && opp.wins >= 3) model += 0.02;
      model = clamp(model, 0.05, 0.42);
      const edge = model - implied;
      if (edge < EDGE_FLOOR) continue;
      options.push({
        kind,
        fighter: p.name,
        fightName: f.name,
        fightId: f.id,
        line,
        american: e.american,
        priced: true,
        model,
        why: `Model ${Math.round(model * 100)}% vs ${Math.round(implied * 100)}% implied (${formatAmerican(e.american)}). +${Math.round(edge * 100)} pts. ${kind === "ko" ? `${p.koWins} KO` : `${p.subWins} sub`} in ${p.wins} wins.`,
        books,
        edge,
      });
    }
  }

  options.sort((a, b) => b.edge - a.edge || (a.american ?? 9999) - (b.american ?? 9999));
  const used = new Set<string>();
  const legs: Cand[] = [];
  for (const o of options) {
    if (used.has(o.fightId)) continue;
    used.add(o.fightId);
    legs.push(o);
    if (legs.length >= 4) break;
  }
  if (legs.length < 3) return null;

  const allPriced = legs.every((l) => l.priced && l.american != null);
  const posted = allPriced ? parlayAmerican(legs.map((l) => l.american!)) : null;
  const modelProb = parlayProb(legs.map((l) => l.model));
  const postedProb = allPriced ? legs.reduce((acc, l) => acc * americanToProb(l.american!), 1) : modelProb;
  const combinedProb = allPriced ? postedProb : modelProb;
  const combinedAmerican = posted ?? probToLongAmerican(combinedProb);
  const books = [...new Set(legs.flatMap((l) => (l.books ? l.books.split("/") : [])))].filter(Boolean).join("/") || "FanDuel";
  const avgEdge = legs.reduce((s, l) => s + l.edge, 0) / legs.length;
  return {
    legs,
    combinedAmerican,
    combinedProb,
    unit: "0.1u",
    priced: allPriced,
    books,
    edge: avgEdge,
    confidence: conf(avgEdge, allPriced),
    why: `Ranked by edge, not longest price. Combined ${formatAmerican(combinedAmerican)}. ${legs.length} fights, avg +${Math.round(avgEdge * 100)} pts vs implied. All legs must hit.`,
    tape: "0.1u. Plus-EV longshots only (plus-money with a real model edge). Empty if fewer than three legs clear.",
  };
}

export function careerLine(p: UfcFighter): string {
  if (!p.record || p.record === "0-0-0" || (p.wins === 0 && p.losses === 0)) {
    return p.priced ? "No ESPN career line — using the posted number." : "No ESPN career line.";
  }
  return `${p.record} · ${p.koWins} KO / ${p.subWins} sub.`;
}

export function byFight(players: UfcFighter[]): Map<string, UfcFighter[]> {
  const m = new Map<string, UfcFighter[]>();
  for (const p of players) {
    const arr = m.get(p.fightId) ?? [];
    arr.push(p);
    m.set(p.fightId, arr);
  }
  return m;
}

export function methodEdge(p: UfcFighter, fight: UfcFight, kind: UfcMethod): { edge: number; american: number | null; model: number; market: number | null; priced: boolean } {
  const a = p.name.toLowerCase() === fight.aName.toLowerCase() || p.lastName.toLowerCase() === fight.aName.split(" ").pop()?.toLowerCase();
  const marketRow = a ? fight.methodA : fight.methodB;
  const market = methodProb(marketRow, kind);
  const model = kind === "ko" ? p.pKo : kind === "sub" ? p.pSub : p.pDec;
  const american = marketRow ? (kind === "ko" ? marketRow.ko : kind === "sub" ? marketRow.sub : marketRow.dec) : null;
  if (market == null) return { edge: model, american, model, market: null, priced: false };
  return { edge: model - market, american, model, market, priced: true };
}


export function distanceModel(fight: UfcFight, pair: UfcFighter[]): number {
  const dec = pair.reduce((s, p) => s + p.pDec, 0);
  if (fight.goDistanceYes != null && fight.goDistanceNo != null) {
    const { pa } = removeVigPair(fight.goDistanceYes, fight.goDistanceNo);
    return clamp(0.55 * dec + 0.45 * pa, 0.08, 0.88);
  }
  if (fight.howEnds) {
    const m = methodProb(fight.howEnds, "dec");
    if (m != null) return clamp(0.6 * dec + 0.4 * m, 0.08, 0.88);
  }
  return clamp(dec, 0.08, 0.85);
}

export function bet(partial: Omit<UfcBet, "confidence"> & { confidence?: number }): UfcBet {
  return {
    ...partial,
    confidence: partial.confidence ?? conf(partial.edge, partial.priced),
  };
}
