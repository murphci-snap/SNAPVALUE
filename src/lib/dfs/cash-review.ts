import { gamePhase } from "./markets";
import type { ContestStyle } from "./optimizer";
import { round1 } from "./scoring";
import type { Lineup, LineupPlayer, Player, SlateFormat } from "./types";

export type CashVerdict = "cash" | "miss" | "borderline" | "live" | "pending";

export interface CashBand {
  line: number;
  cushion: number;
  label: string;
  source: "estimate";
}

export interface LineupReview {
  actual: number | null;
  projected: number;
  delta: number | null;
  scored: number;
  pending: number;
  live: number;
  roster: number;
  verdict: CashVerdict;
  line: number;
  lineLabel: string;
}

function slotActual(lp: LineupPlayer): number | null {
  const a = lp.player.actualDk;
  if (a == null || !Number.isFinite(a)) return null;
  return lp.slot === "CPT" ? round1(a * 1.5) : a;
}

function playerPhase(p: Player, now: number): "pre" | "live" | "final" {
  return gamePhase(p.startTime, now);
}

/** Industry ballpark for $50k Classic / Showdown — not official DK payouts. */
export function cashBand(style: ContestStyle, format: SlateFormat, gameCount: number): CashBand {
  if (format === "showdown") {
    if (style === "milly") return { line: 48, cushion: 4, label: "Showdown GPP min-cash (est.)", source: "estimate" };
    return { line: 37, cushion: 3, label: "Showdown Dual/50-50 (est.)", source: "estimate" };
  }
  const g = Math.max(1, gameCount);
  const factor = Math.min(1.12, Math.max(0.5, g / 13));
  if (style === "milly") {
    return { line: round1(158 * factor), cushion: 8, label: "Milly min-cash (est.)", source: "estimate" };
  }
  if (style === "single") {
    return { line: round1(145 * factor), cushion: 6, label: "Single-entry GPP min-cash (est.)", source: "estimate" };
  }
  return { line: round1(128 * factor), cushion: 5, label: "Double Up / cash (est.)", source: "estimate" };
}

export function reviewLineup(
  lu: Lineup,
  style: ContestStyle,
  format: SlateFormat,
  gameCount: number,
  now = Date.now(),
): LineupReview {
  const band = cashBand(style, format, gameCount);
  let actualSum = 0;
  let scored = 0;
  let pending = 0;
  let live = 0;
  for (const lp of lu.players) {
    const phase = playerPhase(lp.player, now);
    const pts = slotActual(lp);
    if (pts != null) {
      actualSum += pts;
      scored += 1;
      if (phase === "live") live += 1;
    } else if (phase === "pre") pending += 1;
    else if (phase === "live") live += 1;
    else pending += 1;
  }
  const roster = lu.players.length;
  const have = scored + live;
  const actual = have > 0 ? round1(actualSum) : null;
  const delta = actual != null ? round1(actual - lu.projection) : null;

  let verdict: CashVerdict = "pending";
  if (scored === roster && pending === 0 && live === 0) {
    if (actual! >= band.line) verdict = "cash";
    else if (actual! >= band.line - band.cushion) verdict = "borderline";
    else verdict = "miss";
  } else if (actual != null && actual >= band.line && pending === 0) {
    verdict = "cash";
  } else if (live > 0 || (scored > 0 && pending > 0)) {
    verdict = "live";
  }

  return {
    actual,
    projected: lu.projection,
    delta,
    scored,
    pending,
    live,
    roster,
    verdict,
    line: band.line,
    lineLabel: band.label,
  };
}

export function slateReviewReady(players: Player[], now = Date.now()): boolean {
  return players.some((p) => p.actualDk != null || gamePhase(p.startTime, now) !== "pre");
}