import { parseUnits, recordSettledBets, type GradeResult, type GradedBet } from "@/lib/dfs/bet-ledger";
import type { UfcBet, UfcFight } from "./types";

function pnlOf(result: GradeResult, unit: number): number {
  if (result === "win") return unit;
  if (result === "loss") return -unit;
  return 0;
}

function fightOf(fights: UfcFight[], id: string): UfcFight | undefined {
  return fights.find((f) => f.id === id);
}

function winnerOf(f: UfcFight): string | null {
  return f.winnerName;
}

function gradeBet(bet: UfcBet, fights: UfcFight[]): GradeResult | null {
  const f = fightOf(fights, bet.fightId);
  if (!f || !f.completed || !f.winnerName) return null;
  const pick = bet.pick.toLowerCase();
  const winner = f.winnerName.toLowerCase();
  if (bet.market === "moneyline" || (bet.market === "lotto" && /ml/i.test(bet.pick))) {
    return pick.includes(winner.split(" ").pop() ?? winner) || pick.includes(winner) ? "win" : "loss";
  }
  if (bet.market === "distance") {
    const went = f.resultMethod === "dec";
    if (f.resultMethod == null) return null;
    if (/^yes/i.test(bet.pick) || /goes the distance/i.test(bet.title)) return went ? "win" : "loss";
    return went ? "loss" : "win";
  }
  if (bet.market === "method" || bet.market === "trifecta") {
    if (!f.resultMethod) return null;
    const want = /submission|\bsub\b/i.test(pick) ? "sub" : /ko|tko/i.test(pick) ? "ko" : /decision|points/i.test(pick) ? "dec" : null;
    if (!want) {
      return pick.includes(winner.split(" ").pop() ?? winner) ? "win" : "loss";
    }
    const fighterHit = !bet.fighter || winner.includes(bet.fighter.toLowerCase()) || bet.fighter.toLowerCase().includes(winner);
    if (/fight ends/i.test(bet.title)) return f.resultMethod === want ? "win" : "loss";
    return fighterHit && f.resultMethod === want ? "win" : "loss";
  }
  if (bet.market === "rounds" && f.resultRound != null && f.totalRounds != null) {
    const over = /over/i.test(bet.pick);
    const line = f.totalRounds;
    const actual = f.resultRound;
    if (Math.abs(actual - line) < 0.05) return "push";
    return over ? (actual > line ? "win" : "loss") : actual < line ? "win" : "loss";
  }
  return null;
}

export function settleUfcBets(opts: {
  bets: UfcBet[];
  fights: UfcFight[];
  eventId: number;
  season: number;
}): GradedBet[] {
  const fresh: GradedBet[] = [];
  for (const b of opts.bets) {
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
