import type { UfcBet } from "./types";
import { parlayPick, type UfcDesk } from "./desk-helpers";

export function publishedUfcBetsImpl(desk: UfcDesk): UfcBet[] {
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
