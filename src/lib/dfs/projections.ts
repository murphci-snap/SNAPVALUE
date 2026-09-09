import { canonTeam } from "./constants";
import { getJson, getText, settled } from "./http";
import { dkFromWeek, round1 } from "./scoring";
import type { Position, WeekProjection } from "./types";
import { normalizeName } from "@/lib/utils";

export type SiteProj = {
  id: string;
  label: string;
  points: number;
  week?: Partial<WeekProjection>;
};

export type SiteIndex = {
  byName: Map<string, SiteProj>;
  byNameTeam: Map<string, SiteProj>;
  ok: boolean;
  players: number;
};

function put(idx: SiteIndex, name: string, team: string, proj: SiteProj) {
  idx.byName.set(normalizeName(name), proj);
  if (team) idx.byNameTeam.set(`${normalizeName(name)}|${canonTeam(team)}`, proj);
  idx.players += 1;
}

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
}

function sleeperDk(stats: Record<string, number>, position: Position): { points: number; week: Partial<WeekProjection> } {
  const week: Partial<WeekProjection> = {
    passYds: n(stats.pass_yd),
    passTd: n(stats.pass_td),
    interceptions: n(stats.pass_int),
    rushYds: n(stats.rush_yd),
    rushTd: n(stats.rush_td),
    receptions: n(stats.rec),
    recYds: n(stats.rec_yd),
    recTd: n(stats.rec_td),
    sacks: n(stats.sack ?? stats.sacks ?? stats.def_sack),
    defInt: n(stats.int ?? stats.def_int ?? stats.idp_int),
    fumRec: n(stats.fum_rec ?? stats.def_fr),
    defTd: n(stats.def_td ?? stats.def_st_td),
    ptsAllowed: n(stats.pts_allow ?? stats.pts_allowed),
  };
  if (position === "DST") {
    const full = {
      passYds: 0,
      passTd: 0,
      interceptions: 0,
      rushYds: 0,
      rushTd: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      sacks: week.sacks ?? 0,
      defInt: week.defInt ?? 0,
      fumRec: week.fumRec ?? 0,
      defTd: week.defTd ?? 0,
      ptsAllowed: week.ptsAllowed ?? 22,
      espnPpr: 0,
      dk: 0,
    };
    return { points: round1(dkFromWeek(full, "DST")), week };
  }
  const full: WeekProjection = {
    passYds: week.passYds ?? 0,
    passTd: week.passTd ?? 0,
    interceptions: week.interceptions ?? 0,
    rushYds: week.rushYds ?? 0,
    rushTd: week.rushTd ?? 0,
    receptions: week.receptions ?? 0,
    recYds: week.recYds ?? 0,
    recTd: week.recTd ?? 0,
    sacks: 0,
    defInt: 0,
    fumRec: 0,
    defTd: 0,
    ptsAllowed: 0,
    espnPpr: n(stats.pts_ppr),
    dk: 0,
  };
  let pts = dkFromWeek(full, position);
  if (pts < 1 && full.espnPpr > 1) pts = full.espnPpr;
  return { points: round1(pts), week };
}

type SleeperRow = {
  company?: string;
  stats?: Record<string, number>;
  player?: { first_name?: string; last_name?: string; position?: string; team?: string; fantasy_positions?: string[] };
  team?: string;
};

export async function loadSleeper(season: number, week: number): Promise<SiteIndex> {
  const idx: SiteIndex = { byName: new Map(), byNameTeam: new Map(), ok: false, players: 0 };
  const rows = await settled(
    getJson<SleeperRow[]>(
      `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
      undefined,
      28000,
    ),
  );
  if (!rows?.length) return idx;
  const want = new Set(["QB", "RB", "WR", "TE", "DEF", "DST"]);
  for (const row of rows) {
    const p = row.player;
    if (!p) continue;
    const posRaw = p.position ?? p.fantasy_positions?.[0] ?? "";
    if (!want.has(posRaw)) continue;
    const stats = row.stats ?? {};
    if (!n(stats.pts_ppr) && !n(stats.pass_yd) && !n(stats.rush_yd) && !n(stats.rec_yd) && posRaw !== "DEF") continue;
    const team = canonTeam(row.team || p.team);
    const name = posRaw === "DEF" || posRaw === "DST" ? `${team} DST` : `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    const position: Position = posRaw === "DEF" ? "DST" : (posRaw as Position);
    const { points, week: w } = sleeperDk(stats, position);
    if (points <= 0) continue;
    put(idx, name, team, { id: "rotowire", label: "RotoWire", points, week: w });
    if (posRaw === "DEF" && team) {
      put(idx, team, team, { id: "rotowire", label: "RotoWire", points, week: w });
    }
  }
  idx.ok = idx.players > 0;
  return idx;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export async function loadFantasyPros(): Promise<SiteIndex> {
  const idx: SiteIndex = { byName: new Map(), byNameTeam: new Map(), ok: false, players: 0 };
  const csv = await settled(
    getText("https://raw.githubusercontent.com/dynastyprocess/data/master/files/fp_latest_weekly.csv", { headers: { Accept: "text/csv, text/plain, */*" } }, 18000),
  );
  if (!csv || !csv.includes("player_name")) return idx;
  const rows = parseCsv(csv);
  if (rows.length < 2) return idx;
  const header = rows[0]!.map((h) => h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim());
  const iName = header.indexOf("player_name");
  const iPos = header.indexOf("pos");
  const iTeam = header.indexOf("team");
  const iPts = header.indexOf("r2p_pts");
  if (iName < 0 || iPts < 0) return idx;
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const name = r[iName]?.trim();
    const pos = (r[iPos] ?? "").toUpperCase();
    const team = canonTeam(r[iTeam]);
    const pts = n(r[iPts]);
    if (!name || pts <= 0) continue;
    if (!["QB", "RB", "WR", "TE", "DST", "DEF"].includes(pos)) continue;
    const key = `${normalizeName(name)}|${team}`;
    if (seen.has(key)) continue;
    seen.add(key);
    put(idx, name, team, { id: "fantasypros", label: "FantasyPros", points: round1(pts) });
    if ((pos === "DST" || pos === "DEF") && team) {
      put(idx, `${team} DST`, team, { id: "fantasypros", label: "FantasyPros", points: round1(pts) });
    }
  }
  idx.ok = idx.players > 0;
  return idx;
}

export function lookupSite(idx: SiteIndex, name: string, team: string): SiteProj | undefined {
  return idx.byNameTeam.get(`${normalizeName(name)}|${canonTeam(team)}`) ?? idx.byName.get(normalizeName(name));
}
