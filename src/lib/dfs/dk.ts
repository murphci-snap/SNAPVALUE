import { getJson } from "./http";

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
};

type LobbyGroup = {
  DraftGroupId: number;
  ContestTypeId: number;
  StartDate?: string;
  ContestStartTimeSuffix?: string | null;
  DraftGroupTag?: string;
  GameCount?: number;
  Sport?: string;
  SportId?: number;
  GameTypeId?: number;
  Games?: { Name?: string; name?: string }[];
};

type LobbyPlayer = {
  pid: number;
  pdkid: number;
  fn: string;
  ln: string;
  pn: string;
  rosposid: number;
  s: number;
  i?: string;
  news?: number;
  imgLg?: string;
  tid: number;
  htid: number;
  atid: number;
  htabbr: string;
  atabbr: string;
  tsid: number;
  ppg?: string;
  or?: number;
};

type LobbyTeam = {
  ht: string;
  at: string;
  tz?: string;
  status?: string;
};

function msDate(raw?: string): string {
  if (!raw) return new Date().toISOString();
  const m = /\/Date\((\d+)\)/.exec(raw);
  if (m) return new Date(Number(m[1])).toISOString();
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : raw;
}

function lobbyToGroup(g: LobbyGroup): DkGroup {
  const suffix = (g.ContestStartTimeSuffix || g.DraftGroupTag || "").trim() || null;
  const games =
    Array.isArray(g.Games) && g.Games.length
      ? g.Games.map((x) => ({ name: x.Name || x.name || suffix || "" }))
      : Array.from({ length: g.GameCount ?? 0 }, () => ({ name: suffix ?? "" }));
  return {
    draftGroupId: g.DraftGroupId,
    startTimeSuffix: suffix,
    minStartTime: g.StartDate ?? new Date().toISOString(),
    contestType: { contestTypeId: g.ContestTypeId, sport: g.Sport },
    sportId: g.SportId,
    leagues: g.Sport ? [{ leagueAbbreviation: g.Sport }] : [{ leagueAbbreviation: "NFL" }],
    games,
    gameTypeId: g.GameTypeId,
    draftGroupState: "Upcoming",
  };
}

export async function loadDkGroups(): Promise<DkGroup[]> {
  try {
    const api = await getJson<{ draftGroups?: DkGroup[] }>(
      "https://api.draftkings.com/sites/US-DK/draftgroups/v1/?sport=NFL",
      undefined,
      14000,
    );
    if (api.draftGroups?.length) return api.draftGroups;
  } catch {
    /* lobby fallback */
  }
  const lobby = await getJson<{ DraftGroups?: LobbyGroup[] }>(
    "https://www.draftkings.com/lobby/getcontests?sport=NFL",
    undefined,
    18000,
  );
  return (lobby.DraftGroups ?? []).map(lobbyToGroup).filter((g) => g.draftGroupId);
}

function mapLobbyPlayers(
  players: LobbyPlayer[],
  teams: Record<string, LobbyTeam>,
): { draftables: DkDraftable[]; competitions: DkCompetition[] } {
  const competitions: DkCompetition[] = [];
  const seen = new Set<number>();
  for (const [id, t] of Object.entries(teams ?? {})) {
    const cid = Number(id);
    if (!Number.isFinite(cid) || seen.has(cid)) continue;
    seen.add(cid);
    competitions.push({
      competitionId: cid,
      name: `${t.at} @ ${t.ht}`,
      startTime: msDate(t.tz),
      homeTeam: { abbreviation: t.ht, teamName: t.ht },
      awayTeam: { abbreviation: t.at, teamName: t.at },
    });
  }
  const byComp = new Map(competitions.map((c) => [c.competitionId, c]));
  const draftables: DkDraftable[] = [];
  for (const p of players) {
    const home = p.tid === p.htid;
    const team = home ? p.htabbr : p.atabbr;
    const first = p.fn ?? "";
    const last = p.ln ?? "";
    const displayName = `${first} ${last}`.trim() || first || last;
    const shortName = last ? `${first.slice(0, 1)}. ${last}` : displayName;
    const comp = byComp.get(p.tsid);
    const gameName = comp?.name ?? `${p.atabbr} @ ${p.htabbr}`;
    const startTime = comp?.startTime ?? "";
    const injury = (p.i ?? "").trim();
    draftables.push({
      playerId: p.pid,
      playerDkId: p.pdkid,
      displayName,
      firstName: first,
      lastName: last,
      shortName,
      position: p.pn,
      rosterSlotId: p.rosposid,
      salary: p.s,
      status: injury || "None",
      newsStatus: p.news ? String(p.news) : undefined,
      playerImage160: p.imgLg,
      teamAbbreviation: team,
      competition: { competitionId: p.tsid, name: gameName, startTime },
      draftStatAttributes: [
        { id: 90, value: String(p.ppg ?? "0") },
        { id: -2, value: String(p.or ?? 16), sortValue: String(p.or ?? 16) },
      ],
    });
  }
  return { draftables, competitions };
}

export async function loadDkDraftables(draftGroupId: number): Promise<{
  draftables: DkDraftable[];
  competitions: DkCompetition[];
}> {
  try {
    const api = await getJson<{ draftables: DkDraftable[]; competitions: DkCompetition[] }>(
      `https://api.draftkings.com/sites/US-DK/draftgroups/v1/draftgroups/${draftGroupId}/draftables`,
      undefined,
      16000,
    );
    if (api.draftables?.length) {
      return { draftables: api.draftables, competitions: api.competitions ?? [] };
    }
  } catch {
    /* lobby fallback */
  }
  const lobby = await getJson<{ playerList?: LobbyPlayer[]; teamList?: Record<string, LobbyTeam> }>(
    `https://www.draftkings.com/lineup/getavailableplayers?draftGroupId=${draftGroupId}`,
    undefined,
    18000,
  );
  return mapLobbyPlayers(lobby.playerList ?? [], lobby.teamList ?? {});
}