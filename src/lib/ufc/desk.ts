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

function unitFor(edge: number, lotto = false): string {
  if (lotto) return "0.1u";
  if (edge >= 0.12) return "0.75u";
  if (edge >= 0.08) return "0.5u";
  if (edge >= 0.05) return "0.25u";
  return "0.1u";
}

function conf(edge: number, priced: boolean): number {
  return Math.round(clamp((priced ? 48 : 32) + edge * 280, 18, 86));
}

function parlayPick(l: UfcTrifectaLeg): string {
  const price = l.american != null ? ` ${formatAmerican(l.american)}` : "";
  if (l.kind === "ml") return `${l.fighter} ML${price}`;
  return `${l.fighter} by ${methodLabel(l.kind)}${price}`;
}

function parlayAmerican(odds: number[]): number {
  let dec = 1;
  for (const a of odds) {
    if (!Number.isFinite(a) || a === 0) continue;
    dec *= a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
  }
  if (dec <= 1.01) return -10000;
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}

function probToLongAmerican(p: number): number {
  const x = clamp(p, 0.004, 0.97);
  if (x >= 0.5) return Math.round((-100 * x) / (1 - x));
  return Math.round((100 * (1 - x)) / x);
}

function trifectaUnit(_edge: number, combinedProb: number): string {
  if (combinedProb < 0.03) return "0.1u";
  return "0.25u";
}

function lottoFairWin(p: UfcFighter, opp: UfcFighter | undefined): number | null {
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

function methodProfileFits(p: UfcFighter, kind: "ko" | "sub"): boolean {
  const wins = Math.max(1, p.wins);
  if (kind === "ko") return p.koWins >= 2 || p.koWins / wins >= 0.28;
  return p.subWins >= 1 || p.subWins / wins >= 0.16;
}

function buildLottoParlay(live: UfcFight[], pool: UfcFighter[]): UfcTrifecta | null {
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

function careerLine(p: UfcFighter): string {
  if (!p.record || p.record === "0-0-0" || (p.wins === 0 && p.losses === 0)) {
    return p.priced ? "No ESPN career line — using the posted number." : "No ESPN career line.";
  }
  return `${p.record} · ${p.koWins} KO / ${p.subWins} sub.`;
}

function byFight(players: UfcFighter[]): Map<string, UfcFighter[]> {
  const m = new Map<string, UfcFighter[]>();
  for (const p of players) {
    const arr = m.get(p.fightId) ?? [];
    arr.push(p);
    m.set(p.fightId, arr);
  }
  return m;
}

function methodEdge(p: UfcFighter, fight: UfcFight, kind: UfcMethod): { edge: number; american: number | null; model: number; market: number | null; priced: boolean } {
  const a = p.name.toLowerCase() === fight.aName.toLowerCase() || p.lastName.toLowerCase() === fight.aName.split(" ").pop()?.toLowerCase();
  const marketRow = a ? fight.methodA : fight.methodB;
  const market = methodProb(marketRow, kind);
  const model = kind === "ko" ? p.pKo : kind === "sub" ? p.pSub : p.pDec;
  const american = marketRow ? (kind === "ko" ? marketRow.ko : kind === "sub" ? marketRow.sub : marketRow.dec) : null;
  if (market == null) return { edge: model, american, model, market: null, priced: false };
  return { edge: model - market, american, model, market, priced: true };
}

function distanceModel(fight: UfcFight, pair: UfcFighter[]): number {
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

function bet(partial: Omit<UfcBet, "confidence"> & { confidence?: number }): UfcBet {
  return {
    ...partial,
    confidence: partial.confidence ?? conf(partial.edge, partial.priced),
  };
}

export function buildUfcDesk(fights: UfcFight[], players: UfcFighter[]): UfcDesk {
  const live = fights.filter((f) => !f.completed);
  const pool = players.filter((p) => live.some((f) => f.id === p.fightId));
  const grouped = byFight(pool);
  const oddsOk = live.some((f) => f.aMl != null || f.bMl != null);
  const sources = [...new Set(live.flatMap((f) => f.books))];
  if (!sources.length) sources.push(oddsOk ? "FanDuel" : "model");

  const methodBets: Array<UfcBet & { kind: UfcMethod; rawEdge: number; model: number; subWins: number; american: number | null }> = [];
  for (const f of live) {
    const pair = grouped.get(f.id) ?? [];
    for (const p of pair) {
      for (const kind of ["ko", "sub", "dec"] as const) {
        const e = methodEdge(p, f, kind);
        if (e.model < 0.07) continue;
        const american = e.american;
        methodBets.push({
          ...bet({
            id: `meth-${p.id}-${kind}`,
            title: `${p.name} by ${methodLabel(kind)}`,
            market: "method",
            pick: `${p.name} by ${methodLabel(kind)}${american != null ? ` ${formatAmerican(american)}` : ""}`,
            line: `${f.name} · ${f.weightClass} · ${f.rounds}rd · ${f.card}`,
            why: e.priced
              ? `Model ${Math.round(e.model * 100)}% vs book ${Math.round((e.market ?? 0) * 100)}% (${formatAmerican(american ?? 0)}). ${careerLine(p)}`
              : `No method price posted. Model lean ${Math.round(e.model * 100)}%. ${careerLine(p)} Win ${Math.round(p.winProb * 100)}%.`,
            tape: e.priced ? "Priced method. Edge is model vs posted, not vibes." : "Model lean — no posted method market.",
            unit: unitFor(Math.max(e.edge, 0.04)),
            books: e.priced ? (f.books.join("/") || "FanDuel") : "model",
            edge: Math.max(0, e.edge),
            priced: e.priced,
            fightId: f.id,
            fighter: p.name,
          }),
          kind,
          rawEdge: e.edge,
          model: e.model,
          subWins: p.subWins,
          american: e.american,
        });
      }
    }
  }
  methodBets.sort((a, b) => Number(b.priced) - Number(a.priced) || b.model - a.model || b.rawEdge - a.rawEdge);

  const usedFights = new Set<string>();
  const pickKind = (kind: UfcMethod) => {
    const rows = methodBets.filter((b) => b.kind === kind && !usedFights.has(b.fightId));
    const ranked = [...rows].sort((a, b) => {
      const chalk = (x: typeof a) => (x.priced && (x.american ?? 0) <= -350 ? 1 : 0);
      const dart = (x: typeof a) => (x.priced && (x.american ?? 0) >= 700 ? 1 : 0);
      return chalk(a) - chalk(b) || dart(a) - dart(b) || Number(b.priced) - Number(a.priced) || b.model - a.model || b.rawEdge - a.rawEdge;
    });
    const row =
      kind === "sub"
        ? ranked.find((b) => b.priced || b.subWins >= 1)
        : ranked.find((b) => !(b.priced && (b.american ?? 0) <= -400)) ?? ranked[0];
    if (!row) return null;
    usedFights.add(row.fightId);
    return row;
  };

  const realSub = methodBets.find((b) => b.kind === "sub" && (b.priced || b.subWins >= 1) && b.model >= 0.08);
  let trifectaNote = "";
  const sub = realSub ? pickKind("sub") : null;
  if (!realSub) {
    trifectaNote = "No real submission lean on this card — nobody with sub wins is priced, and the model won’t force a fake sub. Trifecta stays empty until a real sub leg exists.";
  }
  const ko = pickKind("ko");
  const dec = pickKind("dec");
  if (!ko) trifectaNote = [trifectaNote, "No KO/TKO leg clearing the bar."].filter(Boolean).join(" ");
  if (!dec) trifectaNote = [trifectaNote, "No decision leg clearing the bar."].filter(Boolean).join(" ");

  let trifecta: UfcTrifecta | null = null;
  if (ko && sub && dec) {
    const rawLegs = [
      { row: ko, kind: "ko" as const },
      { row: sub, kind: "sub" as const },
      { row: dec, kind: "dec" as const },
    ];
    const legs: UfcTrifectaLeg[] = rawLegs.map(({ row, kind }) => ({
      kind,
      fighter: row.fighter ?? row.title,
      fightName: row.line,
      fightId: row.fightId,
      line: row.line,
      american: row.american,
      priced: row.priced,
      model: row.model,
      why: row.why,
    }));
    const allPriced = legs.every((l) => l.priced && l.american != null);
    const posted = allPriced ? parlayAmerican(legs.map((l) => l.american!)) : null;
    const modelProb = parlayProb(legs.map((l) => l.model));
    const postedProb = allPriced
      ? legs.reduce((acc, l) => acc * americanToProb(l.american!), 1)
      : modelProb;
    const combinedProb = allPriced ? postedProb : modelProb;
    const combinedAmerican = posted ?? probToLongAmerican(combinedProb);
    const edge = allPriced ? Math.max(0, modelProb - postedProb) : Math.max(0.04, modelProb);
    const unit = trifectaUnit(edge, combinedProb);
    const books = [...new Set(rawLegs.flatMap(({ row }) => (row.books ? row.books.split("/") : [])))].filter(Boolean).join("/") || (allPriced ? "FanDuel" : "model");
    trifecta = {
      legs,
      combinedAmerican,
      combinedProb,
      unit,
      priced: allPriced,
      books,
      edge,
      confidence: conf(edge, allPriced),
      why: allPriced
        ? `One ticket. Combined ${formatAmerican(combinedAmerican)}. Model hit rate ${Math.round(modelProb * 1000) / 10}% vs posted ${Math.round(postedProb * 1000) / 10}%. All three must cash.`
        : `One ticket. Combined ${formatAmerican(combinedAmerican)} is a model lean — at least one method isn’t posted. All three must cash.`,
      tape: `${unit}. Three different fights. KO + submission + decision. Not three singles.`,
    };
    if (!trifectaNote) trifectaNote = "One parlay. Three fights. All three must hit.";
  }

  const props: UfcBet[] = [];
  for (const f of live) {
    const pair = grouped.get(f.id) ?? [];
    if (f.goDistanceYes != null && f.goDistanceNo != null) {
      const { pa: yesMkt } = removeVigPair(f.goDistanceYes, f.goDistanceNo);
      const model = distanceModel(f, pair);
      const yes = model - yesMkt;
      const no = (1 - model) - (1 - yesMkt);
      const takeYes = yes >= no;
      const edge = takeYes ? yes : no;
      if (edge >= 0.045) {
        props.push(
          bet({
            id: `dist-${f.id}`,
            title: takeYes ? "Goes the distance" : "Doesn’t go the distance",
            market: "distance",
            pick: `${takeYes ? "Yes" : "No"} ${formatAmerican(takeYes ? f.goDistanceYes : f.goDistanceNo)}`,
            line: `${f.name} · ${f.weightClass} · ${f.rounds}rd · ${f.card}`,
            why: `Model ${Math.round(model * 100)}% distance vs book ${Math.round(yesMkt * 100)}% (Yes ${formatAmerican(f.goDistanceYes)} / No ${formatAmerican(f.goDistanceNo)}).`,
            tape: "Independent of the moneyline. 5-round title fights lean distance; finishers lean No.",
            unit: unitFor(edge),
            books: f.books.join("/") || "FanDuel",
            edge,
            priced: true,
            fightId: f.id,
          }),
        );
      }
    }
    if (f.howEnds && f.howEnds.ko != null && f.howEnds.sub != null && f.howEnds.dec != null) {
      const kinds: UfcMethod[] = ["ko", "sub", "dec"];
      const odds = [f.howEnds.ko, f.howEnds.sub, f.howEnds.dec];
      const mkt = removeVigN(odds);
      const pairKo = pair.reduce((s, p) => s + p.pKo, 0);
      const pairSub = pair.reduce((s, p) => s + p.pSub, 0);
      const pairDec = pair.reduce((s, p) => s + p.pDec, 0);
      const model = [pairKo, pairSub, pairDec];
      let bestI = 0;
      let bestE = -1;
      for (let i = 0; i < 3; i++) {
        const e = (model[i] ?? 0) - (mkt[i] ?? 0);
        if (e > bestE) {
          bestE = e;
          bestI = i;
        }
      }
      if (bestE >= 0.05) {
        const kind = kinds[bestI]!;
        props.push(
          bet({
            id: `end-${f.id}-${kind}`,
            title: `Fight ends ${methodLabel(kind)}`,
            market: "method",
            pick: `${methodLabel(kind)} ${formatAmerican(odds[bestI]!)}`,
            line: `${f.name} · how the fight ends · ${f.card}`,
            why: `Model ${Math.round((model[bestI] ?? 0) * 100)}% vs book ${Math.round((mkt[bestI] ?? 0) * 100)}%.`,
            tape: "Card-level method, not a fighter. Independent of ML.",
            unit: unitFor(bestE),
            books: f.books.join("/") || "FanDuel",
            edge: bestE,
            priced: true,
            fightId: f.id,
          }),
        );
      }
    }
    if (f.totalRounds != null && f.totalOver != null && f.totalUnder != null) {
      const floor = f.rounds === 5 ? 3.4 : 2.4;
      if (f.totalRounds >= floor) {
      const { pa: overMkt } = removeVigPair(f.totalOver, f.totalUnder);
      const dist = distanceModel(f, pair);
      const modelOver = f.totalRounds >= (f.rounds === 5 ? 3.5 : 2.5) ? dist * 0.85 + 0.12 : 1 - dist * 0.7;
      const over = modelOver - overMkt;
      const takeOver = over > 0;
      const edge = Math.abs(over);
      if (edge >= 0.05) {
        props.push(
          bet({
            id: `tot-${f.id}`,
            title: `${takeOver ? "Over" : "Under"} ${f.totalRounds} rounds`,
            market: "rounds",
            pick: `${takeOver ? "Over" : "Under"} ${f.totalRounds} ${formatAmerican(takeOver ? f.totalOver : f.totalUnder)}`,
            line: `${f.name} · ${f.rounds}rd scheduled · ${f.card}`,
            why: `Distance model ${Math.round(dist * 100)}% vs ${takeOver ? "over" : "under"} ${f.totalRounds}.`,
            tape: "Round total vs finish/distance model. No circular line-vs-itself.",
            unit: unitFor(edge),
            books: f.books.join("/") || "FanDuel",
            edge,
            priced: true,
            fightId: f.id,
          }),
        );
      }
      }
    }
  }
  props.sort((a, b) => b.edge - a.edge);

  const lotto: UfcBet[] = [];
  const lottoFights = new Set<string>();
  const longshots = [...pool].sort((a, b) => {
    const am = a.ml ?? 9999;
    const bm = b.ml ?? 9999;
    return bm - am;
  });
  for (const p of longshots) {
    if (lotto.length >= 3) break;
    if (lottoFights.has(p.fightId)) continue;
    const f = live.find((x) => x.id === p.fightId);
    if (!f) continue;
    const ml = p.ml;
    const dog = ml != null && ml >= 180;
    const methodLong = methodEdge(p, f, p.pSub >= p.pKo ? "sub" : "ko");
    const methodAmer = methodLong.american;
    const methodDog = methodAmer != null && methodAmer >= 250 && methodLong.model >= 0.1;
    if (!dog && !methodDog) continue;
    if (p.winProb >= 0.62) continue;
    lottoFights.add(p.fightId);
    lotto.push(
      bet({
        id: `lotto-${p.id}`,
        title: methodDog && methodAmer != null && methodAmer > (ml ?? 0) ? `${p.name} by ${p.pSub >= p.pKo ? "Submission" : "KO/TKO"}` : p.name,
        market: "lotto",
        pick: methodDog && methodAmer != null ? `${p.name} by ${p.pSub >= p.pKo ? "Sub" : "KO"} ${formatAmerican(methodAmer)}` : `${p.name} ML ${ml != null ? formatAmerican(ml) : ""}`.trim(),
        line: `${f.name} · ${f.weightClass} · ${f.card}`,
        why: dog
          ? `${formatAmerican(ml!)} dog. Need a miss on the favorite, not a parlay of chalk.`
          : `Method longshot ${formatAmerican(methodAmer ?? 0)}. Tiny unit.`,
        tape: "0.1u. Different fights. Not an all-favorites parlay.",
        unit: "0.1u",
        books: f.books.join("/") || (ml != null ? "FanDuel" : "model"),
        edge: Math.max(0.03, methodDog ? methodLong.edge : 1 / ((ml ?? 400) / 100 + 1)),
        priced: ml != null || methodLong.priced,
        fightId: f.id,
        fighter: p.name,
      }),
    );
  }

  const lottoParlay = buildLottoParlay(live, pool);

  const mlBets: UfcBet[] = [];
  for (const p of pool) {
    const f = live.find((x) => x.id === p.fightId);
    if (!f || p.ml == null) continue;
    const opp = pool.find((x) => x.fightId === p.fightId && x.id !== p.id);
    if (!opp || opp.ml == null) continue;
    const { pa } = removeVigPair(p.ml, opp.ml);
    const edge = p.winProb - pa;
    if (p.ml <= -400 && edge < 0.08) continue;
    if (edge < 0.05) continue;
    mlBets.push(
      bet({
        id: `ml-${p.id}`,
        title: `${p.name} ML`,
        market: "moneyline",
        pick: `${p.name} ${formatAmerican(p.ml)}`,
        line: `${f.name} · ${f.weightClass} · ${f.card}`,
        why: `Fair ${Math.round(p.winProb * 100)}% vs book ${Math.round(pa * 100)}% (${formatAmerican(p.ml)}). Edge ${Math.round(edge * 100)} pts.`,
        tape: "Price is the prior. Heavy chalk (−400 and shorter) is not automatic.",
        unit: unitFor(edge),
        books: f.books.join("/") || "FanDuel",
        edge,
        priced: true,
        fightId: f.id,
        fighter: p.name,
      }),
    );
  }
  mlBets.sort((a, b) => b.edge - a.edge);

  const catalog = [...methodBets.filter((b) => b.priced && b.rawEdge >= 0.035), ...props, ...mlBets].sort((a, b) => b.edge - a.edge);
  const bestValue = catalog[0] ?? null;

  return {
    trifecta,
    trifectaNote: trifectaNote || "One parlay. Three fights: KO, submission, decision. All three must hit.",
    props: props.slice(0, 6),
    lotto,
    lottoParlay,
    bestValue,
    moneyline: mlBets[0] ?? null,
    sources,
    oddsOk,
  };
}

export function publishedUfcBets(desk: UfcDesk): UfcBet[] {
  const rows: UfcBet[] = [];
  if (desk.trifecta && desk.trifecta.legs.length === 3) {
    const t = desk.trifecta;
    rows.push({
      id: "ufc-trifecta",
      title: "Trifecta",
      market: "trifecta",
      pick: t.legs.map(parlayPick).join(" + "),
      line: t.legs.map((l) => l.fightName.split(" · ")[0]).join(" / "),
      why: t.why,
      tape: t.tape,
      unit: t.unit,
      books: t.books,
      edge: t.edge,
      confidence: t.confidence,
      priced: t.priced,
      fightId: t.legs[0]!.fightId,
      legs: t.legs,
      combinedAmerican: t.combinedAmerican,
      combinedProb: t.combinedProb,
    });
  }
  if (desk.bestValue) rows.push({ ...desk.bestValue, id: `ufc-best-${desk.bestValue.id}` });
  if (desk.moneyline) rows.push({ ...desk.moneyline, id: "ufc-ml" });
  for (const b of desk.props) rows.push(b);
  for (const b of desk.lotto) rows.push(b);
  if (desk.lottoParlay && desk.lottoParlay.legs.length >= 3) {
    const t = desk.lottoParlay;
    rows.push({
      id: "ufc-lotto-parlay",
      title: "Lotto parlay",
      market: "lotto_parlay",
      pick: t.legs.map(parlayPick).join(" + "),
      line: t.legs.map((l) => l.fightName.split(" · ")[0]).join(" / "),
      why: t.why,
      tape: t.tape,
      unit: t.unit,
      books: t.books,
      edge: t.edge,
      confidence: t.confidence,
      priced: t.priced,
      fightId: t.legs[0]!.fightId,
      legs: t.legs,
      combinedAmerican: t.combinedAmerican,
      combinedProb: t.combinedProb,
    });
  }
  const seen = new Set<string>();
  return rows.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}
