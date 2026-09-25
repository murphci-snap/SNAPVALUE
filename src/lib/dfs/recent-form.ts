import { getJson, settled } from "./http";
import { normalizeName } from "@/lib/utils";
import type { Player, Position, WeekForm } from "./types";
import { teamKey } from "./site-salary";

interface SleeperRow {
  full_name?: string;
  team?: string | null;
  position?: string;
  off_snp?: number;
  tm_off_snp?: number;
  def_snp?: number;
  tm_def_snp?: number;
  rec_tgt?: number;
  rush_att?: number;
  pts_ppr?: number;
  pts_std?: number;
  gp?: number;
}

const POS: Record<string, Position | undefined> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  DEF: "DST",
  DST: "DST",
};

let idMap: Promise<Map<string, string>> | null = null;

function playerMap(): Promise<Map<string, string>> {
  idMap ??= (async () => {
    const raw = await getJson<Record<string, SleeperRow>>("https://api.sleeper.app/v1/players/nfl", undefined, 20000);
    const map = new Map<string, string>();
    for (const [id, p] of Object.entries(raw)) {
      const pos = POS[p.position ?? ""];
      if (!pos || !p.full_name) continue;
      const name = normalizeName(p.full_name);
      const team = teamKey(p.team ?? "");
      if (pos === "DST") {
        map.set(`dst|${teamKey(id)}`, id);
        if (team) map.set(`dst|${team}`, id);
        continue;
      }
      map.set(`${name}|${team}|${pos}`, id);
      if (!map.has(`${name}|${pos}`)) map.set(`${name}|${pos}`, id);
    }
    return map;
  })().catch((err) => {
    idMap = null;
    throw err;
  });
  return idMap;
}

function formFrom(week: number, row: SleeperRow | undefined, pos: Position): WeekForm | null {
  if (!row || !(row.gp || row.pts_ppr || row.off_snp || row.def_snp)) return null;
  const snaps = pos === "DST" ? row.def_snp : row.off_snp;
  const team = pos === "DST" ? row.tm_def_snp : row.tm_off_snp;
  const snapPct = snaps != null && team ? Math.round((snaps / team) * 100) : null;
  const ppr = pos === "DST" ? (row.pts_std ?? row.pts_ppr ?? null) : (row.pts_ppr ?? row.pts_std ?? null);
  return {
    week,
    ppr: ppr == null ? null : Math.round(ppr * 10) / 10,
    snaps: snaps == null ? null : Math.round(snaps),
    snapPct,
    targets: row.rec_tgt == null ? null : Math.round(row.rec_tgt),
    carries: row.rush_att == null ? null : Math.round(row.rush_att),
  };
}

/** Last completed weeks: PPR, snap %, targets, carries. No invented routes or salaries. */
export async function loadRecentForm(players: Player[], season: number, week: number): Promise<number> {
  const weeks: number[] = [];
  for (let w = Math.max(1, week - 3); w < week; w++) weeks.push(w);
  if (!weeks.length) {
    for (const p of players) p.recentForm = [];
    return 0;
  }
  const [ids, packs] = await Promise.all([
    settled(playerMap()),
    Promise.all(
      weeks.map(async (w) => {
        const rows = await settled(
          getJson<Record<string, SleeperRow>>(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${w}`, undefined, 12000),
        );
        return [w, rows] as const;
      }),
    ),
  ]);
  if (!ids) return 0;
  let n = 0;
  for (const p of players) {
    if (p.showdownRole === "CPT") {
      p.recentForm = [];
      continue;
    }
    const name = normalizeName(p.name);
    const team = teamKey(p.team);
    const id =
      p.position === "DST"
        ? ids.get(`dst|${team}`)
        : (ids.get(`${name}|${team}|${p.position}`) ?? ids.get(`${name}|${p.position}`));
    const rows: WeekForm[] = [];
    if (id) {
      for (const [w, pack] of packs) {
        const row = formFrom(w, pack?.[id], p.position);
        if (row) rows.push(row);
      }
    }
    p.recentForm = rows;
    if (rows.length) n += 1;
  }
  return n;
}
