import { mulberry32 } from "@/lib/utils";
import { UFC_CAP, UFC_ROSTER, UFC_SHOWDOWN_ROSTER } from "./constants";
import { cashScore, gppScore } from "./scoring";
import type { UfcFighter, UfcLineup, UfcRole, UfcSlot } from "./types";

export type UfcContest = "cash" | "gpp";

export const UFC_CONTEST_META: Record<UfcContest, { label: string; blurb: string }> = {
  cash: {
    label: "Cash / Double Up",
    blurb: "Favorites and decision volume. Win is the points. Chalk is fine. $50k · 6 fighters.",
  },
  gpp: {
    label: "GPP / Tourney",
    blurb: "Finish upside. Don’t roster both sides of a 3-round fight. 5-round stack is the exception. $50k · 6 fighters.",
  },
};

function rosterFor(players: UfcFighter[]): { slot: UfcSlot }[] {
  return players.some((p) => p.showdownRole === "CPT") ? UFC_SHOWDOWN_ROSTER : UFC_ROSTER;
}

function remainingMin(n: number, pool: UfcFighter[], used: Set<string>, cpt: boolean): number {
  const rest = [...pool].filter((p) => !used.has(p.id) && (!cpt || p.showdownRole !== "CPT")).sort((a, b) => a.salary - b.salary);
  return rest.slice(0, n).reduce((s, p) => s + p.salary, 0);
}

function paired(a: UfcFighter, b: UfcFighter): boolean {
  return a.fightId === b.fightId && a.id !== b.id;
}

function weight(style: UfcContest, p: UfcFighter, chosen: UfcFighter[], rng: () => number): number {
  const both = chosen.some((c) => paired(c, p));
  if (style === "cash") {
    if (both && p.rounds < 5) return 0.0001;
    return Math.max(0.0001, cashScore(p) * (0.92 + rng() * 0.12));
  }
  if (both && p.rounds < 5) return 0.0001;
  if (both && p.rounds === 5) return gppScore(p) * 0.55 * (0.6 + rng() * 0.5);
  return Math.max(0.0001, gppScore(p) * (0.5 + rng() * 0.9));
}

function pickOne(cands: UfcFighter[], w: number[], rng: () => number): UfcFighter {
  const total = w.reduce((s, x) => s + x, 0);
  let r = rng() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= w[i]!;
    if (r <= 0) return cands[i]!;
  }
  return cands[cands.length - 1]!;
}

function buildOne(pool: UfcFighter[], locks: UfcFighter[], rng: () => number, contest: UfcContest, showdown: boolean): UfcLineup | null {
  const slots = showdown ? UFC_SHOWDOWN_ROSTER : UFC_ROSTER;
  const used = new Set<string>();
  const chosen: { slot: UfcSlot; player: UfcFighter }[] = [];
  let salary = 0;
  const lockedCpt = locks.find((p) => p.showdownRole === "CPT");
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const left = slots.length - i - 1;
    const leftover = (c: UfcFighter) => {
      const next = new Set(used);
      next.add(c.id);
      return UFC_CAP - salary - c.salary - remainingMin(left, pool, next, showdown && slot.slot === "CPT");
    };
    const needCpt = slot.slot === "CPT";
    let pick: UfcFighter | null = null;
    if (needCpt && lockedCpt && leftover(lockedCpt) >= 0) pick = lockedCpt;
    if (!pick) {
      const lockedFit = locks.find((p) => !used.has(p.id) && leftover(p) >= 0 && (needCpt ? p.showdownRole === "CPT" : p.showdownRole !== "CPT"));
      pick = lockedFit ?? null;
    }
    if (!pick) {
      const cands = pool.filter((p) => {
        if (used.has(p.id) || leftover(p) < 0) return false;
        if (needCpt) return p.showdownRole === "CPT";
        return p.showdownRole !== "CPT";
      });
      if (!cands.length) return null;
      const ws = cands.map((p) => weight(contest, p, chosen.map((x) => x.player), rng));
      pick = pickOne(cands, ws, rng);
    }
    used.add(pick.id);
    salary += pick.salary;
    chosen.push({ slot: slot.slot, player: pick });
  }
  if (salary > UFC_CAP) return null;
  const projection = chosen.reduce((s, x) => s + x.player.projection, 0);
  return {
    id: "",
    players: chosen,
    salary,
    projection: Math.round(projection * 10) / 10,
    value: Math.round((projection / Math.max(1, salary / 1000)) * 100) / 100,
    remaining: UFC_CAP - salary,
  };
}

export function generateUfcLineups(
  players: UfcFighter[],
  count: number,
  seed: number,
  opts?: { locks?: string[]; excludes?: string[]; contest?: UfcContest },
): UfcLineup[] {
  const contest = opts?.contest ?? "cash";
  const lockIds = new Set(opts?.locks ?? []);
  const exclude = new Set(opts?.excludes ?? []);
  const showdown = players.some((p) => p.showdownRole === "CPT");
  const rng = mulberry32(seed);
  const pool = players.filter((p) => {
    if (exclude.has(p.id) || p.salary <= 0) return false;
    return p.projection > 8 || lockIds.has(p.id);
  });
  const byId = new Map(pool.map((p) => [p.id, p]));
  const locks = [...lockIds].map((id) => byId.get(id)).filter((p): p is UfcFighter => !!p);
  const results: UfcLineup[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (results.length < count && attempts < count * 80) {
    attempts++;
    const built = buildOne(pool, locks, rng, contest, showdown);
    if (!built) continue;
    const key = built.players.map((lp) => lp.player.id).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    built.id = `U${results.length + 1}`;
    results.push(built);
  }
  return results.sort((a, b) => b.projection - a.projection);
}

function dkCell(p: UfcFighter): string {
  return `${p.name} (${p.dkId || p.id})`;
}

export function ufcLineupAsDkPaste(lineup: UfcLineup): string {
  return lineup.players.map((lp) => dkCell(lp.player)).join(",");
}

export function ufcLineupsAsDkCsv(lineups: UfcLineup[], showdown: boolean): string {
  const header = (showdown ? UFC_SHOWDOWN_ROSTER : UFC_ROSTER).map((s) => s.slot).join(",");
  const rows = lineups.map((lu) => lu.players.map((lp) => dkCell(lp.player)).join(","));
  return [header, ...rows].join("\n");
}

export type { UfcRole };
