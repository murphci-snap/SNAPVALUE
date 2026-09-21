import { americanToProb } from "@/lib/dfs/scoring";
import { formatAmerican, parlayProb } from "@/lib/dfs/markets";
import { methodLabel, removeVigN, removeVigPair } from "./scoring";
import type { UfcBet, UfcFight, UfcFighter, UfcMethod, UfcTrifecta, UfcTrifectaLeg } from "./types";
import { cardMethodTape, distanceTape } from "./desk-tape";
import {
  bet,
  buildLottoParlay,
  byFight,
  careerLine,
  conf,
  distanceModel,
  methodEdge,
  parlayAmerican,
  parlayPick,
  probToLongAmerican,
  trifectaUnit,
  unitFor,
  type UfcDesk,
} from "./desk-helpers";

import { type DeskHeadState } from "./desk-build-head";

export function buildDeskTail(s: DeskHeadState): UfcDesk {
  const { trifecta, trifectaNote, methodBets, live, pool, grouped, sources, oddsOk } = s;

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
            tape: distanceTape(f, pair),
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
            tape: cardMethodTape(),
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

