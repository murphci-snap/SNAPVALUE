import { isUpcoming } from "@/lib/dfs/markets";
import type { Game } from "@/lib/dfs/types";
import { isSidelined } from "./scoring";
import type { NbaPlayer } from "./types";

export interface NbaBet {
  id: string;
  title: string;
  market: "spread" | "total" | "prop";
  pick: string;
  line: string;
  why: string;
  tape: string;
  unit: string;
  books: string;
  edge: number;
}

export interface NbaDesk {
  spreadLock: NbaBet | null;
  totals: NbaBet[];
  props: NbaBet[];
  fades: NbaBet[];
  remainingOnly: boolean;
}

function liveGames(games: Game[]): Game[] {
  return games.filter((g) => isUpcoming(g));
}

export function buildNbaDesk(games: Game[], players: NbaPlayer[]): NbaDesk {
  const live = liveGames(games);
  const remainingOnly = live.length < games.length && live.length > 0;
  const board = players.filter((p) => !isSidelined(p.injury, p.status) && live.some((g) => g.homeAbbr === p.team || g.awayAbbr === p.team));

  let spreadLock: NbaBet | null = null;
  const spreads: NbaBet[] = [];
  for (const g of live) {
    if (g.spread == null || g.homeImplied == null || g.awayImplied == null) continue;
    const coverHome = g.homeImplied - (g.total ?? 0) / 2;
    const edge = Math.abs(coverHome) / 10;
    if (edge < 0.08) continue;
    const home = coverHome > 0;
    const side = home ? g.homeAbbr : g.awayAbbr;
    const spr = home ? g.spread : -g.spread;
    spreads.push({
      id: `ats-${g.id}`,
      title: `${side} ${spr > 0 ? "+" : ""}${spr}`,
      market: "spread",
      pick: `${side} ${spr > 0 ? "+" : ""}${spr}`,
      line: `${g.awayAbbr} @ ${g.homeAbbr} · O/U ${g.total ?? "—"}`,
      why: `Implied ${home ? g.homeImplied.toFixed(1) : g.awayImplied.toFixed(1)} vs spread. Edge ${edge.toFixed(2)}.`,
      tape: "Only if the gap vs implied is real. Empty is fine.",
      unit: edge >= 0.14 ? "0.5u" : "0.25u",
      books: "FanDuel",
      edge,
    });
  }
  spreads.sort((a, b) => b.edge - a.edge);
  spreadLock = spreads[0] ?? null;

  const totals: NbaBet[] = [];
  for (const g of live) {
    if (g.total == null || g.homeImplied == null || g.awayImplied == null) continue;
    const implied = g.homeImplied + g.awayImplied;
    const gap = implied - g.total;
    if (Math.abs(gap) < 4) continue;
    const over = gap > 0;
    totals.push({
      id: `tot-${g.id}`,
      title: `${over ? "Over" : "Under"} ${g.total}`,
      market: "total",
      pick: `${over ? "Over" : "Under"} ${g.total}`,
      line: `${g.awayAbbr} @ ${g.homeAbbr}`,
      why: `Books ${g.total}. Implied ${implied.toFixed(1)} (${over ? "+" : ""}${gap.toFixed(1)}).`,
      tape: "Need a 4+ point gap. No forced total.",
      unit: Math.abs(gap) >= 6 ? "0.5u" : "0.25u",
      books: "FanDuel",
      edge: Math.abs(gap) / 20,
    });
  }
  totals.sort((a, b) => b.edge - a.edge);

  const props: NbaBet[] = [];
  for (const p of board) {
    const pr = p.props;
    if (!pr) continue;
    const rows: { kind: string; line: number; model: number }[] = [];
    if (pr.pts != null && p.box) rows.push({ kind: "pts", line: pr.pts, model: p.box.pts });
    if (pr.reb != null && p.box) rows.push({ kind: "reb", line: pr.reb, model: p.box.reb });
    if (pr.ast != null && p.box) rows.push({ kind: "ast", line: pr.ast, model: p.box.ast });
    if (pr.threes != null && p.box) rows.push({ kind: "threes", line: pr.threes, model: p.box.threes });
    for (const r of rows) {
      const gap = r.model - r.line;
      if (Math.abs(gap) < 1.4) continue;
      const over = gap > 0;
      props.push({
        id: `prop-${p.id}-${r.kind}`,
        title: p.name,
        market: "prop",
        pick: `${p.name} ${over ? "o" : "u"}${r.line} ${r.kind}`,
        line: `${p.position} · ${p.team} ${p.home ? "vs" : "@"} ${p.opponent}`,
        why: `Model ${r.model.toFixed(1)} vs ${r.line}.`,
        tape: "Independent pace vs posted line. Empty if the gap is tiny.",
        unit: Math.abs(gap) >= 2.5 ? "0.5u" : "0.25u",
        books: pr.books.join("/") || "FanDuel",
        edge: Math.abs(gap) / 8,
      });
    }
  }
  props.sort((a, b) => b.edge - a.edge);

  const fades: NbaBet[] = [];
  for (const p of board.filter((x) => x.salary >= 10000 && x.oppRank <= 8 && x.projection < x.fppg - 2).slice(0, 3)) {
    fades.push({
      id: `fade-${p.id}`,
      title: p.name,
      market: "prop",
      pick: `Sit ${p.name}`,
      line: `${p.position} · ${p.team} ${p.home ? "vs" : "@"} ${p.opponent} · ${p.salary}`,
      why: `Expensive name into a top-8 D (${p.oppRank}th). Model under season pace.`,
      tape: "Public chalk. We sit.",
      unit: "0u",
      books: "model",
      edge: 0.05,
    });
  }

  return {
    spreadLock,
    totals: totals.slice(0, 2),
    props: props.slice(0, 4),
    fades,
    remainingOnly,
  };
}
