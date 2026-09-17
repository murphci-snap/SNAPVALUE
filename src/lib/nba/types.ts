import type { Game, MatchupQuality, RankingMethod, SlateFormat } from "@/lib/dfs/types";

export type NbaPos = "PG" | "SG" | "SF" | "PF" | "C";
export type NbaSlot = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F" | "UTIL";
export type NbaLens = "all" | "cash" | "gpp";

export interface NbaBox {
  pts: number;
  threes: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  min: number;
  gp: number;
  dd: number;
  td: number;
}

export interface NbaPlayer {
  id: string;
  dkId: number;
  name: string;
  firstName: string;
  lastName: string;
  position: NbaPos;
  team: string;
  opponent: string;
  home: boolean;
  gameName: string;
  startTime: string;
  salary: number;
  fppg: number;
  oppRank: number;
  oppQuality: MatchupQuality;
  projection: number;
  value: number;
  valueRank: number;
  isValuePlay: boolean;
  isStarter: boolean;
  image: string | null;
  status: string;
  injury: string | null;
  rankingMethod: RankingMethod;
  itFactor: boolean;
  itFactorWhy: string | null;
  cheapImpact: boolean;
  cheapImpactWhy: string | null;
  ownership: number | null;
  box: NbaBox | null;
  props: { pts?: number; reb?: number; ast?: number; threes?: number; books: string[] } | null;
}

export interface NbaSlateOption {
  draftGroupId: number;
  label: string;
  suffix: string;
  startTime: string;
  gameCount: number;
  format: SlateFormat;
}

export interface NbaSlateData {
  ok: true;
  sport: "NBA";
  fetchedAt: string;
  nextRefreshAt: string;
  draftGroupId: number;
  salaryCap: number;
  slateLabel: string;
  format: SlateFormat;
  slates: NbaSlateOption[];
  games: Game[];
  players: NbaPlayer[];
  sources: { id: string; label: string; ok: boolean; players: number }[];
  notice: string | null;
  stale?: boolean;
}

export interface NbaSlateError {
  ok: false;
  sport: "NBA";
  error: string;
}

export type NbaSlateResponse = NbaSlateData | NbaSlateError;

export interface NbaLineupPlayer {
  slot: NbaSlot;
  player: NbaPlayer;
}

export interface NbaLineup {
  id: string;
  players: NbaLineupPlayer[];
  salary: number;
  projection: number;
  value: number;
  remaining: number;
}
