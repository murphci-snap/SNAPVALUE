import type { RankingMethod, SlateFormat } from "@/lib/dfs/types";

export type UfcCard = "main" | "prelims" | "early";
export type UfcMethod = "ko" | "sub" | "dec";
export type UfcLens = "all" | "cash" | "gpp";
export type UfcRole = "CPT" | "FLEX" | null;
export type UfcSlot = "CPT" | "F";

export interface UfcMethodMarket {
  ko: number | null;
  sub: number | null;
  dec: number | null;
  books: string[];
}

export interface UfcFighter {
  id: string;
  dkId: number;
  espnId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  opponent: string;
  opponentId: string;
  fightId: string;
  fightName: string;
  card: UfcCard;
  weightClass: string;
  rounds: 3 | 5;
  startTime: string;
  salary: number;
  winProb: number;
  ml: number | null;
  pKo: number;
  pSub: number;
  pDec: number;
  projection: number;
  ceiling: number;
  floor: number;
  value: number;
  valueRank: number;
  isValuePlay: boolean;
  image: string | null;
  record: string;
  wins: number;
  losses: number;
  koWins: number;
  subWins: number;
  rankingMethod: RankingMethod;
  showdownRole: UfcRole;
  priced: boolean;
}

export interface UfcFight {
  id: string;
  name: string;
  card: UfcCard;
  weightClass: string;
  rounds: 3 | 5;
  startTime: string;
  venue: string;
  aName: string;
  bName: string;
  aId: string;
  bId: string;
  aMl: number | null;
  bMl: number | null;
  howEnds: UfcMethodMarket | null;
  methodA: UfcMethodMarket | null;
  methodB: UfcMethodMarket | null;
  goDistanceYes: number | null;
  goDistanceNo: number | null;
  totalRounds: number | null;
  totalOver: number | null;
  totalUnder: number | null;
  books: string[];
  winnerName: string | null;
  resultMethod: UfcMethod | null;
  resultRound: number | null;
  completed: boolean;
}

export interface UfcSlateOption {
  draftGroupId: number;
  label: string;
  suffix: string;
  title?: string;
  subtitle?: string;
  startTime: string;
  gameCount: number;
  format: SlateFormat;
}

export interface UfcSlateData {
  ok: true;
  sport: "UFC";
  eventId: number;
  eventName: string;
  headline: string;
  venue: string;
  fetchedAt: string;
  nextRefreshAt: string;
  draftGroupId: number;
  salaryCap: number;
  slateLabel: string;
  format: SlateFormat;
  slates: UfcSlateOption[];
  fights: UfcFight[];
  players: UfcFighter[];
  allPlayers: UfcFighter[];
  sources: { id: string; label: string; ok: boolean; players: number }[];
  notice: string | null;
  salariesPosted: boolean;
  stale?: boolean;
}

export interface UfcSlateError {
  ok: false;
  sport: "UFC";
  error: string;
}

export type UfcSlateResponse = UfcSlateData | UfcSlateError;

export interface UfcLineupPlayer {
  slot: UfcSlot;
  player: UfcFighter;
}

export interface UfcLineup {
  id: string;
  players: UfcLineupPlayer[];
  salary: number;
  projection: number;
  value: number;
  remaining: number;
}

export interface UfcBet {
  id: string;
  title: string;
  market: "trifecta" | "method" | "distance" | "rounds" | "moneyline" | "lotto";
  pick: string;
  line: string;
  why: string;
  tape: string;
  unit: string;
  books: string;
  edge: number;
  confidence: number;
  priced: boolean;
  fightId: string;
  fighter?: string;
}
