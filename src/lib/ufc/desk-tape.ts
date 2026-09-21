import type { UfcFight, UfcFighter } from "./types";

export function isTitleFight(fight: UfcFight): boolean {
  const blob = `${fight.weightClass} ${fight.name} ${fight.card}`.toLowerCase();
  return /title|championship|\bchamp\b|interim|belt/.test(blob);
}

export function finisherHeavy(pair: UfcFighter[]): boolean {
  if (pair.length < 2) return false;
  return pair.every((p) => {
    const games = p.wins + p.losses;
    if (games < 3 || p.record === "0-0-0" || p.wins <= 0) return false;
    return (p.koWins + p.subWins) / p.wins >= 0.55;
  });
}

/** Distance prop tape — keep ML independence; second sentence is fight-aware. */
export function distanceTape(fight: UfcFight, pair: UfcFighter[]): string {
  const base = "Independent of the moneyline.";
  if (fight.rounds === 5 && isTitleFight(fight)) {
    return `${base} 5-round title fights lean distance.`;
  }
  if (fight.rounds === 5) {
    return `${base} 5-round fights lean distance.`;
  }
  if (finisherHeavy(pair)) {
    return `${base} Finishers lean No.`;
  }
  return `${base} Finish rate vs decision rate for this matchup.`;
}

/** Card-level how-the-fight-ends tape — one clear sentence, not ML boilerplate. */
export function cardMethodTape(): string {
  return "Card-level how the fight ends — not a fighter method prop.";
}
