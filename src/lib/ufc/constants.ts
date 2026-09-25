import { lastNameOf } from "./scoring";
import { normalizeName } from "@/lib/utils";
import type { UfcCard, UfcSlot } from "./types";

export const UFC_CAP = 50_000;
export const UFC_REFRESH_MS = 30 * 60 * 1000;
export const UFC_EVENT_ID = 0;
export const UFC_EVENT_NAME = "UFC Fight Night";
export const UFC_HEADLINE = "Rosas Jr. vs Barcelos";
export const UFC_VENUE = "Meta APEX";
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

/** This weekend if ESPN and DraftKings both miss. Verified Sep 25 2026 against ESPN scoreboard and ufc.com. */
export const UFC_FN_FALLBACK: Array<{
  a: string;
  b: string;
  weight: string;
  rounds: 3 | 5;
  card: UfcCard;
  start: string;
}> = [
  { a: "Raul Rosas Jr.", b: "Raoni Barcelos", weight: "Bantamweight", rounds: 5, card: "main", start: "2026-09-27T00:00:00.000Z" },
  { a: "Norma Dumont", b: "Ailin Perez", weight: "Women's Bantamweight", rounds: 3, card: "main", start: "2026-09-27T00:00:00.000Z" },
  { a: "Luis Hernandez", b: "Sedriques Dumas", weight: "Light Heavyweight", rounds: 3, card: "main", start: "2026-09-27T00:00:00.000Z" },
  { a: "Mehemmedeli Osmanli", b: "Ilimbek Akylbek Uulu", weight: "Bantamweight", rounds: 3, card: "main", start: "2026-09-27T00:00:00.000Z" },
  { a: "Melissa Amaya", b: "Tina Black", weight: "Women's Strawweight", rounds: 3, card: "main", start: "2026-09-27T00:00:00.000Z" },
  { a: "Brady Hiestand", b: "Rinya Nakamura", weight: "Bantamweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
  { a: "Rodolfo Vieira", b: "Robert Bryczek", weight: "Middleweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
  { a: "Rodolfo Bellato", b: "Christian Edwards", weight: "Light Heavyweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
  { a: "Elves Brener", b: "Josiah Harrell", weight: "Lightweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
  { a: "Montel Jackson", b: "Ricky Simon", weight: "Bantamweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
  { a: "John Castaneda", b: "Alatengheili", weight: "Bantamweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
  { a: "Vanessa Demopoulos", b: "Yazmin Jauregui", weight: "Women's Strawweight", rounds: 3, card: "prelims", start: "2026-09-26T21:00:00.000Z" },
];

/** Names on the live card. News pullouts have to match these, not last week's UFC 331 roster. */
export const UFC_LIVE_KEYS = [
  "rosas", "barcelos", "dumont", "perez", "hernandez", "dumas", "osmanli", "akylbek", "amaya", "black",
  "hiestand", "nakamura", "vieira", "bryczek", "bellato", "edwards", "brener", "harrell", "jackson", "simon",
  "castaneda", "alatengheili", "demopoulos", "jauregui",
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
  { a: "Marlon Vera", b: "Charles Jourdain", weight: "Bantamweight", rounds: 3, card: "prelims", start: "2026-09-20T00:00:00.000Z" },
  { a: "Tai Tuivasa", b: "Robelis Despaigne", weight: "Heavyweight", rounds: 3, card: "prelims", start: "2026-09-19T23:40:00.000Z" },
  { a: "Michael Aswell Jr.", b: "JooSang Yoo", weight: "Featherweight", rounds: 3, card: "prelims", start: "2026-09-19T23:20:00.000Z" },
  { a: "Ryan Gandra", b: "Ozzy Diaz", weight: "Middleweight", rounds: 3, card: "prelims", start: "2026-09-19T23:00:00.000Z" },
  { a: "Edmen Shahbazyan", b: "Brunno Ferreira", weight: "Middleweight", rounds: 3, card: "early", start: "2026-09-19T21:50:00.000Z" },
  { a: "Casey O'Neill", b: "Eduarda Moura", weight: "Women's Flyweight", rounds: 3, card: "early", start: "2026-09-19T21:40:00.000Z" },
  { a: "Giga Chikadze", b: "Joanderson Brito", weight: "Featherweight", rounds: 3, card: "early", start: "2026-09-19T21:30:00.000Z" },
];

/** Scratched Sep 14 2026 — Ortega vs Moicano pulled from 331. Moicano to Oct 31. */
export const UFC_331_SCRATCHED_SEED = ["ortega", "moicano"];

const UFC_331_MAIN_PAIRS: Array<[string, string]> = [
  ["van", "pantoja"],
  ["tsarukyan", "ruffy"],
  ["choi", "pitbull"],
  ["choi", "freire"],
  ["steveson", "sharaf"],
  ["baraniewski", "menifield"],
];

const UFC_331_PRELIM_PAIRS: Array<[string, string]> = [
  ["vera", "jourdain"],
  ["tuivasa", "despaigne"],
  ["aswell", "yoo"],
  ["gandra", "diaz"],
];

const UFC_331_EARLY_PAIRS: Array<[string, string]> = [
  ["shahbazyan", "ferreira"],
  ["oneill", "moura"],
  ["chikadze", "brito"],
];

function nameKeys(name: string): string[] {
  const n = normalizeName(name);
  const last = normalizeName(lastNameOf(name));
  const extra: string[] = [];
  if (/pitbull|freire/.test(n)) extra.push("pitbull", "freire");
  if (/dooho|choi/.test(n)) extra.push("choi");
  if (/joosang|yoo/.test(n)) extra.push("yoo");
  if (/aswell/.test(n)) extra.push("aswell");
  if (/oneill|o'neill/.test(n) || last === "oneill") extra.push("oneill");
  return [...new Set([n, last, ...extra].filter(Boolean))];
}

function pairHit(a: string, b: string, pairs: Array<[string, string]>): boolean {
  const A = nameKeys(a);
  const B = nameKeys(b);
  return pairs.some(([x, y]) => (A.includes(x) && B.includes(y)) || (A.includes(y) && B.includes(x)));
}

export function isUfc331Scratched(name: string, extra: string[] = []): boolean {
  const n = normalizeName(name);
  const last = normalizeName(lastNameOf(name));
  return [...UFC_331_SCRATCHED_SEED, ...extra].some((s) => {
    const k = normalizeName(s);
    return Boolean(k) && (n.includes(k) || last === k);
  });
}

export function isUfc331Window(iso: string): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return t >= Date.parse("2026-09-18T12:00:00Z") && t <= Date.parse("2026-09-21T12:00:00Z");
}

/** Null = not booked on UFC 331 (stale event / pulled bout). */
export function ufc331CardOf(a: string, b: string, extra: string[] = []): UfcCard | null {
  if (isUfc331Scratched(a, extra) || isUfc331Scratched(b, extra)) return null;
  if (pairHit(a, b, UFC_331_MAIN_PAIRS)) return "main";
  if (pairHit(a, b, UFC_331_EARLY_PAIRS)) return "early";
  if (pairHit(a, b, UFC_331_PRELIM_PAIRS)) return "prelims";
  return null;
}

export function isUfc331BookedName(name: string, extra: string[] = []): boolean {
  if (isUfc331Scratched(name, extra)) return false;
  const keys = nameKeys(name);
  const pairs = [...UFC_331_MAIN_PAIRS, ...UFC_331_PRELIM_PAIRS, ...UFC_331_EARLY_PAIRS];
  return pairs.some(([x, y]) => keys.includes(x) || keys.includes(y));
}

export function ufc331RosterKeys(): string[] {
  return [...new Set([...UFC_331_MAIN_PAIRS, ...UFC_331_PRELIM_PAIRS, ...UFC_331_EARLY_PAIRS].flat().concat(UFC_331_SCRATCHED_SEED))];
}

export function isUfcFightWeek(now = Date.now()): boolean {
  return now >= Date.parse("2026-09-24T00:00:00Z") && now <= Date.parse("2026-09-27T12:00:00Z");
}

export function ufcCacheMs(now = Date.now()): number {
  return isUfcFightWeek(now) ? 8 * 60 * 1000 : UFC_REFRESH_MS;
}
