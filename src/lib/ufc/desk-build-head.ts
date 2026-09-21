import { americanToProb } from "@/lib/dfs/scoring";
import { formatAmerican, parlayProb } from "@/lib/dfs/markets";
import { methodLabel } from "./scoring";
import type { UfcBet, UfcFight, UfcFighter, UfcMethod, UfcTrifecta, UfcTrifectaLeg } from "./types";
import {
  bet,
  byFight,
  careerLine,
  conf,
  methodEdge,
  parlayAmerican,
  probToLongAmerican,
  trifectaUnit,
  unitFor,
  type UfcDesk,
} from "./desk-helpers";

export type { UfcDesk };

export interface DeskHeadState {
  trifecta: UfcDesk["trifecta"];
  trifectaNote: string;
  methodBets: Array<UfcBet & { kind: UfcMethod; rawEdge: number; model: number; subWins: number; american: number | null }>;
  live: UfcFight[];
  pool: UfcFighter[];
  grouped: Map<string, UfcFighter[]>;
  sources: string[];
  oddsOk: boolean;
}

export function buildDeskHead(fights: UfcFight[], players: UfcFighter[]): DeskHeadState {

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


  return { trifecta, trifectaNote, methodBets, live, pool, grouped, sources, oddsOk };
}
