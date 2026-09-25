import { americanToProb } from "@/lib/dfs/scoring";
import { formatAmerican, parlayProb } from "@/lib/dfs/markets";
import { clamp, methodLabel, removeVigN, removeVigPair, round2 } from "./scoring";
import { methodProb } from "./lines";
import type { UfcBet, UfcFight, UfcFighter, UfcMethod, UfcTrifecta, UfcTrifectaLeg } from "./types";

export interface UfcDesk {
  trifecta: UfcTrifecta | null;
  trifectaNote: string;
  /** One side on every posted market, for every fight on the card. Omitted on older desks. */
  card?: UfcBet[];
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

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function sameFighter(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  if (ta[0] && ta[0].length > 2 && ta[0] === tb[0]) return true;
  const lastA = ta[ta.length - 1] ?? "";
  const lastB = tb[tb.length - 1] ?? "";
  if (lastA.length > 3 && (lastB.startsWith(lastA) || lastA.startsWith(lastB))) return true;
  return ta.some((w) => w.length > 3 && tb.includes(w));
}

export function buildLottoParlay(live: UfcFight[], pool: UfcFighter[]): UfcTrifecta | null {
  const BAND_LO = 120;
  const BAND_HI = 900;
  type Cand = UfcTrifectaLeg & { books: string; edge: number };
  const options: Cand[] = [];

  for (const f of live) {
    if (f.aMl == null || f.bMl == null) continue;
    const sides = [
      { name: f.aName, ml: f.aMl },
      { name: f.bName, ml: f.bMl },
    ];
    const dog = sides[0].ml >= sides[1].ml ? sides[0] : sides[1];
    const fav = dog === sides[0] ? sides[1] : sides[0];
    if (dog.ml < BAND_LO || dog.ml > BAND_HI) continue;
    const { pa } = removeVigPair(dog.ml, fav.ml);
    const p = pool.find((x) => x.fightId === f.id && sameFighter(x.name, dog.name));
    const opp = p ? pool.find((x) => x.fightId === f.id && x.id !== p.id) : undefined;
    const fair = p ? (lottoFairWin(p, opp) ?? pa) : pa;
    const edge = fair - pa;
    const line = `${f.name} · ${f.weightClass} · ${f.card}`;
    const books = f.books.join("/") || "FanDuel";
    options.push({
      kind: "ml",
      fighter: p?.name ?? dog.name,
      fightName: f.name,
      fightId: f.id,
      line,
      american: dog.ml,
      priced: true,
      model: fair,
      why: `No-vig ${Math.round(pa * 100)}%. Model ${Math.round(fair * 100)}% (${formatAmerican(dog.ml)}). ${edge >= 0 ? "+" : ""}${Math.round(edge * 100)} pts.`,
      books,
      edge,
    });
  }

  for (const p of pool) {
    if (p.ml == null || p.ml < 100) continue;
    const f = live.find((x) => x.id === p.fightId);
    if (!f) continue;
    const opp = pool.find((x) => x.fightId === p.fightId && x.id !== p.id);
    const line = `${f.name} · ${f.weightClass} · ${f.card}`;
    const books = f.books.join("/") || "FanDuel";
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
      if (edge < 0.02) continue;
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
  const take = (minEdge: number) => {
    for (const o of options) {
      if (legs.length >= 4) return;
      if (used.has(o.fightId)) continue;
      if (o.edge < minEdge) continue;
      used.add(o.fightId);
      legs.push(o);
    }
  };
  take(0.02);
  if (legs.length < 4) take(-1);
  if (legs.length < 3) return null;

  const allPriced = legs.every((l) => l.priced && l.american != null);
  const posted = allPriced ? parlayAmerican(legs.map((l) => l.american!)) : null;
  const modelProb = parlayProb(legs.map((l) => l.model));
  const postedProb = allPriced ? legs.reduce((acc, l) => acc * americanToProb(l.american!), 1) : modelProb;
  const combinedProb = allPriced ? postedProb : modelProb;
  const combinedAmerican = posted ?? probToLongAmerican(combinedProb);
  const books = [...new Set(legs.flatMap((l) => (l.books ? l.books.split("/") : [])))].filter(Boolean).join("/") || "FanDuel";
  const avgEdge = legs.reduce((s, l) => s + l.edge, 0) / legs.length;
  const pts = Math.round(avgEdge * 100);
  return {
    legs,
    combinedAmerican,
    combinedProb,
    unit: "0.1u",
    priced: allPriced,
    books,
    edge: avgEdge,
    confidence: conf(avgEdge, allPriced),
    why: `Plus-money dogs, one fight each, ranked by model vs the no-vig price. Combined ${formatAmerican(combinedAmerican)}. Avg ${pts >= 0 ? "+" : ""}${pts} pts. All legs must hit.`,
    tape: "0.1u. Not an all-favorites parlay. Thin numbers still make the ticket so the lotto is on the board.",
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
