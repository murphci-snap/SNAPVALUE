import {
  loadStampedBets,
  maybeStampUfcDesk,
  parseUnits,
  recordSettledBets,
  type GradeResult,
  type GradedBet,
  type StampedBet,
} from "@/lib/dfs/bet-ledger";
import type { UfcBet, UfcFight } from "./types";

function pnlOf(result: GradeResult, unit: number): number {
  if (result === "win") return unit;
  if (result === "loss") return -unit;
  return 0;
}

function fightOf(fights: UfcFight[], id: string): UfcFight | undefined {
  return fights.find((f) => f.id === id);
}

function fightReady(f: UfcFight): boolean {
  // Prefer ESPN completed; also accept winner when status flag lags
  return (f.completed || Boolean(f.winnerName)) && Boolean(f.winnerName);
}

function fighterHit(winner: string, fighter?: string): boolean {
  if (!fighter) return true;
  const w = winner.toLowerCase();
  const f = fighter.toLowerCase();
  return w.includes(f) || f.includes(w) || w.split(" ").pop() === f.split(" ").pop();
}

function gradeLeg(kind: string, fighter: string | undefined, f: UfcFight): GradeResult | null {
  if (!fightReady(f)) return null;
  if (!f.resultMethod && (kind === "ko" || kind === "sub" || kind === "dec")) return null;
  const want =
    kind === "sub" || /submission|\bsub\b/i.test(kind)
      ? "sub"
      : kind === "ko" || /ko|tko/i.test(kind)
        ? "ko"
        : kind === "dec" || /decision|points/i.test(kind)
          ? "dec"
          : null;
  if (!want) return fighterHit(f.winnerName!, fighter) ? "win" : "loss";
  return fighterHit(f.winnerName!, fighter) && f.resultMethod === want ? "win" : "loss";
}

function gradeBet(bet: UfcBet, fights: UfcFight[]): GradeResult | null {
  if ((bet.market === "trifecta" || bet.market === "lotto_parlay") && bet.legs?.length) {
    const results: Array<GradeResult | null> = bet.legs.map((leg) => {
      const f = fightOf(fights, leg.fightId);
      if (!f) return null;
      return gradeLeg(leg.kind, leg.fighter, f);
    });
    if (results.some((r) => r === "loss")) return "loss";
    if (results.every((r) => r === "win")) return "win";
    return null;
  }
  const f = fightOf(fights, bet.fightId);
  if (!f || !fightReady(f)) return null;
  const pick = bet.pick.toLowerCase();
  const winner = f.winnerName!.toLowerCase();
  if (bet.market === "moneyline" || (bet.market === "lotto" && /ml/i.test(bet.pick))) {
    return pick.includes(winner.split(" ").pop() ?? winner) || pick.includes(winner) ? "win" : "loss";
  }
  if (bet.market === "distance") {
    if (f.resultMethod == null) return null;
    const went = f.resultMethod === "dec";
    if (/^yes/i.test(bet.pick) || /goes the distance/i.test(bet.title)) return went ? "win" : "loss";
    return went ? "loss" : "win";
  }
  if (bet.market === "method" || bet.market === "trifecta") {
    if (!f.resultMethod) return null;
    const want = /submission|\bsub\b/i.test(pick)
      ? "sub"
      : /ko|tko/i.test(pick)
        ? "ko"
        : /decision|points/i.test(pick)
          ? "dec"
          : null;
    if (!want) {
      return pick.includes(winner.split(" ").pop() ?? winner) ? "win" : "loss";
    }
    const hit = fighterHit(f.winnerName!, bet.fighter);
    if (/fight ends/i.test(bet.title)) return f.resultMethod === want ? "win" : "loss";
    return hit && f.resultMethod === want ? "win" : "loss";
  }
  if (bet.market === "rounds" && f.resultRound != null && f.totalRounds != null) {
    const over = /over/i.test(bet.pick);
    const line = f.totalRounds;
    const actual = f.resultRound;
    if (Math.abs(actual - line) < 0.05) return "push";
    return over ? (actual > line ? "win" : "loss") : actual < line ? "win" : "loss";
  }
  // Lotto method picks without "ml"
  if (bet.market === "lotto" && bet.fighter) {
    if (!f.resultMethod) return fighterHit(f.winnerName!, bet.fighter) ? "win" : "loss";
    const want = /submission|\bsub\b/i.test(pick) ? "sub" : /ko|tko/i.test(pick) ? "ko" : null;
    if (!want) return fighterHit(f.winnerName!, bet.fighter) ? "win" : "loss";
    return fighterHit(f.winnerName!, bet.fighter) && f.resultMethod === want ? "win" : "loss";
  }
  return null;
}

function stampedToUfcBet(s: StampedBet): UfcBet {
  return {
    id: s.id,
    title: s.title ?? s.pick,
    market: s.market as UfcBet["market"],
    pick: s.pick,
    line: s.line ?? "",
    why: "",
    tape: "",
    unit: s.unit,
    books: "",
    edge: 0,
    confidence: 0,
    priced: true,
    fightId: s.fightId ?? "",
    fighter: s.fighter,
    legs: s.ufcLegs?.map((l) => ({
      kind: l.kind as "ko" | "sub" | "dec" | "ml",
      fighter: l.fighter,
      fightName: "",
      fightId: l.fightId,
      line: "",
      american: l.american ?? null,
      priced: true,
      model: 0,
      why: "",
    })),
  };
}

export function settleUfcBets(opts: {
  bets: UfcBet[];
  fights: UfcFight[];
  eventId: number;
  season: number;
}): GradedBet[] {
  maybeStampUfcDesk({
    bets: opts.bets.map((b) => ({
      id: b.id,
      market: b.market,
      pick: b.pick,
      unit: b.unit,
      title: b.title,
      line: b.line,
      fightId: b.fightId,
      fighter: b.fighter,
      legs: b.legs?.map((l) => ({
        kind: l.kind,
        fighter: l.fighter,
        fightId: l.fightId,
        american: l.american,
      })),
    })),
    fightStartTimes: opts.fights.map((f) => f.startTime).filter(Boolean),
    eventId: opts.eventId,
    season: opts.season,
  });

  const stamped = loadStampedBets({ sport: "UFC", eventId: opts.eventId, season: opts.season });
  const stampedIds = new Set(stamped.map((s) => s.id));
  const pool: UfcBet[] = [
    ...stamped.map(stampedToUfcBet),
    ...opts.bets.filter((b) => !stampedIds.has(b.id)),
  ];

  const fresh: GradedBet[] = [];
  for (const b of pool) {
    const result = gradeBet(b, opts.fights);
    if (!result) continue;
    const unit = parseUnits(b.unit);
    if (unit <= 0) continue;
    fresh.push({
      id: b.id,
      week: opts.eventId,
      season: opts.season,
      market: b.market,
      pick: b.pick,
      unit,
      result,
      pnl: pnlOf(result, unit),
      settledAt: new Date().toISOString(),
      sport: "UFC",
      eventId: String(opts.eventId),
    });
  }
  return recordSettledBets(fresh);
}
