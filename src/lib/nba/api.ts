import { applyContractYears, loadNbaContractYears } from "@/lib/contracts";
import { createServerFn } from "@tanstack/react-start";
import { normalizeName } from "@/lib/utils";
import { loadDkDraftables, loadDkGroups, type DkGroup } from "@/lib/dfs/dk";
import { getJson, settled } from "@/lib/dfs/http";
import type { Game } from "@/lib/dfs/types";
import { ESPN_NBA_POS, ESPN_NBA_TEAMS, NBA_CAP, NBA_POS, NBA_REFRESH_MS } from "./constants";
import { loadNbaFd, type NbaProp } from "./lines";
import { markNbaIt } from "./it";
import { markNbaBargain } from "./sleeper";
import { dkFromPerGame, isSidelined, matchupMul, matchupQuality, round1, round2 } from "./scoring";
import type { NbaBox, NbaPlayer, NbaPos, NbaSlateData, NbaSlateOption, NbaSlateResponse } from "./types";

const CACHE_VER = 4;
type Hit = { at: number; value: NbaSlateResponse };
const g = globalThis as typeof globalThis & { __snapNbaCache?: Map<string, Hit> };
function cache() {
  if (!g.__snapNbaCache) g.__snapNbaCache = new Map();
  return g.__snapNbaCache;
}

type EspnRow = {
  player?: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    defaultPositionId?: number;
    proTeamId?: number;
    injuryStatus?: string;
    stats?: {
      scoringPeriodId: number;
      seasonId: number;
      statSourceId: number;
      statSplitTypeId: number;
      stats?: Record<string, number>;
    }[];
  };
};

function n(stats: Record<string, number> | undefined, id: number): number {
  const v = stats?.[String(id)];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function boxFromStats(stats: Record<string, number> | undefined, perGame: boolean): NbaBox {
  const gp = Math.max(1, n(stats, 42) || 1);
  const div = perGame ? 1 : gp;
  const pts = n(stats, 29) || n(stats, 0) / div;
  const threes = n(stats, 33) || n(stats, 1) / div;
  const reb = n(stats, 30) || n(stats, 6) / div;
  const ast = n(stats, 26) || n(stats, 3) / div;
  const stl = n(stats, 31) || n(stats, 2) / div;
  const blk = n(stats, 34) || 0;
  const to = n(stats, 32) || n(stats, 11) / div;
  const min = n(stats, 28) || n(stats, 40) / div;
  const dd = n(stats, 37) / gp;
  const td = n(stats, 38) / gp;
  return { pts, threes, reb, ast, stl, blk, to, min, gp, dd, td };
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
  return { opp: "FA", home: true };
}

function isNbaClassic(group: DkGroup): boolean {
  const leagues = (group.leagues ?? []).map((l) => (l.leagueAbbreviation || "").toUpperCase());
  if (leagues.includes("WNBA")) return false;
  const sport = (group.contestType?.sport || "").toUpperCase();
  const nba = group.sportId === 4 || sport === "NBA" || leagues.includes("NBA");
  if (!nba) return false;
  const suffix = (group.startTimeSuffix || "").toLowerCase();
  if (/wnba|sit\s*&?\s*go|best ball|points|snake|tournament/.test(suffix)) return false;
  const ct = group.contestType?.contestTypeId;
  if (ct === 170 || ct === 348 || ct === 81 || ct === 145 || ct === 188 || ct === 284 || ct === 96 || ct === 37) return false;
  if (ct === 70 || ct === 21 || ct === 2) return true;
  const nGames = Array.isArray(group.games) ? group.games.length : 0;
  return nGames >= 2;
}

function toOption(group: DkGroup): NbaSlateOption {
  const nGames = Array.isArray(group.games) ? group.games.length : 0;
  const suffix = (group.startTimeSuffix || "").replace(/[()]/g, "").trim() || "Main";
  return {
    draftGroupId: group.draftGroupId,
    label: suffix,
    suffix,
    startTime: group.minStartTime,
    gameCount: nGames,
    format: "classic",
  };
}

function parsePos(raw: string, espnPosId?: number): NbaPos | null {
  const first = raw.toUpperCase().split("/")[0]?.trim() ?? "";
  if (NBA_POS.includes(first as NbaPos)) return first as NbaPos;
  if (first === "G") return "PG";
  if (first === "F") return "SF";
  if (espnPosId && ESPN_NBA_POS[espnPosId]) return ESPN_NBA_POS[espnPosId]!;
  return null;
}

function markValues(players: NbaPlayer[]) {
  for (const pos of NBA_POS) {
    const pool = players.filter((p) => p.position === pos && !isSidelined(p.injury, p.status) && p.salary >= 3000);
    const sorted = [...pool].sort((a, b) => b.value - a.value);
    const cap = Math.max(3, Math.ceil(sorted.length * 0.18));
    sorted.forEach((p, i) => {
      p.valueRank = i + 1;
      p.isValuePlay = i < cap && p.value >= 4.2;
    });
  }
}

function mergeFdGames(games: Game[], extra: Partial<Game>[], allowAdd: boolean) {
  const byKey = new Map(games.map((g) => [`${g.awayAbbr}@${g.homeAbbr}`, g]));
  for (const e of extra) {
    if (!e.homeAbbr || !e.awayAbbr) continue;
    const k = `${e.awayAbbr}@${e.homeAbbr}`;
    const cur = byKey.get(k);
    if (cur) {
      if (e.total != null) cur.total = e.total;
      if (e.spread != null) cur.spread = e.spread;
      if (e.homeImplied != null) cur.homeImplied = e.homeImplied;
      if (e.awayImplied != null) cur.awayImplied = e.awayImplied;
      if (!cur.startTime && e.startTime) cur.startTime = e.startTime;
      continue;
    }
    if (!allowAdd || !e.name) continue;
    const next: Game = {
      id: e.id || Date.parse(e.startTime || "") || games.length + 1,
      name: e.name,
      startTime: e.startTime || "",
      venue: "",
      homeAbbr: e.homeAbbr,
      awayAbbr: e.awayAbbr,
      homeName: e.homeName || e.homeAbbr,
      awayName: e.awayName || e.awayAbbr,
      weather: null,
      isDome: true,
      broadcast: null,
      total: e.total ?? null,
      spread: e.spread ?? null,
      homeImplied: e.homeImplied ?? null,
      awayImplied: e.awayImplied ?? null,
      homeScore: null,
      awayScore: null,
    };
    games.push(next);
    byKey.set(k, next);
  }
}

function keepBoardGames(games: Game[]): Game[] {
  const now = Date.now();
  const live = games
    .filter((g) => {
      const t = Date.parse(g.startTime);
      if (!Number.isFinite(t)) return true;
      return t > now - 3.5 * 3600 * 1000;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (!live.length) return [];
  const first = Date.parse(live[0]!.startTime);
  const cluster = Number.isFinite(first)
    ? live.filter((g) => {
        const t = Date.parse(g.startTime);
        return !Number.isFinite(t) || t <= first + 4 * 24 * 3600 * 1000;
      })
    : live;
  return cluster.slice(0, 8);
}

function empty(notice: string, games: Game[], fdOk: boolean): NbaSlateData {
  return {
    ok: true,
    sport: "NBA",
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + NBA_REFRESH_MS).toISOString(),
    draftGroupId: 0,
    salaryCap: NBA_CAP,
    slateLabel: "NBA Classic",
    format: "classic",
    slates: [],
    games: keepBoardGames(games),
    players: [],
    sources: [
      { id: "dk", label: "DraftKings", ok: false, players: 0 },
      { id: "fd", label: "FanDuel", ok: fdOk, players: 0 },
    ],
    notice,
  };
}

export async function loadNbaSlate(draftGroupId?: number, force?: boolean): Promise<NbaSlateResponse> {
  const store = cache();
  const cacheKey = `nba:${CACHE_VER}:${draftGroupId ?? "auto"}`;
  const hit = store.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < NBA_REFRESH_MS) return hit.value;

  try {
    const [groups, fd] = await Promise.all([loadDkGroups("NBA"), settled(loadNbaFd())]);
    const classic = (groups ?? []).filter(isNbaClassic).map(toOption);
    classic.sort((a, b) => a.startTime.localeCompare(b.startTime) || b.gameCount - a.gameCount);

    if (!classic.length) {
      const games: Game[] = [];
      mergeFdGames(games, fd?.games ?? [], true);
      const value = empty(
        "NBA Classic isn’t posted on DraftKings yet. Switch to NFL or check back on gameday.",
        games,
        Boolean(fd?.games.length),
      );
      store.set(cacheKey, { at: Date.now(), value });
      return value;
    }

    const selected = classic.find((s) => s.draftGroupId === draftGroupId) ?? classic[0]!;
    const espnFilter = JSON.stringify({
      players: { limit: 400, sortPercOwned: { sortPriority: 1, sortAsc: false } },
    });
    const [draftablesJson, espn, cyIdx] = await Promise.all([
      loadDkDraftables(selected.draftGroupId),
      settled(
        getJson<{ players: EspnRow[] }>(
          "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2026/segments/0/leaguedefaults/1?view=kona_player_info",
          { headers: { "x-fantasy-filter": espnFilter } },
          12000,
        ),
      ),
      settled(loadNbaContractYears()),
    ]);

    const espnByName = new Map<string, EspnRow["player"]>();
    for (const row of espn?.players ?? []) {
      const p = row.player;
      if (!p?.fullName) continue;
      espnByName.set(normalizeName(p.fullName), p);
    }

    const games: Game[] = (draftablesJson.competitions ?? []).map((c) => ({
      id: c.competitionId,
      name: c.name,
      startTime: c.startTime,
      venue: c.venue ?? "",
      homeAbbr: c.homeTeam?.abbreviation ?? "",
      awayAbbr: c.awayTeam?.abbreviation ?? "",
      homeName: c.homeTeam?.teamName ?? "",
      awayName: c.awayTeam?.teamName ?? "",
      weather: c.weather?.icon ?? null,
      isDome: true,
      broadcast: c.competitionAttributes?.find((a) => a.typeId === 32)?.value ?? null,
      total: null,
      spread: null,
      homeImplied: null,
      awayImplied: null,
      homeScore: null,
      awayScore: null,
    }));
    games.sort((a, b) => a.startTime.localeCompare(b.startTime));
    mergeFdGames(games, fd?.games ?? [], false);

    const unique = new Map<string, (typeof draftablesJson.draftables)[number]>();
    for (const d of draftablesJson.draftables ?? []) {
      if (!unique.has(String(d.playerId))) unique.set(String(d.playerId), d);
    }

    const propIdx = new Map<string, NbaProp[]>();
    for (const p of fd?.props ?? []) {
      const k = normalizeName(p.name);
      const list = propIdx.get(k);
      if (list) list.push(p);
      else propIdx.set(k, [p]);
    }

    const players: NbaPlayer[] = [];
    for (const d of unique.values()) {
      const ep = espnByName.get(normalizeName(d.displayName));
      const pos = parsePos(d.position, ep?.defaultPositionId);
      if (!pos) continue;
      const salary = Number(d.salary) || 0;
      if (salary <= 0) continue;
      const team = d.teamAbbreviation || (ep?.proTeamId ? ESPN_NBA_TEAMS[ep.proTeamId] : "") || "FA";
      const game = d.competition;
      const { opp, home } = opponentOf(game?.name ?? "", team);
      const statsList = ep?.stats ?? [];
      const projStats = statsList.find((s) => s.statSourceId === 1 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0)?.stats;
      const seasonStats = statsList.find((s) => s.statSourceId === 0 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0)?.stats;
      const box = projStats && Object.keys(projStats).length ? boxFromStats(projStats, true) : seasonStats ? boxFromStats(seasonStats, false) : null;
      const oppAttr = d.draftStatAttributes?.find((a) => a.id === -2);
      const fppgAttr = d.draftStatAttributes?.find((a) => a.id === 90);
      const oppRank = Number(oppAttr?.sortValue ?? oppAttr?.value) || 16;
      const fppg = Number(fppgAttr?.value) || (box ? dkFromPerGame(box) : 0);
      let proj = box ? dkFromPerGame(box) : fppg;
      proj *= matchupMul(oppRank);
      const inj =
        (d.newsStatus && d.newsStatus !== "None" ? d.newsStatus : null) ||
        (ep?.injuryStatus && ep.injuryStatus !== "ACTIVE" ? ep.injuryStatus : null);
      if (inj && /out|ir|doubt/i.test(inj)) proj = 0;
      else if (inj && /question/i.test(inj)) proj *= 0.9;
      const propsRows = propIdx.get(normalizeName(d.displayName));
      const props = propsRows?.length
        ? {
            pts: propsRows.find((x) => x.kind === "pts")?.line,
            reb: propsRows.find((x) => x.kind === "reb")?.line,
            ast: propsRows.find((x) => x.kind === "ast")?.line,
            threes: propsRows.find((x) => x.kind === "threes")?.line,
            books: [...new Set(propsRows.flatMap((x) => x.books))],
          }
        : null;
      if (props?.pts && box) {
        const fromProp =
          props.pts +
          0.5 * (props.threes ?? box.threes) +
          1.25 * (props.reb ?? box.reb) +
          1.5 * (props.ast ?? box.ast) +
          2 * box.stl +
          2 * box.blk -
          0.5 * box.to;
        proj = proj * 0.35 + fromProp * 0.65;
      }
      players.push({
        id: String(d.playerId),
        dkId: d.playerDkId || d.playerId,
        name: d.displayName,
        firstName: d.firstName,
        lastName: d.lastName,
        position: pos,
        team,
        opponent: opp,
        home,
        gameName: game?.name ?? "",
        startTime: game?.startTime ?? "",
        salary,
        fppg: round1(fppg),
        oppRank,
        oppQuality: matchupQuality(oppRank),
        projection: round1(proj),
        value: round2(proj / Math.max(1, salary / 1000)),
        valueRank: 99,
        isValuePlay: false,
        isStarter: salary >= 4000 || proj >= 22,
        image: d.playerImage160 ?? null,
        status: d.status ?? "None",
        injury: inj,
        rankingMethod: props?.pts ? "props" : box ? "consensus" : "fppg",
        itFactor: false,
        itFactorWhy: null,
        cheapImpact: false,
        cheapImpactWhy: null,
        contractYear: null,
        ownership: null,
        box,
        props,
      });
    }

    players.sort((a, b) => b.projection - a.projection);
    markValues(players);
    markNbaBargain(players);
    markNbaIt(players, games, "all");
    applyContractYears(players, cyIdx);

    const value: NbaSlateData = {
      ok: true,
      sport: "NBA",
      fetchedAt: new Date().toISOString(),
      nextRefreshAt: new Date(Date.now() + NBA_REFRESH_MS).toISOString(),
      draftGroupId: selected.draftGroupId,
      salaryCap: NBA_CAP,
      slateLabel: selected.suffix || "Main",
      format: "classic",
      slates: classic,
      games,
      players,
      sources: [
        { id: "dk", label: "DraftKings", ok: true, players: players.length },
        { id: "espn", label: "ESPN", ok: Boolean(espn?.players?.length), players: espn?.players?.length ?? 0 },
        { id: "fd", label: "FanDuel", ok: Boolean(fd?.games?.length), players: fd?.props.length ?? 0 },
      ],
      notice: null,
    };
    store.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "NBA slate failed";
    const value: NbaSlateResponse = { ok: false, sport: "NBA", error: msg };
    store.set(cacheKey, { at: Date.now(), value });
    return value;
  }
}

export const getNbaSlate = createServerFn({ method: "GET" })
  .validator((input: { draftGroupId?: number; force?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }) => loadNbaSlate(data.draftGroupId, data.force));
