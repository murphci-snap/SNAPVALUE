import type { MatchupQuality, Position, PropLine, SeasonStats, WeekProjection } from "./types";
import { S } from "./constants";

export function num(stats: Record<string, number> | undefined, id: number): number {
  if (!stats) return 0;
  const v = stats[String(id)];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function paBonus(pointsAllowed: number): number {
  if (pointsAllowed < 0.5) return 10;
  if (pointsAllowed <= 6) return 7;
  if (pointsAllowed <= 13) return 4;
  if (pointsAllowed <= 20) return 1;
  if (pointsAllowed <= 27) return 0;
  if (pointsAllowed <= 34) return -1;
  return -4;
}

export function dkFromWeek(p: WeekProjection, position: Position): number {
  if (position === "K") return Math.max(p.espnPpr, 7);
  if (position === "DST") {
    return (
      p.sacks * 1 +
      p.defInt * 2 +
      p.fumRec * 2 +
      p.defTd * 6 +
      paBonus(p.ptsAllowed)
    );
  }
  let pts =
    p.passYds * 0.04 +
    p.passTd * 4 +
    p.interceptions * -1 +
    p.rushYds * 0.1 +
    p.rushTd * 6 +
    p.recYds * 0.1 +
    p.receptions * 1 +
    p.recTd * 6;
  if (p.passYds >= 300) pts += 3;
  if (p.rushYds >= 100) pts += 3;
  if (p.recYds >= 100) pts += 3;
  return pts;
}

export function weekFromEspn(stats: Record<string, number> | undefined): WeekProjection {
  const receptions = Math.max(num(stats, S.receptions), num(stats, S.recCatch));
  const recYds = num(stats, S.recYds) || num(stats, S.recYdsAlt);
  return {
    passYds: num(stats, S.passYds),
    passTd: num(stats, S.passTd),
    interceptions: num(stats, S.int),
    rushYds: num(stats, S.rushYds),
    rushTd: num(stats, S.rushTd),
    receptions,
    recYds,
    recTd: num(stats, S.recTd),
    sacks: num(stats, S.sacks),
    defInt: num(stats, S.defInt),
    fumRec: num(stats, S.fumRec),
    defTd: num(stats, S.defTd) + num(stats, S.defTdAlt),
    ptsAllowed: num(stats, S.ptsAllowed),
    espnPpr: 0,
    dk: 0,
  };
}

export function seasonFromEspn(
  stats: Record<string, number> | undefined,
  applied: number,
): SeasonStats {
  const games = num(stats, S.games) || 0;
  const receptions = Math.max(num(stats, S.receptions), num(stats, S.recCatch));
  const recYds = num(stats, S.recYds) || num(stats, S.recYdsAlt);
  const fantasyPts = applied;
  return {
    games,
    passAtt: num(stats, S.passAtt),
    passCmp: num(stats, S.passCmp),
    passYds: num(stats, S.passYds),
    passTd: num(stats, S.passTd),
    interceptions: num(stats, S.int),
    rushAtt: num(stats, S.rushAtt),
    rushYds: num(stats, S.rushYds),
    rushTd: num(stats, S.rushTd),
    targets: num(stats, S.targets),
    receptions,
    recYds,
    recTd: num(stats, S.recTd),
    fumblesLost: num(stats, S.fumLost),
    fantasyPts,
    fantasyPpg: games > 0 ? fantasyPts / games : 0,
    sacks: num(stats, S.sacks),
    defInt: num(stats, S.defInt),
    fumRec: num(stats, S.fumRec),
    defTd: num(stats, S.defTd) + num(stats, S.defTdAlt),
    ptsAllowed: num(stats, S.ptsAllowed),
    ydsAllowed: num(stats, S.ydsAllowed),
  };
}

export function matchupMultiplier(rank: number, quality: MatchupQuality): number {
  if (quality === "High" || rank >= 24) return 1.08;
  if (rank >= 20) return 1.05;
  if (rank >= 16) return 1.02;
  if (quality === "Low" || rank <= 8) return 0.94;
  if (rank <= 12) return 0.97;
  return 1;
}

export function emptyWeek(): WeekProjection {
  return {
    passYds: 0,
    passTd: 0,
    interceptions: 0,
    rushYds: 0,
    rushTd: 0,
    receptions: 0,
    recYds: 0,
    recTd: 0,
    sacks: 0,
    defInt: 0,
    fumRec: 0,
    defTd: 0,
    ptsAllowed: 0,
    espnPpr: 0,
    dk: 0,
  };
}

export function fillWeek(base: WeekProjection, extra: Partial<WeekProjection> | null | undefined): WeekProjection {
  if (!extra) return base;
  const out = { ...base };
  (Object.keys(out) as (keyof WeekProjection)[]).forEach((k) => {
    const ev = extra[k];
    if (typeof ev === "number" && Number.isFinite(ev) && ev !== 0 && !out[k]) {
      out[k] = ev;
    }
  });
  return out;
}


export function americanToProb(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 0;
  if (american > 0) return 100 / (american + 100);
  return -american / (-american + 100);
}

/** Poisson-ish expected TDs from P(at least one). */
export function expectedTdsFromAnytime(p: number): number {
  if (p <= 0) return 0;
  if (p >= 0.97) return 2.2;
  return -Math.log(1 - Math.min(0.95, p));
}

export function expectedBonus(passYds: number, rushYds: number, recYds: number): number {
  let pts = 0;
  if (passYds >= 270) pts += Math.min(3, ((passYds - 250) / 50) * 3);
  if (rushYds >= 85) pts += Math.min(3, ((rushYds - 70) / 30) * 3);
  if (recYds >= 85) pts += Math.min(3, ((recYds - 70) / 30) * 3);
  return pts;
}

export function dkFromProps(line: PropLine, position: Position): { points: number; complete: boolean } {
  const passYds = line.passYds ?? 0;
  const passTd = line.passTd ?? 0;
  const ints = line.interceptions ?? 0;
  const rushYds = line.rushYds ?? 0;
  const recYds = line.recYds ?? 0;
  const rec = line.receptions ?? 0;
  let rushTd = line.rushTd ?? 0;
  let recTd = line.recTd ?? 0;
  const atd = line.anytimeTd;

  if (atd != null && rushTd + recTd < 0.15) {
    const exp = expectedTdsFromAnytime(atd);
    if (position === "QB") rushTd = Math.max(rushTd, exp);
    else if (position === "RB") {
      rushTd = Math.max(rushTd, exp * 0.72);
      recTd = Math.max(recTd, exp * 0.28);
    } else {
      recTd = Math.max(recTd, exp);
    }
  }

  let pts =
    passYds * 0.04 +
    passTd * 4 +
    ints * -1 +
    rushYds * 0.1 +
    rushTd * 6 +
    recYds * 0.1 +
    rec * 1 +
    recTd * 6 +
    expectedBonus(passYds, rushYds, recYds);

  const hasYards =
    (position === "QB" && (line.passYds != null || line.rushYds != null)) ||
    (position === "RB" && (line.rushYds != null || line.recYds != null)) ||
    ((position === "WR" || position === "TE") && (line.recYds != null || line.receptions != null));
  const hasTd = line.passTd != null || line.rushTd != null || line.recTd != null || line.anytimeTd != null;
  return { points: Math.max(0, pts), complete: Boolean(hasYards && hasTd) };
}

export function mean(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n) && n > 0);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** Drop tails, then average. 2-site boards just average. */
export function trimmedMean(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  if (xs.length === 1) return xs[0]!;
  if (xs.length === 2) return (xs[0]! + xs[1]!) / 2;
  const med = median(xs);
  if (med == null) return mean(xs);
  const tight = xs.filter((n) => Math.abs(n - med) <= Math.max(8, med * 0.4));
  const use = tight.length >= 2 ? tight : xs.slice(1, xs.length - 1);
  return use.reduce((a, b) => a + b, 0) / use.length;
}

export type SiteScore = { id: string; points: number };

/**
 * Weekly consensus: CBS / FP / RotoWire first. Yahoo DFS fppg is last-resort
 * and dropped when it disagrees with CBS (or the weekly median) by >8 pts.
 */
export function robustSiteConsensus(sites: SiteScore[]): number | null {
  const clean = sites.filter((s) => Number.isFinite(s.points) && s.points > 0.5 && s.points < 52);
  if (!clean.length) return null;
  const yahoo = clean.find((s) => s.id === "yahoo");
  const cbs = clean.find((s) => s.id === "cbs");
  const weekly = clean.filter((s) => s.id !== "yahoo");
  let keep = clean;
  if (yahoo && cbs && Math.abs(yahoo.points - cbs.points) > 8) keep = weekly;
  else if (yahoo && weekly.length) {
    const med = median(weekly.map((s) => s.points));
    if (med != null && Math.abs(yahoo.points - med) > 8) keep = weekly;
  }
  const preferred = keep.filter((s) => s.id !== "yahoo");
  const use = preferred.length ? preferred : keep;
  const pts = use.map((s) => s.points);
  if (pts.length >= 3) return median(pts) ?? trimmedMean(pts);
  return trimmedMean(pts);
}

const ESPN_OUT = /\b(out|ir|doubtful|suspended|pup|nfi|injury.?reserve|injured.?reserve)\b/i;
const DK_OUT = /^(out|o|ir|d|doubtful|suspended|pup|nfi)$/i;

/** ESPN OUT/IR/Doubtful wins even if DK says Q. */
export function isSidelined(injury?: string | null, status?: string | null): boolean {
  const inj = (injury ?? "").trim();
  const st = (status ?? "").trim();
  if (inj && ESPN_OUT.test(inj)) return true;
  if (st && (DK_OUT.test(st) || ESPN_OUT.test(st))) return true;
  return false;
}

export function isQuestionable(injury?: string | null, status?: string | null): boolean {
  if (isSidelined(injury, status)) return false;
  const blob = `${injury ?? ""} ${status ?? ""}`;
  return /\b(questionable|gtd|game.?time)\b/i.test(blob) || /^(q|gtd)$/i.test((status ?? "").trim());
}

export const Q_HAIRCUT = 0.88;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
