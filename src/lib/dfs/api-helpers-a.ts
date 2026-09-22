import type { MatchupQuality, SlateOption, SlateResponse, SlateWindow } from "./types";

export const CACHE_VER = 40;
export type CacheHit = { at: number; value: SlateResponse };
export const g = globalThis as typeof globalThis & { __snapvalueCache?: Map<string, CacheHit> };
export function getCache() {
  if (!g.__snapvalueCache) g.__snapvalueCache = new Map();
  return g.__snapvalueCache;
}

export type DkDraftable = {
  playerId: number;
  playerDkId: number;
  displayName: string;
  firstName: string;
  lastName: string;
  shortName: string;
  position: string;
  rosterSlotId: number;
  salary: number;
  status?: string;
  newsStatus?: string;
  playerImage160?: string;
  teamAbbreviation: string;
  competition?: { competitionId: number; name: string; startTime: string };
  draftStatAttributes?: { id: number; value: string; sortValue?: string; quality?: string }[];
  playerAttributes?: { name: string; value: string }[];
};

export type DkCompetition = {
  competitionId: number;
  name: string;
  startTime: string;
  venue?: string;
  weather?: { icon?: string; isDome?: boolean };
  homeTeam?: { abbreviation: string; teamName: string };
  awayTeam?: { abbreviation: string; teamName: string };
  competitionAttributes?: { typeId: number; value: string }[];
};

export type DkGroup = {
  draftGroupId: number;
  startTimeSuffix?: string | null;
  minStartTime: string;
  maxStartTime?: string;
  draftGroupState?: string;
  contestType?: { contestTypeId: number; sport?: string };
  sportId?: number;
  leagues?: { leagueAbbreviation?: string }[];
  games?: unknown[];
  gameTypeId?: number;
  featured?: boolean;
};

export type EspnPlayerRow = {
  player?: {
    id: number;
    fullName: string;
    firstName: string;
    lastName: string;
    defaultPositionId: number;
    proTeamId: number;
    injuryStatus?: string;
    stats?: {
      appliedTotal?: number;
      scoringPeriodId: number;
      seasonId: number;
      statSourceId: number;
      statSplitTypeId: number;
      stats?: Record<string, number>;
    }[];
  };
};

export function parseQuality(q?: string): MatchupQuality {
  if (q === "High" || q === "Medium" || q === "Low") return q;
  return "Unknown";
}

export function opponentOf(gameName: string, team: string): { opp: string; home: boolean } {
  const parts = gameName.split(/\s+/);
  const at = parts.indexOf("@");
  if (at > 0 && parts[0] && parts[2]) {
    const away = parts[0];
    const home = parts[2];
    if (team === home) return { opp: away, home: true };
    if (team === away) return { opp: home, home: false };
  }
  const vs = gameName.replace(/\s/g, "");
  const [a, b] = vs.split("@");
  if (a && b) {
    if (team === b) return { opp: a, home: true };
    if (team === a) return { opp: b, home: false };
  }
  return { opp: "FA", home: true };
}

export function isNflGroup(g: DkGroup, contestTypeId: number): boolean {
  if (g.contestType?.contestTypeId !== contestTypeId) return false;
  if (g.sportId && g.sportId !== 1) return false;
  const nfl = (g.leagues ?? []).some((l) => l.leagueAbbreviation === "NFL") || !g.leagues?.length;
  if (!nfl) return false;
  const start = Date.parse(g.minStartTime);
  const now = Date.now();
  const weekMs = 8 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(start) || start < now - 12 * 60 * 60 * 1000 || start > now + weekMs) return false;
  if (g.draftGroupState && !/upcoming|live/i.test(g.draftGroupState)) return false;
  return true;
}

export const CLASSIC_ORDER: SlateWindow[] = [
  "main",
  "sunday",
  "early",
  "sunmon",
  "afternoon",
  "turbo",
  "primetime",
  "monthu",
];

export function canonWindow(w?: SlateWindow): SlateWindow | undefined {
  if (w === "sun1") return "early";
  if (w === "sun4") return "afternoon";
  return w;
}

/** ET weekday 0=Sun … 6=Sat, hour 0–23. */
export function etKickoff(iso: string): { weekday: number; hour: number } | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "", 10);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = map[wd];
  if (weekday == null || !Number.isFinite(hour)) return null;
  return { weekday, hour };
}

export function etKickoffLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const wd = get("weekday");
  const hour = get("hour");
  const min = get("minute");
  const ap = get("dayPeriod").replace(/\./g, "").toUpperCase();
  if (!wd || !hour) return "";
  return `${wd} ${hour}:${min} ${ap} ET`;
}

export function prettySuffix(raw?: string | null): string {
  const s = (raw ?? "").replace(/[()]/g, "").trim();
  if (!s) return "";
  return s.replace(/-/g, "–");
}

export function kickoffInWindow(iso: string, w: LatteWindow): boolean {
  const et = etKickoff(iso);
  if (!et) return false;
  const win = canonWindow(w) ?? w;
  if (win === "early" || win === "sun1") return et.weekday === 0 && et.hour >= 12 && et.hour <= 14;
  if (win === "afternoon" || win === "sun4") return et.weekday === 0 && et.hour >= 16 && et.hour <= 17;
  if (win === "turbo") return et.weekday === 0 && et.hour === 16;
  if (win === "sunday") return et.weekday === 0 && et.hour < 19;
  if (win === "primetime") return (et.weekday === 0 && et.hour >= 19) || (et.weekday === 1 && et.hour >= 19);
  if (win === "monthu") return (et.weekday === 1 && et.hour >= 19) || (et.weekday === 4 && et.hour >= 19);
  if (win === "snf") return et.weekday === 0 && et.hour >= 19;
  if (win === "tnf") return et.weekday === 4 && et.hour >= 19;
  if (win === "mnf") return et.weekday === 1 && et.hour >= 19;
  return true;
}
