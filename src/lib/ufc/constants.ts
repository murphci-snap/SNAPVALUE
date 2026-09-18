import type { UfcCard, UfcSlot } from "./types";

export const UFC_CAP = 50_000;
export const UFC_REFRESH_MS = 30 * 60 * 1000;
export const UFC_EVENT_ID = 331;
export const UFC_EVENT_NAME = "UFC 331";
export const UFC_HEADLINE = "Van vs Pantoja";
export const UFC_VENUE = "Crypto.com Arena";
export const FD_UFC_EVENT_TYPE = 26420387;
export const FD_AK = "FhMFpcPWXMeyZxOx";

export const UFC_CLASSIC_CT = 168;
export const UFC_SPORT_ID = 9;
export const UFC_FIGHTER_SLOT = 129;
export const UFC_CPT_SLOT = 511;
/** All Day + the extra 12-fight group — not the Classic 6. */
export const UFC_SKIP_CT = [333, 373];

export const UFC_ROSTER: { slot: UfcSlot }[] = [
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
];

export const UFC_SHOWDOWN_ROSTER: { slot: UfcSlot }[] = [
  { slot: "CPT" },
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
  { slot: "F" },
];

/** Confirmed UFC 331 card — used only if DK/ESPN both miss. */
export const UFC_331_FALLBACK: Array<{
  a: string;
  b: string;
  weight: string;
  rounds: 3 | 5;
  card: UfcCard;
  start: string;
}> = [
  { a: "Joshua Van", b: "Alexandre Pantoja", weight: "Flyweight", rounds: 5, card: "main", start: "2026-09-20T02:20:00.000Z" },
  { a: "Arman Tsarukyan", b: "Mauricio Ruffy", weight: "Lightweight", rounds: 5, card: "main", start: "2026-09-20T02:00:00.000Z" },
  { a: "Patricio Pitbull", b: "Dooho Choi", weight: "Featherweight", rounds: 3, card: "main", start: "2026-09-20T01:40:00.000Z" },
  { a: "Gable Steveson", b: "Sean Sharaf", weight: "Heavyweight", rounds: 3, card: "main", start: "2026-09-20T01:20:00.000Z" },
  { a: "Alonzo Menifield", b: "Iwo Baraniewski", weight: "Light Heavyweight", rounds: 3, card: "main", start: "2026-09-20T01:00:00.000Z" },
  { a: "Renato Moicano", b: "Brian Ortega", weight: "Lightweight", rounds: 3, card: "main", start: "2026-09-20T01:00:00.000Z" },
  { a: "Marlon Vera", b: "Charles Jourdain", weight: "Bantamweight", rounds: 3, card: "prelims", start: "2026-09-20T00:00:00.000Z" },
  { a: "Tai Tuivasa", b: "Robelis Despaigne", weight: "Heavyweight", rounds: 3, card: "prelims", start: "2026-09-19T23:40:00.000Z" },
  { a: "Michael Aswell Jr.", b: "JooSang Yoo", weight: "Featherweight", rounds: 3, card: "prelims", start: "2026-09-19T23:20:00.000Z" },
  { a: "Ryan Gandra", b: "Ozzy Diaz", weight: "Middleweight", rounds: 3, card: "prelims", start: "2026-09-19T23:00:00.000Z" },
  { a: "Edmen Shahbazyan", b: "Brunno Ferreira", weight: "Middleweight", rounds: 3, card: "early", start: "2026-09-19T21:50:00.000Z" },
  { a: "Casey O'Neill", b: "Eduarda Moura", weight: "Women's Flyweight", rounds: 3, card: "early", start: "2026-09-19T21:40:00.000Z" },
  { a: "Giga Chikadze", b: "Joanderson Brito", weight: "Featherweight", rounds: 3, card: "early", start: "2026-09-19T21:30:00.000Z" },
];
