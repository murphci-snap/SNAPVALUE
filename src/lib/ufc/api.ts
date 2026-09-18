import { loadDkDraftables, loadDkGroups, loadDkLobbyGroups, type DkCompetition, type DkDraftable, type DkGroup } from "@/lib/dfs/dk";
import { getJson, poolMap, settled } from "@/lib/dfs/http";
import { americanToProb } from "@/lib/dfs/scoring";
import { normalizeName } from "@/lib/utils";
import {
  UFC_331_FALLBACK,
  UFC_CAP,
  UFC_CLASSIC_CT,
  UFC_CPT_SLOT,
  UFC_EVENT_ID,
  UFC_EVENT_NAME,
  UFC_FIGHTER_SLOT,
  UFC_HEADLINE,
  UFC_SKIP_CT,
  UFC_SPORT_ID,
  UFC_VENUE,
  isUfc331BookedName,
  isUfc331Scratched,
  isUfc331Window,
  ufc331CardOf,
  ufcCacheMs,
} from "./constants";
import { loadUfcCardNews } from "./news";
import { loadUfcFd, matchFdFight, methodProb, type UfcFdFight } from "./lines";
import { clamp, expectedDk, lastNameOf, parseRecord, removeVigPair, round1, round2 } from "./scoring";
import type {
  UfcCard,
  UfcFight,
  UfcFighter,
  UfcMethod,
  UfcSlateData,
  UfcSlateOption,
  UfcSlateResponse,
} from "./types";

const CACHE_VER = 5;
type Hit = { at: number; value: UfcSlateResponse };
const g = globalThis as typeof globalThis & { __snapUfcCache?: Map<string, Hit> };
function cache() {
  if (!g.__snapUfcCache) g.__snapUfcCache = new Map();
  return g.__snapUfcCache;
}

const ESPN_H = { Referer: "https://www.espn.com/mma/fightcenter", Origin: "https://www.espn.com" };

function isUfcGroup(group: DkGroup): boolean {
  const leagues = (group.leagues ?? []).map((l) => (l.leagueAbbreviation || "").toUpperCase());
  const sport = (group.contestType?.sport || "").toUpperCase();
  return group.sportId === UFC_SPORT_ID || sport === "MMA" || sport === "UFC" || leagues.includes("UFC") || leagues.includes("MMA");
}

function attr(c: DkCompetition, typeId: number): string {
  return c.competitionAttributes?.find((a) => a.typeId === typeId)?.value ?? "";
}

function cardOf(raw: string, start: string): UfcCard {
  const t = raw.toLowerCase();
  if (t.includes("main")) return "main";
  if (t.includes("prelims2") || t.includes("early")) return "early";
  if (t.includes("prelim")) return "prelims";
  const hour = new Date(start).getUTCHours();
  if (hour >= 1 && hour <= 6) return "main";
  if (hour >= 23 || hour === 0) return "prelims";
  return "early";
}

function splitFightName(name: string): { a: string; b: string } {
  const m = name.split(/\s+vs\.?\s+/i);
  if (m.length >= 2 && m[0] && m[1]) return { a: m[0].trim(), b: m[1].trim() };
  return { a: name, b: "" };
}

type EspnComp = {
  id?: string;
  date?: string;
  type?: { abbreviation?: string };
  format?: { regulation?: { periods?: number } };
  venue?: { fullName?: string };
  status?: { type?: { completed?: boolean; state?: string; description?: string } };
  competitors?: {
    id?: string;
    winner?: boolean;
    athlete?: { id?: string; displayName?: string; fullName?: string; headshot?: { href?: string } };
    records?: { summary?: string }[];
  }[];
};

function espnName(c: NonNullable<EspnComp["competitors"]>[number]): string {
  return c.athlete?.displayName || c.athlete?.fullName || "";
}

async function loadEspnCard(): Promise<{
  eventName: string;
  venue: string;
  comps: EspnComp[];
}> {
  const json = await getJson<{
    events?: { name?: string; competitions?: EspnComp[]; venue?: { fullName?: string } }[];
  }>("https://site.web.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard", { headers: ESPN_H }, 12000);
  const events = json.events ?? [];
  const ev =
    events.find((e) => /331|van|pantoja/i.test(e.name ?? "")) ??
    events.find((e) => (e.competitions?.length ?? 0) >= 6) ??
    events[0];
  return {
    eventName: ev?.name ?? UFC_EVENT_NAME,
    venue: ev?.venue?.fullName || ev?.competitions?.[0]?.venue?.fullName || UFC_VENUE,
    comps: ev?.competitions ?? [],
  };
}

async function loadCareer(ids: string[]): Promise<Map<string, { ko: number; sub: number; wins: number; losses: number; record: string; image: string | null }>> {
  const out = new Map<string, { ko: number; sub: number; wins: number; losses: number; record: string; image: string | null }>();
  await poolMap(
    ids.filter(Boolean).slice(0, 28),
    6,
    async (id) => {
      const json = await getJson<{
        athlete?: {
          displayName?: string;
          headshot?: { href?: string };
          statsSummary?: { statistics?: { name?: string; displayValue?: string; value?: number }[] };
        };
      }>(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`, { headers: ESPN_H }, 8000);
      const stats = json.athlete?.statsSummary?.statistics ?? [];
      const rec = stats.find((s) => s.name === "wins-losses-draws")?.displayValue ?? "";
      const tko = stats.find((s) => /tko/i.test(s.name ?? ""))?.displayValue ?? "";
      const sub = stats.find((s) => /submission/i.test(s.name ?? ""))?.displayValue ?? "";
      const parsed = parseRecord(rec);
      const koWins = Number.parseInt(tko.split("-")[0] ?? "", 10);
      const subWins = Number.parseInt(sub.split("-")[0] ?? "", 10);
      out.set(id, {
        ko: Number.isFinite(koWins) ? koWins : 0,
        sub: Number.isFinite(subWins) ? subWins : 0,
        wins: parsed.wins,
        losses: parsed.losses,
        record: rec || `${parsed.wins}-${parsed.losses}-0`,
        image: json.athlete?.headshot?.href ?? null,
      });
    },
    14000,
  );
  return out;
}

function isCaptainGroup(group: DkGroup): boolean {
  const suffix = (group.startTimeSuffix || "").toLowerCase();
  return /captain|showdown/.test(suffix);
}

function keepUfcGroup(group: DkGroup): boolean {
  const ct = group.contestType?.contestTypeId;
  if (ct != null && UFC_SKIP_CT.includes(ct)) return false;
  const suffix = (group.startTimeSuffix || "").toLowerCase();
  if (suffix.includes("turbo") || suffix.includes("all day")) return false;
  if (ct === UFC_CLASSIC_CT) return true;
  if (isCaptainGroup(group)) return true;
  return false;
}

function espnResult(c?: EspnComp): { method: UfcMethod | null; round: number | null; winner: string | null } {
  const winner = (c?.competitors ?? []).find((x) => x.winner);
  const desc = `${c?.status?.type?.description ?? ""} ${c?.status?.type?.state ?? ""}`;
  const method: UfcMethod | null = /sub/i.test(desc) ? "sub" : /ko|tko|knock/i.test(desc) ? "ko" : /decis|points|unanimous|split|majority/i.test(desc) ? "dec" : null;
  const round = Number.parseInt(/round\s+(\d+)/i.exec(desc)?.[1] ?? "", 10);
  return { method, round: Number.isFinite(round) ? round : null, winner: winner ? espnName(winner) : null };
}

function findEspn(comps: EspnComp[], a: string, b: string): EspnComp | undefined {
  const want = [normalizeName(a), normalizeName(b), normalizeName(lastNameOf(a)), normalizeName(lastNameOf(b))];
  return comps.find((c) => {
    const names = (c.competitors ?? []).map((x) => normalizeName(espnName(x)));
    const lasts = (c.competitors ?? []).map((x) => normalizeName(lastNameOf(espnName(x))));
    return want.slice(0, 2).every((n) => names.some((x) => x === n || x.includes(n) || n.includes(x)))
      || want.slice(2).every((n) => lasts.includes(n));
  });
}

function sameFighter(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  return normalizeName(lastNameOf(a)) === normalizeName(lastNameOf(b));
}

function espnFullName(c: EspnComp | undefined, name: string): string {
  const hit = (c?.competitors ?? []).find((x) => sameFighter(espnName(x), name));
  return hit ? espnName(hit) : name;
}

function fdSide(fd: UfcFdFight | undefined, name: string): { ml: number | null; method: UfcFdFight["methodA"] } {
  if (!fd) return { ml: null, method: null };
  if (sameFighter(fd.aName, name)) return { ml: fd.aMl, method: fd.methodA };
  if (sameFighter(fd.bName, name)) return { ml: fd.bMl, method: fd.methodB };
  return { ml: null, method: null };
}

function mixMethods(opts: {
  winProb: number;
  koWins: number;
  subWins: number;
  wins: number;
  oppKoLoss: boolean;
  oppSubLoss: boolean;
  rounds: 3 | 5;
  fd?: { ko: number | null; sub: number | null; dec: number | null };
}): { pKo: number; pSub: number; pDec: number; rankingMethod: UfcFighter["rankingMethod"] } {
  const wins = Math.max(1, opts.wins);
  let koShare = clamp(opts.koWins / wins, 0.08, 0.78);
  let subShare = clamp(opts.subWins / wins, 0.02, 0.55);
  if (opts.oppKoLoss) koShare = clamp(koShare + 0.06, 0.08, 0.82);
  if (opts.oppSubLoss) subShare = clamp(subShare + 0.08, 0.04, 0.6);
  if (opts.rounds === 5) {
    koShare *= 0.92;
    subShare *= 0.92;
  }
  let rest = Math.max(0.08, 1 - koShare - subShare);
  const s = koShare + subShare + rest;
  koShare /= s;
  subShare /= s;
  rest /= s;
  let pKo = opts.winProb * koShare;
  let pSub = opts.winProb * subShare;
  let pDec = opts.winProb * rest;
  let rankingMethod: UfcFighter["rankingMethod"] = "fppg";
  if (opts.fd && (opts.fd.ko != null || opts.fd.sub != null || opts.fd.dec != null)) {
    rankingMethod = "props";
    const mk = {
      ko: methodProb({ ko: opts.fd.ko, sub: opts.fd.sub, dec: opts.fd.dec, books: [] }, "ko"),
      sub: methodProb({ ko: opts.fd.ko, sub: opts.fd.sub, dec: opts.fd.dec, books: [] }, "sub"),
      dec: methodProb({ ko: opts.fd.ko, sub: opts.fd.sub, dec: opts.fd.dec, books: [] }, "dec"),
    };
    if (mk.ko != null) pKo = 0.55 * mk.ko + 0.45 * pKo;
    if (mk.sub != null) pSub = 0.55 * mk.sub + 0.45 * pSub;
    if (mk.dec != null) pDec = 0.55 * mk.dec + 0.45 * pDec;
    const tot = pKo + pSub + pDec || opts.winProb;
    if (tot > 0) {
      const scale = opts.winProb / tot;
      pKo *= scale;
      pSub *= scale;
      pDec *= scale;
    }
  } else if (opts.winProb > 0) {
    rankingMethod = "consensus";
  }
  return { pKo, pSub, pDec, rankingMethod };
}

function toOption(group: DkGroup): UfcSlateOption {
  const n = Array.isArray(group.games) ? group.games.length : 0;
  const captain = isCaptainGroup(group);
  return {
    draftGroupId: group.draftGroupId,
    label: captain ? "Captain" : "UFC 331",
    suffix: (group.startTimeSuffix || "").replace(/[()]/g, "").trim() || (captain ? "Captain" : "Main card"),
    title: captain ? "Captain" : "UFC 331",
    subtitle: captain ? "CPT 1.5× · main card" : UFC_HEADLINE,
    startTime: group.minStartTime,
    gameCount: n,
    format: captain ? "showdown" : "classic",
  };
}

function emptyNotice(games: number, salaries: boolean): string | null {
  if (!salaries) return "DraftKings salaries aren’t posted yet. Main-card fighters are on the board. Cash / GPP shells wait on salaries.";
  if (!games) return "UFC 331 main card is loading. Switch to NFL if this is empty.";
  return null;
}

function markValues(players: UfcFighter[]) {
  const sorted = [...players].filter((p) => p.salary > 0).sort((a, b) => b.value - a.value);
  sorted.forEach((p, i) => {
    p.valueRank = i + 1;
    p.isValuePlay = i < Math.max(3, Math.ceil(sorted.length * 0.28)) && p.value >= 5.4;
  });
}

export async function loadUfcSlate(draftGroupId?: number, force?: boolean): Promise<UfcSlateResponse> {
  const store = cache();
  const cacheKey = `ufc:${CACHE_VER}:${draftGroupId ?? "auto"}`;
  const news = await loadUfcCardNews();
  const extra = news.scratchedKeys;
  const hit = store.get(cacheKey);
  const ttl = ufcCacheMs();
  if (!force && hit && Date.now() - hit.at < ttl && hit.value.ok) {
    const old = hit.value.cardTrust?.scratchedKeys ?? [];
    const same = [...old].sort().join(",") === [...extra].sort().join(",");
    if (same) {
      const cached = { ...hit.value, cardTrust: news, nextRefreshAt: new Date(Date.now() + ttl).toISOString() };
      return cached;
    }
  }

  try {
    const [allGroups, espn, fd] = await Promise.all([
      settled(loadDkGroups()),
      settled(loadEspnCard()),
      settled(loadUfcFd()),
    ]);
    let groups = (allGroups ?? []).filter(isUfcGroup);
    if (!groups.length) {
      const lobby = await settled(loadDkLobbyGroups("MMA"));
      groups = (lobby ?? []).filter(isUfcGroup);
    }
    const usable = groups.filter(keepUfcGroup);
    const pool = usable.length
      ? usable
      : groups.filter((g) => {
          const ct = g.contestType?.contestTypeId;
          return ct == null || !UFC_SKIP_CT.includes(ct);
        });
    const classic = [...pool].sort((a, b) => {
      const ac = a.contestType?.contestTypeId === UFC_CLASSIC_CT ? 1 : 0;
      const bc = b.contestType?.contestTypeId === UFC_CLASSIC_CT ? 1 : 0;
      if (bc !== ac) return bc - ac;
      return (b.games?.length ?? 0) - (a.games?.length ?? 0);
    });
    const selected = classic.find((g) => g.draftGroupId === draftGroupId) ?? classic[0];
    const slates = classic.slice(0, 4).map(toOption);
    if (selected && !slates.some((s) => s.draftGroupId === selected.draftGroupId)) slates.unshift(toOption(selected));

    const draftables = selected ? await settled(loadDkDraftables(selected.draftGroupId)) : null;
    const comps = draftables?.competitions ?? [];
    const espnComps = espn?.comps ?? [];
    const fdFights = fd?.fights ?? [];

    const fights: UfcFight[] = [];
    if (comps.length) {
      for (const c of comps) {
        const { a, b } = splitFightName(c.name);
        const start = c.startTime || "";
        const card = cardOf(attr(c, 75), start);
        const rounds = Number.parseInt(attr(c, 74), 10) === 5 ? 5 : 3;
        const weight = attr(c, 41) || "Catchweight";
        const espnC = findEspn(espnComps, a, b) ?? findEspn(espnComps, c.homeTeam?.teamName ?? a, c.awayTeam?.teamName ?? b);
        const fdC = fdFights.find((x) => matchFdFight(x, a, b) || matchFdFight(x, c.homeTeam?.teamName ?? a, c.awayTeam?.teamName ?? b));
        const aFull = espnFullName(espnC, a);
        const bFull = espnFullName(espnC, b);
        const aFd = fdSide(fdC, aFull || a);
        const bFd = fdSide(fdC, bFull || b);
        const result = espnResult(espnC);
        fights.push({
          id: String(c.competitionId),
          name: `${a} vs ${b}`,
          card,
          weightClass: weight,
          rounds: (espnC?.format?.regulation?.periods === 5 ? 5 : rounds) as 3 | 5,
          startTime: start,
          venue: espnC?.venue?.fullName || UFC_VENUE,
          aName: aFull || a,
          bName: bFull || b,
          aId: String(c.competitionId) + ":a",
          bId: String(c.competitionId) + ":b",
          aMl: aFd.ml,
          bMl: bFd.ml,
          howEnds: fdC?.howEnds ?? null,
          methodA: aFd.method,
          methodB: bFd.method,
          goDistanceYes: fdC?.goDistanceYes ?? null,
          goDistanceNo: fdC?.goDistanceNo ?? null,
          totalRounds: fdC?.totalRounds ?? null,
          totalOver: fdC?.totalOver ?? null,
          totalUnder: fdC?.totalUnder ?? null,
          books: fdC?.books ?? [],
          winnerName: result.winner,
          resultMethod: result.method,
          resultRound: result.round,
          completed: Boolean(espnC?.status?.type?.completed),
        });
      }
    } else {
      for (const row of UFC_331_FALLBACK) {
        const espnC = findEspn(espnComps, row.a, row.b);
        const fdC = fdFights.find((x) => matchFdFight(x, row.a, row.b));
        const aFd = fdSide(fdC, row.a);
        const bFd = fdSide(fdC, row.b);
        fights.push({
          id: normalizeName(row.a + row.b),
          name: `${lastNameOf(row.a)} vs ${lastNameOf(row.b)}`,
          card: row.card,
          weightClass: row.weight,
          rounds: row.rounds,
          startTime: row.start,
          venue: UFC_VENUE,
          aName: row.a,
          bName: row.b,
          aId: normalizeName(row.a),
          bId: normalizeName(row.b),
          aMl: aFd.ml,
          bMl: bFd.ml,
          howEnds: fdC?.howEnds ?? null,
          methodA: aFd.method,
          methodB: bFd.method,
          goDistanceYes: fdC?.goDistanceYes ?? null,
          goDistanceNo: fdC?.goDistanceNo ?? null,
          totalRounds: fdC?.totalRounds ?? null,
          totalOver: fdC?.totalOver ?? null,
          totalUnder: fdC?.totalUnder ?? null,
          books: fdC?.books ?? [],
          winnerName: null,
          resultMethod: null,
          resultRound: null,
          completed: false,
        });
      }
    }
    fights.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const booked = fights
      .filter((f) => isUfc331Window(f.startTime) && !isUfc331Scratched(f.aName, extra) && !isUfc331Scratched(f.bName, extra))
      .map((f) => {
        const card = ufc331CardOf(f.aName, f.bName, extra);
        return card ? { ...f, card } : null;
      })
      .filter((f): f is UfcFight => f != null);
    fights.splice(0, fights.length, ...booked);
    fights.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const espnIds: string[] = [];
    const espnByName = new Map<string, { id: string; record: string; image: string | null }>();
    for (const c of espnComps) {
      for (const x of c.competitors ?? []) {
        const name = espnName(x);
        const id = x.id || x.athlete?.id;
        if (!name || !id) continue;
        espnIds.push(String(id));
        espnByName.set(normalizeName(name), { id: String(id), record: x.records?.[0]?.summary ?? "", image: x.athlete?.headshot?.href ?? null });
        espnByName.set(normalizeName(lastNameOf(name)), { id: String(id), record: x.records?.[0]?.summary ?? "", image: null });
      }
    }
    const career = await loadCareer([...new Set(espnIds)]);

    const uniqueDk = new Map<string, DkDraftable>();
    const dkRows = (draftables?.draftables ?? []).filter(
      (d) => d.rosterSlotId === UFC_FIGHTER_SLOT || d.rosterSlotId === UFC_CPT_SLOT,
    );
    const showdown = dkRows.some((d) => d.rosterSlotId === UFC_CPT_SLOT);
    for (const d of dkRows) {
      const role = d.rosterSlotId === UFC_CPT_SLOT ? "CPT" : "FLEX";
      const key = showdown ? `${d.playerId}:${role}` : String(d.playerId);
      if (!uniqueDk.has(key)) uniqueDk.set(key, d);
    }

    const players: UfcFighter[] = [];
    const pushFighter = (opts: {
      id: string;
      dkId: number;
      name: string;
      first: string;
      last: string;
      opponent: string;
      fight: UfcFight;
      side: "a" | "b";
      salary: number;
      image: string | null;
      role: UfcFighter["showdownRole"];
    }) => {
      const fight = opts.fight;
      const ml = opts.side === "a" ? fight.aMl : fight.bMl;
      const oppMl = opts.side === "a" ? fight.bMl : fight.aMl;
      let winProb = 0.5;
      if (ml != null && oppMl != null) {
        const { pa } = removeVigPair(ml, oppMl);
        winProb = pa;
      } else if (ml != null) {
        winProb = clamp(americanToProb(ml), 0.08, 0.92);
      }
      const espnRow = espnByName.get(normalizeName(opts.name)) ?? espnByName.get(normalizeName(opts.last));
      const cap = espnRow ? career.get(espnRow.id) : undefined;
      const rec = cap?.record || espnRow?.record || "";
      const parsed = parseRecord(rec);
      const oppEspn = espnByName.get(normalizeName(opts.opponent));
      const oppCap = oppEspn ? career.get(oppEspn.id) : undefined;
      const methods = mixMethods({
        winProb,
        koWins: cap?.ko ?? 0,
        subWins: cap?.sub ?? 0,
        wins: cap?.wins || parsed.wins || 8,
        oppKoLoss: Boolean(oppCap && oppCap.wins + oppCap.losses > 0),
        oppSubLoss: Boolean(oppCap && oppCap.sub > 0),
        rounds: fight.rounds,
        fd: (opts.side === "a" ? fight.methodA : fight.methodB) ?? undefined,
      });
      if (ml == null) winProb = clamp(winProb, 0.28, 0.72);
      const dk = expectedDk({ winProb, pKo: methods.pKo, pSub: methods.pSub, pDec: methods.pDec, rounds: fight.rounds });
      let projection = dk.projection;
      if (opts.role === "CPT") projection = round1(projection * 1.5);
      const salary = opts.salary;
      players.push({
        id: opts.id,
        dkId: opts.dkId,
        espnId: espnRow?.id ?? null,
        name: opts.name,
        firstName: opts.first,
        lastName: opts.last,
        opponent: opts.opponent,
        opponentId: opts.side === "a" ? fight.bId : fight.aId,
        fightId: fight.id,
        fightName: fight.name,
        card: fight.card,
        weightClass: fight.weightClass,
        rounds: fight.rounds,
        startTime: fight.startTime,
        salary,
        winProb: round2(winProb),
        ml,
        pKo: round2(methods.pKo),
        pSub: round2(methods.pSub),
        pDec: round2(methods.pDec),
        projection,
        ceiling: opts.role === "CPT" ? round1(dk.ceiling * 1.5) : dk.ceiling,
        floor: opts.role === "CPT" ? round1(dk.floor * 1.5) : dk.floor,
        value: salary > 0 ? round2(projection / (salary / 1000)) : 0,
        valueRank: 0,
        isValuePlay: false,
        image: opts.image || cap?.image || espnRow?.image || null,
        record: rec || `${parsed.wins}-${parsed.losses}-0`,
        wins: cap?.wins || parsed.wins,
        losses: cap?.losses || parsed.losses,
        koWins: cap?.ko ?? 0,
        subWins: cap?.sub ?? 0,
        rankingMethod: methods.rankingMethod,
        showdownRole: opts.role,
        priced: ml != null,
      });
    };

    if (uniqueDk.size) {
      for (const d of uniqueDk.values()) {
        if (isUfc331Scratched(d.displayName, extra) || !isUfc331BookedName(d.displayName, extra)) continue;
        const gameName = d.competition?.name ?? "";
        if (isUfc331Scratched(gameName, extra)) continue;
        const n = normalizeName(d.displayName);
        const last = normalizeName(d.lastName || lastNameOf(d.displayName));
        const fight = fights.find((f) => {
          const keys = [normalizeName(f.aName), normalizeName(f.bName), normalizeName(lastNameOf(f.aName)), normalizeName(lastNameOf(f.bName))];
          return keys.includes(n) || keys.includes(last) || keys.some((k) => k && (n.includes(k) || k.includes(n) || last === k));
        });
        if (!fight) continue;
        const side: "a" | "b" = normalizeName(fight.aName).includes(n) || normalizeName(lastNameOf(fight.aName)) === last ? "a" : "b";
        const opponent = side === "a" ? fight.bName : fight.aName;
        pushFighter({
          id: showdown ? `${d.playerId}:${d.rosterSlotId === UFC_CPT_SLOT ? "CPT" : "FLEX"}` : String(d.playerId),
          dkId: d.playerDkId,
          name: d.displayName,
          first: d.firstName,
          last: d.lastName,
          opponent,
          fight,
          side,
          salary: d.salary,
          image: d.playerImage160 ?? null,
          role: d.rosterSlotId === UFC_CPT_SLOT ? "CPT" : showdown ? "FLEX" : null,
        });
      }
    } else {
      for (const f of fights) {
        pushFighter({
          id: f.aId,
          dkId: 0,
          name: f.aName,
          first: f.aName.split(" ")[0] ?? f.aName,
          last: lastNameOf(f.aName),
          opponent: f.bName,
          fight: f,
          side: "a",
          salary: 0,
          image: null,
          role: null,
        });
        pushFighter({
          id: f.bId,
          dkId: 0,
          name: f.bName,
          first: f.bName.split(" ")[0] ?? f.bName,
          last: lastNameOf(f.bName),
          opponent: f.aName,
          fight: f,
          side: "b",
          salary: 0,
          image: null,
          role: null,
        });
      }
    }

    const kept = players.filter(
      (p) =>
        isUfc331BookedName(p.name, extra) &&
        !isUfc331Scratched(p.name, extra) &&
        !isUfc331Scratched(p.opponent, extra) &&
        ufc331CardOf(p.name, p.opponent, extra) != null,
    );
    players.splice(0, players.length, ...kept);

    const allPlayers = [...players];
    markValues(allPlayers);
    const mainPlayers = players.filter((p) => p.card === "main");
    const board = mainPlayers.length ? mainPlayers : players;
    for (const p of board) {
      p.valueRank = 0;
      p.isValuePlay = false;
    }
    markValues(board);
    board.sort((a, b) => b.projection - a.projection || b.salary - a.salary);

    const salariesPosted = board.some((p) => p.salary > 0);
    const format = board.some((p) => p.showdownRole === "CPT") ? "showdown" : "classic";
    const notice = emptyNotice(board.length, salariesPosted) ?? (fd && !fd.ok ? "FanDuel odds 403/empty — card is up, bets stay empty until prices post." : null);

    const value: UfcSlateData = {
      ok: true,
      sport: "UFC",
      eventId: UFC_EVENT_ID,
      eventName: espn?.eventName?.includes("331") ? espn.eventName : `${UFC_EVENT_NAME}: ${UFC_HEADLINE}`,
      headline: UFC_HEADLINE,
      venue: espn?.venue || UFC_VENUE,
      fetchedAt: new Date().toISOString(),
      nextRefreshAt: new Date(Date.now() + ttl).toISOString(),
      draftGroupId: selected?.draftGroupId ?? 0,
      salaryCap: UFC_CAP,
      slateLabel: "Main card",
      format,
      slates: slates.length
        ? slates
        : [
            {
              draftGroupId: 0,
              label: "UFC 331",
              suffix: "Main card",
              title: "UFC 331",
              subtitle: UFC_HEADLINE,
              startTime: fights[0]?.startTime ?? "",
              gameCount: fights.filter((f) => f.card === "main").length,
              format: "classic",
            },
          ],
      fights,
      players: board,
      allPlayers,
      sources: [
        { id: "draftkings", label: "DraftKings", ok: salariesPosted, players: board.filter((p) => p.salary > 0).length },
        { id: "espn", label: "ESPN", ok: espnComps.length > 0, players: espnComps.length },
        { id: "fanduel", label: "FanDuel", ok: Boolean(fd?.ok), players: fdFights.length },
      ],
      notice,
      salariesPosted,
      cardTrust: {
        checkedAt: news.checkedAt,
        trustedSource: news.trustedSource,
        trustedDate: news.trustedDate,
        trustedTitle: news.trustedTitle,
        scratchedKeys: extra,
        note: news.note,
      },
    };
    store.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    return { ok: false, sport: "UFC", error: raw || "Could not load UFC 331." };
  }
}
