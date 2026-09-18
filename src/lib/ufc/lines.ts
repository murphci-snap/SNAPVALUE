import { getJson, poolMap, settled } from "@/lib/dfs/http";
import { americanToProb } from "@/lib/dfs/scoring";
import { normalizeName } from "@/lib/utils";
import { FD_AK, FD_UFC_EVENT_TYPE } from "./constants";
import { lastNameOf } from "./scoring";
import type { UfcMethodMarket } from "./types";

const FD_HEADERS = {
  Origin: "https://sportsbook.fanduel.com",
  Referer: "https://sportsbook.fanduel.com/mma",
};

type FdEvent = {
  eventId?: string | number;
  name?: string;
  startTime?: string;
  openDate?: string;
};

type FdRunner = {
  runnerName?: string;
  handicap?: number;
  winRunnerOdds?: { americanDisplayOdds?: { americanOdds?: number } };
};

type FdMarket = {
  marketType?: string;
  marketName?: string;
  eventId?: string | number;
  runners?: FdRunner[];
};

export type UfcFdFight = {
  eventId: string;
  name: string;
  startTime: string;
  aName: string;
  bName: string;
  aMl: number | null;
  bMl: number | null;
  howEnds: UfcMethodMarket | null;
  methodA: UfcMethodMarket | null;
  methodB: UfcMethodMarket | null;
  goDistanceYes: number | null;
  goDistanceNo: number | null;
  totalRounds: number | null;
  totalOver: number | null;
  totalUnder: number | null;
  books: string[];
};

function amer(r?: FdRunner): number | null {
  const n = r?.winRunnerOdds?.americanDisplayOdds?.americanOdds;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function splitVs(name: string): { a: string; b: string } | null {
  const m = name.split(/\s+v(?:s\.?)?\s+/i);
  if (m.length >= 2 && m[0] && m[1]) return { a: m[0].trim(), b: m[1].trim() };
  return null;
}

function inUfc331Window(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  // Fri Sep 18 12:00Z through Sun Sep 21 12:00Z
  return t >= Date.parse("2026-09-18T12:00:00Z") && t <= Date.parse("2026-09-21T12:00:00Z");
}

function methodFromRunners(runners: FdRunner[], fighter: string): UfcMethodMarket {
  const n = normalizeName(fighter);
  const last = normalizeName(lastNameOf(fighter));
  const hit = (r: FdRunner, kind: string) => {
    const raw = (r.runnerName ?? "").toLowerCase();
    const mine = normalizeName(r.runnerName ?? "").includes(n) || normalizeName(r.runnerName ?? "").includes(last);
    if (!mine) return null;
    if (kind === "ko" && /ko|tko|knockout/.test(raw)) return amer(r);
    if (kind === "sub" && /sub/.test(raw)) return amer(r);
    if (kind === "dec" && /point|decision/.test(raw)) return amer(r);
    return null;
  };
  return {
    ko: runners.reduce<number | null>((acc, r) => acc ?? hit(r, "ko"), null),
    sub: runners.reduce<number | null>((acc, r) => acc ?? hit(r, "sub"), null),
    dec: runners.reduce<number | null>((acc, r) => acc ?? hit(r, "dec"), null),
    books: ["FanDuel"],
  };
}

function howEnds(runners: FdRunner[]): UfcMethodMarket {
  const pick = (re: RegExp) => amer(runners.find((r) => re.test(r.runnerName ?? "")));
  return {
    ko: pick(/ko|tko|knockout/i),
    sub: pick(/sub/i),
    dec: pick(/point|decision/i),
    books: ["FanDuel"],
  };
}

function parseMarkets(event: FdEvent, markets: FdMarket[]): UfcFdFight | null {
  const name = (event.name ?? "").trim();
  const vs = splitVs(name);
  if (!vs) return null;
  const start = event.startTime || event.openDate || "";
  const out: UfcFdFight = {
    eventId: String(event.eventId ?? ""),
    name,
    startTime: start,
    aName: vs.a,
    bName: vs.b,
    aMl: null,
    bMl: null,
    howEnds: null,
    methodA: null,
    methodB: null,
    goDistanceYes: null,
    goDistanceNo: null,
    totalRounds: null,
    totalOver: null,
    totalUnder: null,
    books: ["FanDuel"],
  };
  for (const m of markets) {
    const t = (m.marketType ?? "").toUpperCase();
    const runners = m.runners ?? [];
    if (t === "MATCH_BETTING" || t.includes("MONEYLINE")) {
      for (const r of runners) {
        const rn = normalizeName(r.runnerName ?? "");
        if (rn === normalizeName(vs.a) || rn.includes(normalizeName(lastNameOf(vs.a)))) out.aMl = amer(r) ?? out.aMl;
        if (rn === normalizeName(vs.b) || rn.includes(normalizeName(lastNameOf(vs.b)))) out.bMl = amer(r) ?? out.bMl;
      }
    }
    if (t === "HOW_FIGHT_WILL_END") out.howEnds = howEnds(runners);
    if (t === "METHOD_OF_VICTORY") {
      out.methodA = methodFromRunners(runners, vs.a);
      out.methodB = methodFromRunners(runners, vs.b);
    }
    if (t.includes("GO_THE_DISTANCE") || t.includes("GO_THE_DISTANCE?")) {
      out.goDistanceYes = amer(runners.find((r) => /^yes$/i.test(r.runnerName ?? ""))) ?? out.goDistanceYes;
      out.goDistanceNo = amer(runners.find((r) => /^no$/i.test(r.runnerName ?? ""))) ?? out.goDistanceNo;
    }
    if (t === "TOTAL_ROUNDS" || t.includes("TOTAL_ROUND")) {
      const over = runners.find((r) => /over/i.test(r.runnerName ?? ""));
      const under = runners.find((r) => /under/i.test(r.runnerName ?? ""));
      if (typeof over?.handicap === "number") out.totalRounds = over.handicap;
      else if (typeof under?.handicap === "number") out.totalRounds = under.handicap;
      out.totalOver = amer(over);
      out.totalUnder = amer(under);
    }
  }
  return out;
}

export function matchFdFight(row: UfcFdFight, a: string, b: string): boolean {
  const names = [normalizeName(row.aName), normalizeName(row.bName)];
  const want = [normalizeName(a), normalizeName(b)];
  const lasts = [normalizeName(lastNameOf(row.aName)), normalizeName(lastNameOf(row.bName))];
  const wantLast = [normalizeName(lastNameOf(a)), normalizeName(lastNameOf(b))];
  return want.every((n) => names.some((x) => x === n || x.includes(n) || n.includes(x)))
    || wantLast.every((n) => lasts.includes(n));
}

export async function loadUfcFd(): Promise<{ fights: UfcFdFight[]; ok: boolean }> {
  const page = await settled(
    getJson<{ attachments?: { events?: Record<string, FdEvent>; markets?: Record<string, FdMarket> } }>(
      `https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page?page=SPORT&eventTypeId=${FD_UFC_EVENT_TYPE}&_ak=${FD_AK}`,
      { headers: FD_HEADERS },
      12000,
    ),
  );
  const events = Object.values(page?.attachments?.events ?? {}).filter((e): e is FdEvent => Boolean(e?.name));
  const listing = Object.values(page?.attachments?.markets ?? {});
  const live = events.filter((e) => inUfc331Window(e.startTime || e.openDate || ""));
  const byEvent = new Map<string, FdMarket[]>();
  for (const m of listing) {
    const id = String(m.eventId ?? "");
    const arr = byEvent.get(id) ?? [];
    arr.push(m);
    byEvent.set(id, arr);
  }

  await poolMap(
    live.slice(0, 14),
    4,
    async (e) => {
      const id = String(e.eventId ?? "");
      const extra = await settled(
        getJson<{ attachments?: { markets?: Record<string, FdMarket> } }>(
          `https://sbapi.nj.sportsbook.fanduel.com/api/event-page?eventId=${id}&tab=popular&_ak=${FD_AK}`,
          { headers: FD_HEADERS },
          9000,
        ),
      );
      const more = Object.values(extra?.attachments?.markets ?? {});
      if (more.length) {
        const cur = byEvent.get(id) ?? [];
        byEvent.set(id, [...cur, ...more]);
      }
    },
    16000,
  );

  const fights: UfcFdFight[] = [];
  for (const e of live) {
    const parsed = parseMarkets(e, byEvent.get(String(e.eventId ?? "")) ?? []);
    if (parsed) fights.push(parsed);
  }
  return { fights, ok: fights.length > 0 };
}

export function methodProb(market: UfcMethodMarket | null, kind: "ko" | "sub" | "dec"): number | null {
  if (!market) return null;
  const one = kind === "ko" ? market.ko : kind === "sub" ? market.sub : market.dec;
  if (one == null) return null;
  // Fighter method tickets are not a closed 3-way (opponent methods still exist).
  return americanToProb(one);
}
