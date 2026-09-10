export type Position = "QB" | "RB" | "WR" | "TE" | "DST";
export type FlexPosition = "RB" | "WR" | "TE";
export type RosterSlot = "QB" | "RB" | "RB2" | "WR" | "WR2" | "WR3" | "TE" | "FLEX" | "DST";

export type MatchupQuality = "High" | "Medium" | "Low" | "Unknown";

export type RankingMethod = "props" | "consensus" | "fppg";

export interface Game {
  id: number;
  name: string;
  startTime: string;
  venue: string;
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
  weather: string | null;
  isDome: boolean;
  broadcast: string | null;
  total: number | null;
  spread: number | null;
  homeImplied: number | null;
  awayImplied: number | null;
}

export interface SeasonStats {
  games: number;
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTd: number;
  interceptions: number;
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
  fumblesLost: number;
  fantasyPts: number;
  fantasyPpg: number;
  sacks: number;
  defInt: number;
  fumRec: number;
  defTd: number;
  ptsAllowed: number;
  ydsAllowed: number;
}

export interface WeekProjection {
  passYds: number;
  passTd: number;
  interceptions: number;
  rushYds: number;
  rushTd: number;
  receptions: number;
  recYds: number;
  recTd: number;
  sacks: number;
  defInt: number;
  fumRec: number;
  defTd: number;
  ptsAllowed: number;
  espnPpr: number;
  dk: number;
}

export interface SourceProjection {
  id: string;
  label: string;
  points: number;
  kind: "props" | "site";
}

export interface PropLine {
  passYds?: number;
  passTd?: number;
  interceptions?: number;
  rushYds?: number;
  rushTd?: number;
  receptions?: number;
  recYds?: number;
  recTd?: number;
  anytimeTd?: number;
  books: string[];
}

export interface DefenseProfile {
  abbr: string;
  name: string;
  rankVsPos: number;
  quality: MatchupQuality;
  sacks: number;
  defInt: number;
  fumRec: number;
  defTd: number;
  ptsAllowed: number;
  ydsAllowed: number;
  dstPpg: number;
}

export interface Player {
  id: string;
  dkId: number;
  name: string;
  firstName: string;
  lastName: string;
  shortName: string;
  position: Position;
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
  image: string | null;
  status: string;
  injury: string | null;
  byeWeek: number | null;
  stats: SeasonStats | null;
  week: WeekProjection | null;
  defense: DefenseProfile | null;
  valueRank: number;
  isValuePlay: boolean;
  isStarter: boolean;
  sources: SourceProjection[];
  rankingMethod: RankingMethod;
  propProjection: number | null;
  consensusProjection: number | null;
  props: PropLine | null;
  itFactor: boolean;
  itFactorScore: number;
  itFactorWhy: string | null;
  anytimeTd: number | null;
  cheapImpact: boolean;
  cheapImpactWhy: string | null;
}

export interface SlateOption {
  draftGroupId: number;
  label: string;
  suffix: string;
  startTime: string;
  gameCount: number;
}

export interface DataSourceInfo {
  id: string;
  label: string;
  ok: boolean;
  players: number;
}

export interface SlateData {
  ok: true;
  week: number;
  season: number;
  seasonType: string;
  fetchedAt: string;
  nextRefreshAt: string;
  draftGroupId: number;
  salaryCap: number;
  slateLabel: string;
  slates: SlateOption[];
  games: Game[];
  players: Player[];
  dvp: Record<Position, DefenseProfile[]>;
  sources: DataSourceInfo[];
}

export interface SlateError {
  ok: false;
  error: string;
}

export type SlateResponse = SlateData | SlateError;

export interface LineupPlayer {
  slot: RosterSlot;
  player: Player;
}

export interface Lineup {
  id: string;
  players: LineupPlayer[];
  salary: number;
  projection: number;
  value: number;
  remaining: number;
  stacks: string[];
}
