import { canonTeam } from "./constants";
import { getJson, poolMap, settled } from "./http";
import { americanToProb } from "./scoring";
import type { Game, PropLine } from "./types";
import { normalizeName } from "@/lib/utils";

export type PlayerProps = {
  line: PropLine;
  books: Set<string>;
  n: Partial<Record<string, number>>;
};

export type GameLine = {
  homeAbbr: string;
  awayAbbr: string;
  total: number | null;
  spread: number | null; // home spread (negative = home favorite)
  books: string[];
};

export type PropsBundle = {
  byName: Map<string, PlayerProps>;
  byNameTeam: Map<string, PlayerProps>;
  games: GameLine[];
  vegasPlayers: number;
  dkPlayers: number;
  fdGames: number;
  fdPlayers: number;
};

const FD_AK = "FhMFpcPWXMeyZxOx";

function parseAmerican(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s === "EVEN") return -100;
  const n = Number.parseInt(s.replace("+", ""), 10);
  return Number.isFinite(n) ? n : null;
}

function playerKey(name: string, team?: string) {
  const n = normalizeName(name);
  return team ? `${n}|${canonTeam(team)}` : n;
}

function ensure(mapName: Map<string, PlayerProps>, mapTeam: Map<string, PlayerProps>, name: string, team: string): PlayerProps {
  const k = playerKey(name, team);
  let row = mapTeam.get(k) ?? mapName.get(normalizeName(name));
  if (!row) {
    row = { line: { books: [] }, books: new Set(), n: {} };
  }
  mapTeam.set(k, row);
  mapName.set(normalizeName(name), row);
  return row;
}

function addBook(row: PlayerProps, book: string) {
  row.books.add(book);
  row.line.books = [...row.books];
}

function setNum(row: PlayerProps, key: keyof Omit<PropLine, "books" | "anytimeTd">, value: number, book: string) {
  if (!Number.isFinite(value)) return;
  const n = row.n[key] ?? 0;
  const cur = row.line[key];
  row.line[key] = n === 0 || cur == null ? value : (cur * n + value) / (n + 1);
  row.n[key] = n + 1;
  addBook(row, book);
}

function setAtd(row: PlayerProps, prob: number, book: string) {
  if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return;
  const n = row.n.anytimeTd ?? 0;
  const cur = row.line.anytimeTd;
  row.line.anytimeTd = n === 0 || cur == null ? prob : (cur * n + prob) / (n + 1);
  row.n.anytimeTd = n + 1;
  addBook(row, book);
}

function pickOuLine(
  outcomes: { side: "over" | "under" | "other"; line: number | null; american: number | null }[],
): number | null {
  const byLine = new Map<number, { over?: number; under?: number }>();
  for (const o of outcomes) {
    if (o.line == null || !Number.isFinite(o.line)) continue;
    const g = byLine.get(o.line) ?? {};
    if (o.side === "over") g.over = o.american ?? g.over;
    if (o.side === "under") g.under = o.american ?? g.under;
    byLine.set(o.line, g);
  }
  let best: { line: number; score: number } | null = null;
  for (const [line, g] of byLine) {
    if (g.over == null || g.under == null) continue;
    const score = Math.abs(g.over + 110) + Math.abs(g.under + 110);
    if (!best || score < best.score) best = { line, score };
  }
  if (best) return best.line;
  const first = outcomes.find((o) => o.line != null);
  return first?.line ?? null;
}

function parsePlayerTag(raw: string): { name: string; team: string } | null {
  const cleaned = raw.replace(/\s+-\s+\d[A-Z].*$/, "").trim();
  const m = cleaned.match(/^(.+?)\s+\(([A-Z]{2,3})\)$/);
  if (m?.[1] && m[2]) return { name: m[1].trim(), team: canonTeam(m[2]) };
  return null;
}

function classifyBovada(desc: string): keyof Omit<PropLine, "books" | "anytimeTd"> | "atd" | null {
  const d = desc.toLowerCase();
  if (d.includes("alternate") || d.includes("who will") || d.includes("longest") || d.includes("milestone")) {
    return null;
  }
  // Combined yards (e.g. "Passing & Rushing Yards") must not map to a single stat —
  // otherwise QBs get ~250 "rushYds" from pass+rush totals and rankings explode.
  if (d.includes("passing") && d.includes("rushing")) return null;
  if (d.includes("rushing") && d.includes("receiving")) return null;
  if (d.includes("passing") && d.includes("receiving")) return null;
  if (d.includes("anytime touchdown")) return "atd";
  if (d.includes("passing yards")) return "passYds";
  if (d.includes("passing touchdown")) return "passTd";
  if (d.includes("interceptions thrown") || d.endsWith("interceptions") || d.includes("total interceptions")) {
    return "interceptions";
  }
  if (d.includes("rushing yards")) return "rushYds";
  if (d.includes("rushing touchdown")) return "rushTd";
  if (d.includes("receiving yards")) return "recYds";
  if (d.includes("receiving touchdown")) return "recTd";
  if (d.includes("receptions")) return "receptions";
  return null;
}

type BovadaOutcome = {
  description?: string;
  type?: string;
  price?: { american?: string; handicap?: string | number };
};
type BovadaMarket = {
  description?: string;
  period?: { description?: string };
  outcomes?: BovadaOutcome[];
};
type BovadaEvent = {
  description?: string;
  competitors?: { name?: string; abbreviation?: string; home?: boolean; description?: string }[];
  displayGroups?: { description?: string; markets?: BovadaMarket[] }[];
};

function parseBovada(data: unknown, byName: Map<string, PlayerProps>, byNameTeam: Map<string, PlayerProps>, games: GameLine[]) {
  const root = Array.isArray(data) ? data[0] : data;
  const events = (root as { events?: BovadaEvent[] })?.events ?? [];
  for (const ev of events) {
    const comps = ev.competitors ?? [];
    let home = "";
    let away = "";
    if (comps.length >= 2) {
      const withHome = comps.find((c) => c.home);
      const withAway = comps.find((c) => !c.home);
      home = canonTeam(withHome?.abbreviation || withHome?.name || withHome?.description);
      away = canonTeam(withAway?.abbreviation || withAway?.name || withAway?.description);
      if (!home || !away) {
        const a = canonTeam(comps[0]?.abbreviation || comps[0]?.name);
        const b = canonTeam(comps[1]?.abbreviation || comps[1]?.name);
        away = a;
        home = b;
      }
    } else if (ev.description?.includes("@")) {
      const [a, b] = ev.description.split("@");
      away = canonTeam(a);
      home = canonTeam(b);
    }

    let total: number | null = null;
    let spread: number | null = null;

    for (const dg of ev.displayGroups ?? []) {
      const group = dg.description ?? "";
      for (const m of dg.markets ?? []) {
        const period = m.period?.description ?? "Game";
        if (period !== "Game") continue;
        const desc = m.description ?? "";
        const outs = m.outcomes ?? [];

        if (group === "Game Lines" && desc === "Total") {
          const over = outs.find((o) => o.type === "O" || /^over/i.test(o.description ?? ""));
          const h = Number.parseFloat(String(over?.price?.handicap ?? ""));
          if (Number.isFinite(h)) total = h;
        }
        if (group === "Game Lines" && (desc === "Point Spread" || desc === "Spread")) {
          const homeOut = outs.find((o) => {
            const t = canonTeam(o.description);
            return t === home;
          });
          const h = Number.parseFloat(String(homeOut?.price?.handicap ?? ""));
          if (Number.isFinite(h)) spread = h;
        }

        const kind = classifyBovada(desc);
        if (!kind) continue;

        if (kind === "atd") {
          for (const o of outs) {
            const tag = parsePlayerTag(o.description ?? "");
            if (!tag) continue;
            const amer = parseAmerican(o.price?.american);
            if (amer == null) continue;
            const row = ensure(byName, byNameTeam, tag.name, tag.team);
            const p = americanToProb(amer);
            setAtd(row, p, "Vegas");
          }
          continue;
        }

        const tag = parsePlayerTag(desc.split(" - ").slice(1).join(" - "));
        if (!tag) continue;
        const parsed = outs.map((o) => {
          const side: "over" | "under" | "other" = o.type === "O" || /^over/i.test(o.description ?? "")
            ? "over"
            : o.type === "U" || /^under/i.test(o.description ?? "")
              ? "under"
              : "other";
          const line = Number.parseFloat(String(o.price?.handicap ?? ""));
          return {
            side,
            line: Number.isFinite(line) ? line : null,
            american: parseAmerican(o.price?.american),
          };
        });
        const line = pickOuLine(parsed);
        if (line == null) continue;
        const row = ensure(byName, byNameTeam, tag.name, tag.team);
        setNum(row, kind, line, "Vegas");
      }
    }

    if (home && away) {
      games.push({ homeAbbr: home, awayAbbr: away, total, spread, books: total != null ? ["Vegas"] : [] });
    }
  }
}

type FdMarket = {
  marketType?: string;
  eventId?: number;
  marketName?: string;
  runners?: {
    runnerName?: string;
    handicap?: number;
    result?: { type?: string };
    winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: number; americanOddsInt?: number } };
  }[];
};
type FdEvent = { eventId?: number; name?: string; openDate?: string };

function parseFanDuelGames(data: unknown, games: GameLine[]) {
  const root = data as { attachments?: { events?: Record<string, FdEvent>; markets?: Record<string, FdMarket> } };
  const events = root.attachments?.events ?? {};
  const markets = root.attachments?.markets ?? {};
  const byEvent = new Map<number, GameLine>();
  for (const ev of Object.values(events)) {
    if (!ev.eventId || !ev.name?.includes("@")) continue;
    const [a, b] = ev.name.split("@");
    const away = canonTeam(a);
    const home = canonTeam(b);
    if (!home || !away) continue;
    byEvent.set(ev.eventId, { homeAbbr: home, awayAbbr: away, total: null, spread: null, books: [] });
  }
  for (const m of Object.values(markets)) {
    const g = m.eventId != null ? byEvent.get(m.eventId) : undefined;
    if (!g) continue;
    if (m.marketType === "TOTAL_POINTS_(OVER/UNDER)") {
      const over = m.runners?.find((r) => /over/i.test(r.runnerName ?? ""));
      const line = Number(over?.handicap);
      if (Number.isFinite(line)) {
        g.total = g.total == null ? line : (g.total + line) / 2;
        if (!g.books.includes("FanDuel")) g.books.push("FanDuel");
      }
    }
    if (m.marketType === "MATCH_HANDICAP_(2-WAY)") {
      const homeRunner = m.runners?.find((r) => canonTeam(r.runnerName) === g.homeAbbr);
      const line = Number(homeRunner?.handicap);
      if (Number.isFinite(line)) {
        g.spread = g.spread == null ? line : (g.spread + line) / 2;
        if (!g.books.includes("FanDuel")) g.books.push("FanDuel");
      }
    }
  }
  for (const g of byEvent.values()) {
    if (g.total == null && g.spread == null) continue;
    const existing = games.find((x) => x.homeAbbr === g.homeAbbr && x.awayAbbr === g.awayAbbr);
    if (existing) {
      if (g.total != null) existing.total = existing.total == null ? g.total : (existing.total + g.total) / 2;
      if (g.spread != null) existing.spread = existing.spread == null ? g.spread : (existing.spread + g.spread) / 2;
      for (const b of g.books) if (!existing.books.includes(b)) existing.books.push(b);
    } else {
      games.push(g);
    }
  }
}

function parseEspnScoreboard(raw: unknown, games: GameLine[]) {
  const data = raw as {
    events?: {
      competitions?: {
        competitors?: { homeAway?: string; team?: { abbreviation?: string } }[];
        odds?: { details?: string; overUnder?: number; spread?: number }[];
      }[];
    }[];
  };
  for (const ev of data.events ?? []) {
    const c = ev.competitions?.[0];
    if (!c) continue;
    const home = canonTeam(c.competitors?.find((t) => t.homeAway === "home")?.team?.abbreviation);
    const away = canonTeam(c.competitors?.find((t) => t.homeAway === "away")?.team?.abbreviation);
    if (!home || !away) continue;
    const odds = c.odds?.[0];
    let spread: number | null = null;
    let total: number | null = Number.isFinite(odds?.overUnder) ? Number(odds?.overUnder) : null;
    const details = odds?.details ?? "";
    const m = details.match(/([A-Z]{2,3})\s+([+-]?\d+(?:\.\d+)?)/);
    if (m?.[1] && m[2]) {
      const fav = canonTeam(m[1]);
      const line = Number(m[2]);
      if (Number.isFinite(line)) spread = fav === home ? -Math.abs(line) : Math.abs(line);
    } else if (Number.isFinite(odds?.spread)) {
      spread = -Math.abs(Number(odds?.spread));
    }
    if (spread == null && total == null) continue;
    const existing = games.find((x) => x.homeAbbr === home && x.awayAbbr === away);
    if (existing) {
      if (total != null) existing.total = existing.total == null ? total : (existing.total + total) / 2;
      if (spread != null) existing.spread = existing.spread == null ? spread : (existing.spread + spread) / 2;
      if (!existing.books.includes("ESPN")) existing.books.push("ESPN");
    } else {
      games.push({ homeAbbr: home, awayAbbr: away, total, spread, books: ["ESPN"] });
    }
  }
}

export type EspnPropIndex = Map<string, PlayerProps>;

function mergePropRows(a: PlayerProps, b: PlayerProps): PlayerProps {
  const keys: (keyof Omit<PropLine, "books">)[] = [
    "passYds",
    "passTd",
    "interceptions",
    "rushYds",
    "rushTd",
    "receptions",
    "recYds",
    "recTd",
    "anytimeTd",
  ];
  const line: PropLine = { books: [] };
  for (const k of keys) {
    const av = a.line[k];
    const bv = b.line[k];
    if (av != null && bv != null) {
      const gap = Math.abs(av - bv) / Math.max(av, bv, 0.01);
      line[k] = gap > 0.45 ? Math.min(av, bv) : (av + bv) / 2;
    } else line[k] = av ?? bv;
  }
  const books = new Set([...a.books, ...b.books]);
  line.books = [...books];
  const n: Partial<Record<string, number>> = {};
  for (const k of keys) {
    n[k] = (a.n[k] ?? (a.line[k] != null ? 1 : 0)) + (b.n[k] ?? (b.line[k] != null ? 1 : 0));
  }
  return { line, books, n };
}

const FD_HEADERS = {
  Origin: "https://sportsbook.fanduel.com",
  Referer: "https://sportsbook.fanduel.com/navigation/nfl",
};

const FD_PROP_TABS = ["passing-props", "rushing-props", "receiving-props", "td-scorer-props"] as const;

const ESPN_DK_TYPES: Record<string, keyof Omit<PropLine, "books" | "anytimeTd"> | "atd"> = {
  "8": "passYds",
  "10": "passTd",
  "12": "rushYds",
  "13": "recYds",
  "14": "receptions",
  "15": "interceptions",
};

function classifyFdMarket(marketType: string, marketName: string): keyof Omit<PropLine, "books" | "anytimeTd"> | "atd" | null {
  const t = `${marketType} ${marketName}`.toLowerCase().replace(/[_-]+/g, " ");
  if (
    /\balt\b/.test(t) ||
    t.includes("longest") ||
    t.includes("drive") ||
    t.includes("first touchdown") ||
    t.includes("2nd touchdown") ||
    t.includes("last touchdown") ||
    t.includes("qtr") ||
    t.includes("quarter") ||
    t.includes("1st half") ||
    t.includes("2nd half") ||
    t.includes("most passing") ||
    t.includes("either player") ||
    t.includes("3+") ||
    t.includes("2+")
  ) {
    return null;
  }
  if (t.includes("passing") && t.includes("rushing")) return null;
  if (t.includes("rushing") && t.includes("receiving")) return null;
  if (t.includes("passing") && t.includes("receiving")) return null;
  if (t.includes("anytime") && t.includes("touchdown")) return "atd";
  if (t.includes("any time") && t.includes("touchdown")) return "atd";
  if (t.includes("passing yards") || t.includes("passing yds")) return "passYds";
  if (t.includes("passing touchdown") || t.includes("passing td")) return "passTd";
  if (t.includes("interception")) return "interceptions";
  if (t.includes("rushing yards") || t.includes("rushing yds")) return "rushYds";
  if (t.includes("rushing touchdown")) return "rushTd";
  if (t.includes("receiving yards") || t.includes("receiving yds")) return "recYds";
  if (t.includes("receiving touchdown")) return "recTd";
  if (t.includes("receptions")) return "receptions";
  return null;
}

function fdPlayerName(marketName: string, runnerName: string): string {
  const fromMarket = marketName.split(" - ")[0]?.trim() ?? "";
  if (fromMarket && fromMarket.length > 2 && !/^(over|under|yes|no)\b/i.test(fromMarket)) return fromMarket;
  return runnerName.replace(/\s+(Over|Under|Yes|No)$/i, "").trim();
}

function parseFanDuelPlayerMarkets(
  data: unknown,
  byName: Map<string, PlayerProps>,
  byNameTeam: Map<string, PlayerProps>,
) {
  const markets = (data as { attachments?: { markets?: Record<string, FdMarket> } }).attachments?.markets ?? {};
  for (const m of Object.values(markets)) {
    const kind = classifyFdMarket(m.marketType ?? "", m.marketName ?? "");
    if (!kind) continue;
    const runners = m.runners ?? [];
    if (kind === "atd") {
      for (const r of runners) {
        const name = fdPlayerName(m.marketName ?? "", r.runnerName ?? "");
        const amer = r.winRunnerOdds?.americanDisplayOdds?.americanOddsInt ?? r.winRunnerOdds?.americanDisplayOdds?.americanOdds;
        if (!name || amer == null) continue;
        const p = americanToProb(Number(amer));
        setAtd(ensure(byName, byNameTeam, name, ""), p, "FanDuel");
      }
      continue;
    }
    const over = runners.find((r) => r.result?.type === "OVER" || /^over/i.test(r.runnerName ?? ""));
    const line = Number(over?.handicap);
    if (!Number.isFinite(line) || line <= 0) continue;
    const name = fdPlayerName(m.marketName ?? "", over?.runnerName ?? runners[0]?.runnerName ?? "");
    if (!name) continue;
    setNum(ensure(byName, byNameTeam, name, ""), kind, line, "FanDuel");
  }
}

function fdUpcomingEventIds(data: unknown): number[] {
  const events = (data as { attachments?: { events?: Record<string, FdEvent & { openDate?: string }> } }).attachments?.events ?? {};
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  const ids: number[] = [];
  for (const ev of Object.values(events)) {
    if (!ev.eventId || !ev.name?.includes("@")) continue;
    const t = Date.parse(ev.openDate ?? "");
    if (Number.isFinite(t) && t < cutoff) continue;
    ids.push(ev.eventId);
  }
  return ids;
}

function upcomingEspnEventIds(raw: unknown): string[] {
  const data = raw as { events?: { id?: string; date?: string }[] };
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  const ids: string[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.id) continue;
    const t = Date.parse(ev.date ?? "");
    if (Number.isFinite(t) && t < cutoff) continue;
    ids.push(String(ev.id));
  }
  return ids;
}

function athleteIdFromRef(ref?: string): string | null {
  const m = ref?.match(/athletes\/(\d+)/);
  return m?.[1] ?? null;
}

function ensureEspn(byEspnId: EspnPropIndex, id: string): PlayerProps {
  let row = byEspnId.get(id);
  if (!row) {
    row = { line: { books: [] }, books: new Set(), n: {} };
    byEspnId.set(id, row);
  }
  return row;
}

function parseEspnDkPropBets(data: unknown, byEspnId: EspnPropIndex) {
  const items =
    (data as {
      items?: {
        type?: { id?: string; name?: string };
        athlete?: { $ref?: string };
        current?: { target?: { value?: number } };
      }[];
    }).items ?? [];
  for (const it of items) {
    const typeName = (it.type?.name ?? "").toLowerCase();
    if (typeName.includes("plus") || typeName.includes("longest") || typeName.includes("first") || typeName.includes("last")) {
      continue;
    }
    let kind: keyof Omit<PropLine, "books" | "anytimeTd"> | "atd" | null = ESPN_DK_TYPES[it.type?.id ?? ""] ?? null;
    if (!kind && typeName.includes("anytime") && typeName.includes("touchdown")) kind = "atd";
    if (!kind) continue;
    const espnId = athleteIdFromRef(it.athlete?.$ref);
    if (!espnId) continue;
    const line = Number(it.current?.target?.value);
    const row = ensureEspn(byEspnId, espnId);
    if (kind === "atd") {
      if (line > 0 && line < 1) setAtd(row, line, "DraftKings");
      continue;
    }
    if (!Number.isFinite(line) || line <= 0) continue;
    setNum(row, kind, line, "DraftKings");
  }
}

export async function loadProps(): Promise<PropsBundle & { byEspnId: EspnPropIndex }> {
  const byName = new Map<string, PlayerProps>();
  const byNameTeam = new Map<string, PlayerProps>();
  const byEspnId: EspnPropIndex = new Map();
  const games: GameLine[] = [];

  const [bovada, fd, espnSb] = await Promise.all([
    settled(getJson<unknown>("https://www.bovada.lv/services/sports/event/coupon/events/A/description/football/nfl?lang=en", undefined, 28000)),
    settled(
      getJson<unknown>(
        `https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=CUSTOM&customPageId=nfl&_ak=${FD_AK}`,
        { headers: FD_HEADERS },
        14000,
      ),
    ),
    settled(getJson<unknown>("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", undefined, 8000)),
  ]);

  if (bovada) {
    try {
      parseBovada(bovada, byName, byNameTeam, games);
    } catch {
      /* ignore parse errors */
    }
  }
  if (fd) {
    try {
      parseFanDuelGames(fd, games);
    } catch {
      /* ignore */
    }
  }
  if (espnSb) {
    try {
      parseEspnScoreboard(espnSb, games);
    } catch {
      /* ignore */
    }
  }

  const fdIds = fd ? fdUpcomingEventIds(fd) : [];
  const espnIds = espnSb ? upcomingEspnEventIds(espnSb) : [];
  const fdJobs = fdIds.flatMap((eventId) => FD_PROP_TABS.map((tab) => ({ eventId, tab })));

  await Promise.all([
    poolMap(
      fdJobs,
      5,
      async ({ eventId, tab }) => {
        const page = await settled(
          getJson<unknown>(
            `https://sbapi.nj.sportsbook.fanduel.com/api/event-page?eventId=${eventId}&tab=${tab}&_ak=${FD_AK}`,
            { headers: FD_HEADERS },
            8000,
          ),
        );
        if (page) parseFanDuelPlayerMarkets(page, byName, byNameTeam);
      },
      14000,
    ),
    poolMap(
      espnIds,
      4,
      async (eid) => {
        const page = await settled(
          getJson<unknown>(
            `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${eid}/competitions/${eid}/odds/100/propBets?lang=en&region=us&limit=1000`,
            undefined,
            9000,
          ),
        );
        if (page) parseEspnDkPropBets(page, byEspnId);
      },
      14000,
    ),
  ]);

  const unique = new Set(byName.values());
  return {
    byName,
    byNameTeam,
    games,
    vegasPlayers: [...unique].filter((p) => p.books.has("Vegas")).length,
    dkPlayers: [...byEspnId.values()].filter((p) => p.books.has("DraftKings")).length,
    fdGames: games.filter((g) => g.books.includes("FanDuel")).length,
    fdPlayers: [...unique].filter((p) => p.books.has("FanDuel")).length,
    byEspnId,
  };
}

export function lookupProps(
  bundle: PropsBundle & { byEspnId: EspnPropIndex },
  name: string,
  team: string,
  espnId?: string | number | null,
): PlayerProps | null {
  const fromEspn = espnId != null ? bundle.byEspnId.get(String(espnId)) : undefined;
  const fromVegas =
    bundle.byNameTeam.get(`${normalizeName(name)}|${canonTeam(team)}`) ?? bundle.byName.get(normalizeName(name));
  if (fromEspn && fromVegas) return mergePropRows(fromVegas, fromEspn);
  return fromVegas ?? fromEspn ?? null;
}

export function applyGameLines(games: Game[], lines: GameLine[]) {
  for (const g of games) {
    const hit =
      lines.find((l) => l.homeAbbr === g.homeAbbr && l.awayAbbr === g.awayAbbr) ??
      lines.find((l) => l.homeAbbr === g.awayAbbr && l.awayAbbr === g.homeAbbr);
    if (!hit) {
      g.total = g.total ?? null;
      g.spread = g.spread ?? null;
      g.homeImplied = g.homeImplied ?? null;
      g.awayImplied = g.awayImplied ?? null;
      continue;
    }
    const total = hit.total;
    let spread = hit.spread;
    if (spread != null && hit.homeAbbr === g.awayAbbr) spread = -spread;
    g.total = total;
    g.spread = spread;
    if (total != null && spread != null) {
      g.homeImplied = Math.round((total / 2 - spread / 2) * 10) / 10;
      g.awayImplied = Math.round((total / 2 + spread / 2) * 10) / 10;
    } else {
      g.homeImplied = null;
      g.awayImplied = null;
    }
  }
}
