import { getJson, settled } from "@/lib/dfs/http";
import type { Game } from "@/lib/dfs/types";
import { NBA_TEAM_LOOKUP } from "./constants";
import { normalizeName } from "@/lib/utils";

const FD_AK = "FhMFpcPWXMeyZxOx";

function canon(raw: string): string {
  const cleaned = raw.replace(/\([^)]*\)/g, " ").trim();
  const k = cleaned.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (NBA_TEAM_LOOKUP[k]) return NBA_TEAM_LOOKUP[k]!;
  const last = cleaned.toLowerCase().split(/\s+/).pop()?.replace(/[^a-z0-9]/g, "") ?? "";
  if (last && NBA_TEAM_LOOKUP[last]) return NBA_TEAM_LOOKUP[last]!;
  return cleaned.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

type FdEvent = {
  eventId?: string | number;
  name?: string;
  startTime?: string;
  openDate?: string;
  homeTeamNickname?: string;
  awayTeamNickname?: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
};

type FdMarket = {
  marketType?: string;
  eventId?: string;
  runners?: { runnerName?: string; handicap?: number; winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: number } } }[];
};

export type NbaProp = { name: string; team?: string; kind: "pts" | "reb" | "ast" | "threes"; line: number; books: string[] };

export async function loadNbaFd(): Promise<{ games: Partial<Game>[]; props: NbaProp[] }> {
  const page = await settled(
    getJson<{ attachments?: { events?: Record<string, FdEvent>; markets?: Record<string, FdMarket> } }>(
      `https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nba&_ak=${FD_AK}`,
      undefined,
      12000,
    ),
  );
  const events = Object.values(page?.attachments?.events ?? {}).filter((e): e is FdEvent => Boolean(e && typeof e === "object"));
  const markets = Object.values(page?.attachments?.markets ?? {});
  const games: Partial<Game>[] = [];
  for (const e of events) {
    const name = (e.name ?? "").trim();
    if (!/@/.test(name) || /award|future|mvp|champion/i.test(name)) continue;
    if (/\([^)]+\)/.test(name)) continue;
    const [awayName, homeName] = name.split(/\s+@\s+/);
    if (!awayName || !homeName) continue;
    const awayAbbr = e.awayTeamAbbr ? canon(e.awayTeamAbbr) : canon(awayName);
    const homeAbbr = e.homeTeamAbbr ? canon(e.homeTeamAbbr) : canon(homeName);
    const start = e.startTime || e.openDate || "";
    games.push({
      id: Number(e.eventId) || Date.parse(start) || 0,
      name: `${awayAbbr} @ ${homeAbbr}`,
      startTime: start,
      venue: "",
      homeAbbr,
      awayAbbr,
      homeName,
      awayName,
      weather: null,
      isDome: true,
      broadcast: null,
      total: null,
      spread: null,
      homeImplied: null,
      awayImplied: null,
      homeScore: null,
      awayScore: null,
    });
  }
  const byEvent = new Map(games.map((g) => [String(g.id), g]));
  for (const m of markets) {
    const g = byEvent.get(String(m.eventId));
    if (!g) continue;
    const t = (m.marketType ?? "").toLowerCase();
    const runners = m.runners ?? [];
    if (t.includes("moneyline") || t.includes("head to")) continue;
    if (t.includes("spread") || t.includes("handicap")) {
      const home = runners.find((r) => canon(r.runnerName ?? "") === g.homeAbbr);
      const h = home?.handicap;
      if (typeof h === "number") g.spread = h;
    }
    if (t.includes("total") || t.includes("over/under") || t === "total points") {
      const over = runners.find((r) => /over/i.test(r.runnerName ?? ""));
      const h = over?.handicap;
      if (typeof h === "number") g.total = h;
    }
  }
  for (const g of games) {
    if (g.total != null && g.spread != null) {
      g.homeImplied = g.total / 2 - g.spread / 2;
      g.awayImplied = g.total / 2 + g.spread / 2;
    }
  }

  const props: NbaProp[] = [];
  const now = Date.now();
  const live = games
    .filter((g) => {
      const t = Date.parse(g.startTime || "");
      if (!Number.isFinite(t)) return false;
      return t > now - 15 * 60 * 1000 && t < now + 36 * 3600 * 1000;
    })
    .slice(0, 8);
  await Promise.all(
    live.map(async (g) => {
      const page2 = await settled(
        getJson<{ attachments?: { markets?: Record<string, FdMarket> } }>(
          `https://sbapi.nj.sportsbook.fanduel.com/api/event-page?eventId=${g.id}&tab=popular&_ak=${FD_AK}`,
          undefined,
          9000,
        ),
      );
      for (const m of Object.values(page2?.attachments?.markets ?? {})) {
        const t = (m.marketType ?? "").toLowerCase();
        let kind: NbaProp["kind"] | null = null;
        if (/player.*point|points/.test(t) && !/reb|ast|three|combo/.test(t)) kind = "pts";
        else if (/rebound/.test(t) && !/combo|point/.test(t)) kind = "reb";
        else if (/assist/.test(t) && !/combo|point/.test(t)) kind = "ast";
        else if (/three|3-pt|3pt/.test(t)) kind = "threes";
        if (!kind) continue;
        for (const r of m.runners ?? []) {
          const nm = r.runnerName ?? "";
          if (/over|under/i.test(nm) && r.handicap != null) {
            const player = nm.replace(/\s+(over|under).*/i, "").trim();
            if (!player || player.length < 3) continue;
            props.push({ name: player, kind, line: r.handicap, books: ["FanDuel"] });
          }
        }
      }
    }),
  );
  const merged = new Map<string, NbaProp>();
  for (const p of props) {
    const k = `${normalizeName(p.name)}:${p.kind}`;
    const prev = merged.get(k);
    if (!prev) merged.set(k, p);
    else prev.line = (prev.line + p.line) / 2;
  }
  return { games, props: [...merged.values()] };
}
