import { createServerFn } from "@tanstack/react-start";
import { normalizeName } from "@/lib/utils";
import { ESPN_POS, ESPN_TEAMS, POSITIONS, REFRESH_MS, SALARY_CAP, SHOWDOWN_POSITIONS } from "./constants";
import { getJson, settled } from "./http";
import { markItFactor } from "./it-factor";
import { markOwnership } from "./ownership";
import { markCheapImpact } from "./sleeper";
import { applyGameLines, loadProps, lookupProps } from "./props";
import { loadCbs, loadFantasyProsEcr, loadSleeper, loadYahoo, lookupSite } from "./projections";
import { dkFromProps, dkFromWeek, emptyWeek, fillWeek, isQuestionable, isSidelined, matchupMultiplier, propsBlendWeight, Q_HAIRCUT, robustSiteConsensus, round1, round2, seasonFromEspn, weekFromEspn } from "./scoring";
import type {
  DataSourceInfo,
  DefenseProfile,
  Game,
  MatchupQuality,
  Player,
  Position,
  RankingMethod,
  SlateFormat,
  SlateOption,
  SlateResponse,
  SourceProjection,
  WeekProjection,
} from "./types";

const CACHE_VER = 26;
type CacheHit = { at: number; value: SlateResponse };
const g = globalThis as typeof globalThis & { __snapvalueCache?: Map<string, CacheHit> };
function getCache() {
  if (!g.__snapvalueCache) g.__snapvalueCache = new Map();
  return g.__snapvalueCache;
}

type DkDraftable = {
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

type DkCompetition = {
  competitionId: number;
  name: string;
  startTime: string;
  venue?: string;
  weather?: { icon?: string; isDome?: boolean };
  homeTeam?: { abbreviation: string; teamName: string };
  awayTeam?: { abbreviation: string; teamName: string };
  competitionAttributes?: { typeId: number; value: string }[];
};

type DkGroup = {
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
};

type EspnPlayerRow = {
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

function parseQuality(q?: string): MatchupQuality {
  if (q === "High" || q === "Medium" || q === "Low") return q;
  return "Unknown";
}

function opponentOf(gameName: string, team: string): { opp: string; home: boolean } {
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

function slateLabel(g: DkGroup): { label: string; suffix: string } {
  const raw = (g.startTimeSuffix ?? "").replace(/[()]/g, "").trim();
  const games = g.games?.length ?? 0;
  if (!raw) {
    return { label: games ? `Main (${games} games)` : "Main slate", suffix: "Main" };
  }
  return { label: `${raw} · ${games} games`, suffix: raw };
}

function pickClassicSlates(groups: DkGroup[]): SlateOption[] {
  const now = Date.now();
  const weekMs = 8 * 24 * 60 * 60 * 1000;
  const out: SlateOption[] = [];
  for (const g of groups) {
    if (g.contestType?.contestTypeId !== 21) continue;
    if (g.sportId && g.sportId !== 1) continue;
    const nfl = (g.leagues ?? []).some((l) => l.leagueAbbreviation === "NFL") || !g.leagues?.length;
    if (!nfl) continue;
    const start = Date.parse(g.minStartTime);
    if (!Number.isFinite(start) || start < now - 12 * 60 * 60 * 1000 || start > now + weekMs) continue;
    if (g.draftGroupState && !/upcoming|live/i.test(g.draftGroupState)) continue;
    const { label, suffix } = slateLabel(g);
    out.push({
      draftGroupId: g.draftGroupId,
      label,
      suffix,
      startTime: g.minStartTime,
      gameCount: g.games?.length ?? 0,
      format: "classic",
    });
  }
  out.sort((a, b) => b.gameCount - a.gameCount || a.startTime.localeCompare(b.startTime));
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.suffix}-${s.gameCount}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function showdownGameName(g: DkGroup): string {
  const first = Array.isArray(g.games) ? g.games[0] : null;
  if (first && typeof first === "object" && first && "name" in first) {
    const n = String((first as { name?: string }).name ?? "").trim();
    if (n) return n;
  }
  const raw = (g.startTimeSuffix ?? "").replace(/[()]/g, "").trim();
  return raw || "Showdown";
}

/** ET weekday 0=Sun … 6=Sat, hour 0–23. */
function etKickoff(iso: string): { weekday: number; hour: number } | null {
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

function primetimeWindow(iso: string, blob: string): "TNF" | "SNF" | "MNF" | "Sat" | "Fri" | null {
  const et = etKickoff(iso);
  if (et) {
    if (et.weekday === 4 && et.hour >= 19) return "TNF";
    if (et.weekday === 5 && et.hour >= 19) return "Fri";
    if (et.weekday === 6 && et.hour >= 19) return "Sat";
    if (et.weekday === 0 && et.hour >= 19) return "SNF";
    if (et.weekday === 1 && et.hour >= 19) return "MNF";
    return null;
  }
  const t = blob.toLowerCase();
  if (/\bearly\b|\bafternoon\b|\bmorning\b|\b1pm\b|\b4pm\b/.test(t) && !/\bnight\b|\bprime|\bsnf\b|\bmnf\b|\btnf\b/.test(t)) {
    return null;
  }
  if (/\btnf\b|thursday\s*night|thu\s*night/.test(t)) return "TNF";
  if (/\bsnf\b|sunday\s*night|sun\s*night/.test(t)) return "SNF";
  if (/\bmnf\b|monday\s*night|mon\s*night/.test(t)) return "MNF";
  if (/saturday\s*night|sat\s*night/.test(t)) return "Sat";
  if (/friday\s*night|fri\s*night/.test(t)) return "Fri";
  if (/\bprime/.test(t)) return "SNF";
  return null;
}

function pickShowdownSlates(groups: DkGroup[]): SlateOption[] {
  const now = Date.now();
  const weekMs = 8 * 24 * 60 * 60 * 1000;
  const out: SlateOption[] = [];
  for (const g of groups) {
    if (g.contestType?.contestTypeId !== 96) continue;
    if (g.sportId && g.sportId !== 1) continue;
    const nfl = (g.leagues ?? []).some((l) => l.leagueAbbreviation === "NFL") || !g.leagues?.length;
    if (!nfl) continue;
    const start = Date.parse(g.minStartTime);
    if (!Number.isFinite(start) || start < now - 12 * 60 * 60 * 1000 || start > now + weekMs) continue;
    if (g.draftGroupState && !/upcoming|live/i.test(g.draftGroupState)) continue;
    const games = g.games?.length ?? 0;
    if (games > 1) continue;
    const name = showdownGameName(g);
    const blob = `${g.startTimeSuffix ?? ""} ${name}`;
    const window = primetimeWindow(g.minStartTime, blob);
    if (!window) continue;
    const tag = window === "Sat" ? "Sat night" : window === "Fri" ? "Fri night" : window;
    out.push({
      draftGroupId: g.draftGroupId,
      label: `Showdown · ${tag} · ${name}`,
      suffix: `${tag} · ${name}`,
      startTime: g.minStartTime,
      gameCount: games || 1,
      format: "showdown",
    });
  }
  out.sort((a, b) => a.startTime.localeCompare(b.startTime));
  const seen = new Set<number>();
  return out.filter((s) => {
    if (seen.has(s.draftGroupId)) return false;
    seen.add(s.draftGroupId);
    return true;
  });
}

function espnIndex(rows: EspnPlayerRow[]) {
  const byName = new Map<string, EspnPlayerRow["player"]>();
  const byNameTeam = new Map<string, EspnPlayerRow["player"]>();
  const dstByAbbr = new Map<string, EspnPlayerRow["player"]>();
  for (const row of rows) {
    const p = row.player;
    if (!p) continue;
    const pos = ESPN_POS[p.defaultPositionId];
    const team = ESPN_TEAMS[p.proTeamId];
    const n = normalizeName(p.fullName);
    byName.set(n, p);
    if (team) byNameTeam.set(`${n}|${team.abbr}|${pos ?? ""}`, p);
    if (pos === "DST" && team) {
      dstByAbbr.set(team.abbr, p);
      byName.set(normalizeName(team.nick), p);
      byName.set(normalizeName(`${team.nick}dst`), p);
    }
  }
  return { byName, byNameTeam, dstByAbbr };
}

function espnStats(player: NonNullable<EspnPlayerRow["player"]>, season: number, week: number) {
  const stats = player.stats ?? [];
  const actual = stats.find(
    (s) => s.statSourceId === 0 && s.seasonId === season - 1 && s.scoringPeriodId === 0,
  );
  const proj =
    stats.find((s) => s.statSourceId === 1 && s.seasonId === season && s.scoringPeriodId === week) ??
    stats.find((s) => s.statSourceId === 1 && s.scoringPeriodId === week);
  const seasonStats = actual ? seasonFromEspn(actual.stats, actual.appliedTotal ?? 0) : null;
  let weekProj: WeekProjection | null = null;
  if (proj?.stats) {
    weekProj = weekFromEspn(proj.stats);
    weekProj.espnPpr = proj.appliedTotal ?? 0;
  } else if (proj?.appliedTotal && proj.appliedTotal > 1) {
    weekProj = emptyWeek();
    weekProj.espnPpr = proj.appliedTotal;
  }
  const lastWeek =
    week >= 2
      ? stats.find((s) => s.statSourceId === 0 && s.seasonId === season && s.scoringPeriodId === week - 1)
      : undefined;
  const lastWeekPts = lastWeek?.appliedTotal ?? 0;
  let weekActual: WeekProjection | null = null;
  const box = stats.find((s) => s.statSourceId === 0 && s.seasonId === season && s.scoringPeriodId === week);
  if (box?.stats) {
    weekActual = weekFromEspn(box.stats);
    weekActual.espnPpr = box.appliedTotal ?? 0;
  } else if (box?.appliedTotal != null && box.appliedTotal > 0) {
    weekActual = emptyWeek();
    weekActual.espnPpr = box.appliedTotal;
  }
  return { seasonStats, weekProj, lastWeekPts, weekActual };
}

type SlateDataOk = Extract<SlateResponse, { ok: true }>;

const EMPTY_SITE = { byName: new Map(), byNameTeam: new Map(), ok: false, players: 0 };

const EMPTY_PROPS: Awaited<ReturnType<typeof loadProps>> = {
  byName: new Map(),
  byNameTeam: new Map(),
  games: [],
  vegasPlayers: 0,
  dkPlayers: 0,
  fdGames: 0,
  fdPlayers: 0,
  byEspnId: new Map(),
};

function compactSlate(value: SlateDataOk): SlateDataOk {
  const raw = JSON.stringify(value, (_k, v) => {
    if (typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)) return Math.round(v * 10) / 10;
    return v;
  });
  const next = JSON.parse(raw) as SlateDataOk;
  next.players = next.players.map((p) => ({ ...p, defense: null }));
  return next;
}

export function peekSlate(draftGroupId?: number): SlateResponse | undefined {
  const cache = getCache();
  const hit = cache.get(`slate:${CACHE_VER}:${draftGroupId ?? "auto"}`) ?? cache.get(`slate:${CACHE_VER}:auto`);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit.value;
  return undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function loadSlate(draftGroupId?: number, force?: boolean): Promise<SlateResponse> {
  const cache = getCache();
  const cacheKey = `slate:${CACHE_VER}:${draftGroupId ?? "auto"}`;
  const hit = cache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < REFRESH_MS) return hit.value;
  if (!force) {
    try {
      const { readTmpCache } = await import("./slate-cache.server");
      const disk = readTmpCache(cacheKey, REFRESH_MS);
      if (disk) {
        cache.set(cacheKey, disk);
        return disk.value;
      }
    } catch {
      /* client / no fs */
    }
  }

  const onVercel = Boolean(process.env.VERCEL);
  const extrasMs = onVercel ? 22000 : 32000;
  const espnMs = onVercel ? 6000 : 20000;
  const siteMs = onVercel ? 6500 : 18000;

  try {
    const [state, groupsJson] = await Promise.all([
      getJson<{ week: number; season: string; season_type: string }>("https://api.sleeper.app/v1/state/nfl"),
      getJson<{ draftGroups: DkGroup[] }>("https://api.draftkings.com/draftgroups/v1/?sport=NFL"),
    ]);

    const week = Number(state.week) || 1;
    const season = Number(state.season) || 2026;
    const classic = pickClassicSlates(groupsJson.draftGroups ?? []);
    const showdowns = pickShowdownSlates(groupsJson.draftGroups ?? []);
    const slates = [...classic, ...showdowns];
    if (!slates.length) {
      const err: SlateResponse = { ok: false, error: "No DraftKings Classic or Showdown slates are posted yet." };
      cache.set(cacheKey, { at: Date.now(), value: err });
      return err;
    }

    const selected =
      slates.find((s) => s.draftGroupId === draftGroupId) ??
      slates.find((s) => s.format === "classic" && /wed-mon/i.test(s.suffix)) ??
      slates.find((s) => s.format === "classic") ??
      slates[0]!;
    const format: SlateFormat = selected.format ?? "classic";

    const yahooP = withTimeout(loadYahoo(), siteMs, EMPTY_SITE);
    const cbsP = withTimeout(loadCbs(season, week), siteMs, EMPTY_SITE);
    const fpP = withTimeout(loadFantasyProsEcr(week), siteMs, EMPTY_SITE);
    const sleeperP = withTimeout(loadSleeper(season, week), siteMs, EMPTY_SITE);
    const propsP = withTimeout(loadProps(), extrasMs, EMPTY_PROPS);

    const espnFilter = JSON.stringify({
      players: {
        limit: 400,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        filterStatsForTopScoringPeriodIds: {
          value: 2,
          additionalValue: [`00${season - 1}`, `11${season}${week}`],
        },
      },
    });

    const [draftablesJson, espnJson, yahooIdx, cbsIdx, fpIdx, sleeperIdx, propsBundle] = await Promise.all([
      getJson<{ draftables: DkDraftable[]; competitions: DkCompetition[] }>(
        `https://api.draftkings.com/draftgroups/v1/draftgroups/${selected.draftGroupId}/draftables`,
      ),
      settled(
        getJson<{ players: EspnPlayerRow[] }>(
          `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=${week}`,
          { headers: { "x-fantasy-filter": espnFilter } },
          espnMs,
        ),
      ),
      yahooP,
      cbsP,
      fpP,
      sleeperP,
      propsP,
    ]);

    const idx = espnIndex(espnJson?.players ?? []);
    const games: Game[] = (draftablesJson.competitions ?? []).map((c) => {
      const broadcast = c.competitionAttributes?.find((a) => a.typeId === 32)?.value ?? null;
      return {
        id: c.competitionId,
        name: c.name,
        startTime: c.startTime,
        venue: c.venue ?? "",
        homeAbbr: c.homeTeam?.abbreviation ?? "",
        awayAbbr: c.awayTeam?.abbreviation ?? "",
        homeName: c.homeTeam?.teamName ?? "",
        awayName: c.awayTeam?.teamName ?? "",
        weather: c.weather?.icon ?? null,
        isDome: Boolean(c.weather?.isDome),
        broadcast,
        total: null,
        spread: null,
        homeImplied: null,
        awayImplied: null,
      };
    });
    games.sort((a, b) => a.startTime.localeCompare(b.startTime));
    applyGameLines(games, propsBundle.games);

    const dstSeason = new Map<string, ReturnType<typeof seasonFromEspn>>();
    for (const [abbr, ep] of idx.dstByAbbr) {
      if (!ep) continue;
      const { seasonStats } = espnStats(ep, season, week);
      if (seasonStats) dstSeason.set(abbr, seasonStats);
    }

    const unique = new Map<string, DkDraftable>();
    const allowed = format === "showdown" ? SHOWDOWN_POSITIONS : POSITIONS;
    for (const d of draftablesJson.draftables ?? []) {
      if (!allowed.includes(d.position as Position)) continue;
      if (format === "classic") {
        if (d.rosterSlotId === 70) continue;
        if (!unique.has(String(d.playerId))) unique.set(String(d.playerId), d);
        continue;
      }
      if (d.rosterSlotId === 70) continue;
      const role = d.rosterSlotId === 511 ? "CPT" : "FLEX";
      unique.set(`${d.playerId}:${role}`, d);
    }

    const players: Player[] = [];
    for (const d of unique.values()) {
      const position = d.position as Position;
      const showdownRole = format === "showdown" ? (d.rosterSlotId === 511 ? "CPT" : "FLEX") : null;
      const team = d.teamAbbreviation;
      const gameName = d.competition?.name ?? "";
      const { opp, home } = opponentOf(gameName, team);
      const fppgAttr = d.draftStatAttributes?.find((a) => a.id === 90);
      const oprkAttr = d.draftStatAttributes?.find((a) => a.id === -2);
      const fppg = Number.parseFloat(fppgAttr?.value ?? "0") || 0;
      const oppRank = Number.parseInt(oprkAttr?.sortValue ?? oprkAttr?.value ?? "16", 10) || 16;
      const oppQuality = parseQuality(oprkAttr?.quality);
      const bye = d.playerAttributes?.find((a) => a.name === "ByeWeek");

      const n = normalizeName(d.displayName);
      const ep =
        (position === "DST" ? idx.dstByAbbr.get(team) : undefined) ??
        idx.byNameTeam.get(`${n}|${team}|${position}`) ??
        idx.byName.get(n);

      const parsed = ep ? espnStats(ep, season, week) : { seasonStats: null, weekProj: null, lastWeekPts: 0, weekActual: null };
      let weekProj = parsed.weekProj;
      if (weekProj) weekProj.dk = dkFromWeek(weekProj, position);

      const yahoo = lookupSite(yahooIdx, d.displayName, team) ?? (position === "DST" ? lookupSite(yahooIdx, `${team} DST`, team) : undefined);
      const cbs = lookupSite(cbsIdx, d.displayName, team) ?? (position === "DST" ? lookupSite(cbsIdx, `${team} DST`, team) : undefined);
      const fp = lookupSite(fpIdx, d.displayName, team) ?? (position === "DST" ? lookupSite(fpIdx, `${team} DST`, team) : undefined);
      const sleeper = lookupSite(sleeperIdx, d.displayName, team) ?? (position === "DST" ? lookupSite(sleeperIdx, `${team} DST`, team) : undefined);
      const props = lookupProps(propsBundle, d.displayName, team, ep?.id);

      const sources: SourceProjection[] = [];
      if (cbs) sources.push({ id: cbs.id, label: cbs.label, points: cbs.points, kind: "site" });
      if (fp) sources.push({ id: fp.id, label: fp.label, points: fp.points, kind: "site" });
      if (sleeper) sources.push({ id: sleeper.id, label: sleeper.label, points: sleeper.points, kind: "site" });
      if (yahoo) sources.push({ id: yahoo.id, label: yahoo.label, points: yahoo.points, kind: "site" });

      if (cbs?.week) {
        weekProj = fillWeek(weekProj ?? emptyWeek(), cbs.week);
        if (!weekProj.dk) weekProj.dk = cbs.points;
      } else if (sleeper?.week) {
        weekProj = fillWeek(weekProj ?? emptyWeek(), sleeper.week);
        if (!weekProj.dk) weekProj.dk = sleeper.points;
      }
      if (props?.line && position !== "DST") {
        weekProj = fillWeek(weekProj ?? emptyWeek(), {
          passYds: props.line.passYds,
          passTd: props.line.passTd,
          interceptions: props.line.interceptions,
          rushYds: props.line.rushYds,
          rushTd: props.line.rushTd,
          receptions: props.line.receptions,
          recYds: props.line.recYds,
          recTd: props.line.recTd,
        });
      }
      if (weekProj) weekProj.dk = Math.max(weekProj.dk, dkFromWeek(weekProj, position));

      let propProjection: number | null = null;
      let propComplete = false;
      if (props && position !== "DST") {
        const scored = dkFromProps(props.line, position);
        if (scored.points > 1) {
          propProjection = round1(scored.points);
          propComplete = scored.complete;
          sources.unshift({
            id: "vegas",
            label: [...props.books].join(" + ") || "Props",
            points: propProjection,
            kind: "props",
          });
        }
      }

      const siteRows = sources.filter((s) => s.kind === "site");
      const consensusProjection = robustSiteConsensus(siteRows);

      const injury = ep?.injuryStatus && ep.injuryStatus !== "ACTIVE" ? ep.injuryStatus : null;
      const dkStatus = d.status && d.status !== "None" ? d.status : "Active";
      const sidelined = isSidelined(injury, dkStatus);
      const questionable = isQuestionable(injury, dkStatus);

      const mult = matchupMultiplier(oppRank, oppQuality);
      let projection = 0;
      let rankingMethod: RankingMethod = "fppg";
      if (sidelined) {
        rankingMethod = "fppg";
        projection = 0;
      } else if (propProjection != null) {
        rankingMethod = "props";
        const books = props?.books ? [...props.books].length : 0;
        const w = propsBlendWeight(propComplete, books);
        if (consensusProjection != null) {
          projection = w * propProjection + (1 - w) * consensusProjection;
          if (w < 0.75) rankingMethod = "consensus";
        } else {
          projection = propComplete ? propProjection : propProjection * 0.88 + (fppg * mult) * 0.12;
        }
        if (!sidelined && week >= 2 && parsed.lastWeekPts >= 2 && w < 0.9) {
          const rec = parsed.lastWeekPts * (position === "QB" ? 0.88 : 0.94);
          projection = 0.86 * projection + 0.14 * rec;
        }
      } else if (consensusProjection != null) {
        rankingMethod = siteRows.length >= 2 ? "consensus" : "consensus";
        projection = consensusProjection;
      } else {
        projection = fppg * mult * (home ? 1.02 : 1);
      }
      if (!sidelined && questionable) projection *= Q_HAIRCUT;
      if (!sidelined && week >= 2 && parsed.lastWeekPts >= 2 && rankingMethod !== "props") {
        const rec = parsed.lastWeekPts * (position === "QB" ? 0.88 : 0.94);
        const rw = rankingMethod === "consensus" ? 0.16 : 0.26;
        projection = (1 - rw) * projection + rw * rec;
      }
      projection = Math.max(0, projection);
      if (showdownRole === "CPT") projection *= 1.5;

      const defStats = dstSeason.get(opp);
      const defense: DefenseProfile = {
        abbr: opp,
        name: opp,
        rankVsPos: oppRank,
        quality: oppQuality,
        sacks: defStats?.sacks ?? 0,
        defInt: defStats?.defInt ?? 0,
        fumRec: defStats?.fumRec ?? 0,
        defTd: defStats?.defTd ?? 0,
        ptsAllowed: defStats?.ptsAllowed ?? 0,
        ydsAllowed: defStats?.ydsAllowed ?? 0,
        dstPpg: defStats?.fantasyPpg ?? 0,
      };

      const value = d.salary > 0 ? projection / (d.salary / 1000) : 0;
      let actualDk: number | null = null;
      if (parsed.weekActual) {
        const box = parsed.weekActual;
        box.dk = dkFromWeek(box, position);
        actualDk = round1(box.dk > 0.15 ? box.dk : box.espnPpr > 0 ? box.espnPpr : box.dk);
      }

      players.push({
        id: showdownRole ? `${d.playerId}:${showdownRole}` : String(d.playerId),
        dkId: d.playerDkId,
        name: d.displayName,
        firstName: d.firstName,
        lastName: d.lastName,
        shortName: d.shortName,
        position,
        team,
        opponent: opp,
        home,
        gameName,
        startTime: d.competition?.startTime ?? "",
        salary: d.salary,
        fppg,
        oppRank,
        oppQuality,
        projection: round1(projection),
        value: round2(value),
        image: d.playerImage160 || null,
        status: dkStatus,
        injury,
        byeWeek: bye ? Number(bye.value) : null,
        stats: parsed.seasonStats,
        week: weekProj,
        defense,
        valueRank: 0,
        isValuePlay: false,
        isStarter: !sidelined,
        sources,
        rankingMethod,
        propProjection,
        consensusProjection: consensusProjection != null ? round1(consensusProjection) : null,
        props: props?.line ?? null,
        itFactor: false,
        itFactorScore: 0,
        itFactorWhy: null,
        anytimeTd: props?.line.anytimeTd ?? null,
        cheapImpact: false,
        cheapImpactWhy: null,
        showdownRole,
        ownership: null,
        ownershipSource: null,
        actualDk,
      });
    }

    if (format === "showdown" && !players.some((p) => p.showdownRole === "CPT")) {
      const extras = players
        .filter((p) => p.showdownRole === "FLEX")
        .map((p) => ({
          ...p,
          id: `${p.id.replace(/:FLEX$/i, "")}:CPT`,
          salary: Math.round((p.salary * 1.5) / 100) * 100,
          projection: round1(p.projection * 1.5),
          value: p.salary > 0 ? round2((p.projection * 1.5) / ((p.salary * 1.5) / 1000)) : 0,
          showdownRole: "CPT" as const,
        }));
      players.push(...extras);
    }

    const byTeamPos = new Map<string, Player[]>();
    for (const p of players) {
      const key = `${p.team}|${p.position}`;
      const arr = byTeamPos.get(key) ?? [];
      arr.push(p);
      byTeamPos.set(key, arr);
    }
    for (const group of byTeamPos.values()) {
      const maxSal = Math.max(...group.map((x) => x.salary));
      for (const p of group) {
        if (p.position === "QB") p.isStarter = p.salary >= maxSal - 300;
        else if (p.position === "DST") p.isStarter = true;
        else p.isStarter = p.salary >= maxSal * 0.55 || p.salary >= 4500;
      }
    }
    for (const p of players) {
      if (isSidelined(p.injury, p.status)) p.isStarter = false;
    }

    const dvp = {} as Record<Position, DefenseProfile[]>;
    for (const pos of POSITIONS) {
      const seen = new Map<string, DefenseProfile>();
      for (const p of players) {
        if (p.position !== pos) continue;
        if (!seen.has(p.opponent)) seen.set(p.opponent, p.defense!);
      }
      dvp[pos] = [...seen.values()].sort((a, b) => b.rankVsPos - a.rankVsPos);
    }
    dvp.K = [];

    for (const pos of POSITIONS) {
      const floor = pos === "DST" ? 4 : pos === "TE" ? 5.5 : 6;
      const group = players.filter(
        (p) =>
          p.position === pos &&
          p.isStarter &&
          p.showdownRole !== "CPT" &&
          !isSidelined(p.injury, p.status) &&
          (pos === "DST" || p.salary >= 3000) &&
          p.projection >= floor,
      );
      const sorted = [...group].sort((a, b) => b.value - a.value || b.projection - a.projection);
      sorted.forEach((p, i) => {
        p.valueRank = i + 1;
      });
      if (!sorted.length) continue;
      const median = sorted[Math.floor(sorted.length / 2)]!.value;
      const cap = Math.max(3, Math.ceil(sorted.length * 0.18));
      for (const p of sorted.slice(0, cap)) {
        if (p.valueRank <= 3 || p.value >= median + 0.15) p.isValuePlay = true;
      }
    }

    markItFactor(players, games);
    markCheapImpact(players);
    markOwnership(players);
    players.sort((a, b) => b.projection - a.projection || b.salary - a.salary);

    const trimmed = players.filter((p) => {
      if (format === "showdown") return p.salary > 0;
      if (p.position === "DST") return true;
      if (p.isValuePlay || p.itFactor || p.cheapImpact) return true;
      if (p.salary >= 4500) return true;
      if (p.projection >= 6) return true;
      if (p.fppg >= 8) return true;
      return false;
    });

    const fetchedAt = new Date().toISOString();
    const sources: DataSourceInfo[] = [
      { id: "draftkings", label: "DraftKings", ok: trimmed.length > 0, players: trimmed.length },
      { id: "vegas", label: "Vegas props", ok: propsBundle.vegasPlayers > 0, players: propsBundle.vegasPlayers },
      { id: "fanduel", label: "FanDuel props", ok: propsBundle.fdPlayers > 0 || propsBundle.fdGames > 0, players: propsBundle.fdPlayers || propsBundle.fdGames },
      { id: "dkprops", label: "DraftKings props", ok: propsBundle.dkPlayers > 0, players: propsBundle.dkPlayers },
      { id: "yahoo", label: "Yahoo", ok: yahooIdx.ok, players: yahooIdx.players },
      { id: "cbs", label: "CBS Sports", ok: cbsIdx.ok, players: cbsIdx.players },
      { id: "fantasypros", label: "FantasyPros + X", ok: fpIdx.ok, players: fpIdx.players },
      { id: "rotowire", label: "RotoWire", ok: sleeperIdx.ok, players: sleeperIdx.players },
      { id: "own", label: "Own% model", ok: trimmed.some((p) => p.ownership != null), players: trimmed.filter((p) => p.ownership != null).length },
    ];

    const value = compactSlate({
      ok: true,
      week,
      season,
      seasonType: state.season_type,
      fetchedAt,
      nextRefreshAt: new Date(Date.parse(fetchedAt) + REFRESH_MS).toISOString(),
      draftGroupId: selected.draftGroupId,
      salaryCap: SALARY_CAP,
      slateLabel: selected.label,
      format,
      slates,
      games,
      players: trimmed,
      dvp,
      sources,
    });
    cache.set(cacheKey, { at: Date.now(), value });
    cache.set(`slate:${CACHE_VER}:${selected.draftGroupId}`, { at: Date.now(), value });
    try {
      const { writeTmpCache } = await import("./slate-cache.server");
      writeTmpCache(cacheKey, value);
      writeTmpCache(`slate:${CACHE_VER}:${selected.draftGroupId}`, value);
    } catch {
      /* client / no fs */
    }
    return value;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load the weekly slate.";
    const value: SlateResponse = { ok: false, error: message };
    return value;
  }
}

export const getSlate = createServerFn({ method: "GET" })
  .validator((input: { draftGroupId?: number; force?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }) => loadSlate(data.draftGroupId, data.force));

