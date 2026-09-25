import { buildWeeklyDesk } from "./desk";
import { gradePublicDesk, type PublicLeg } from "./bet-ledger";
import { pnlOf } from "./bet-grade";
import { buildPoolPlan } from "./pools";
import { gamePhase } from "./markets";
import { getSql } from "@/lib/db";
import type { Game, PublicWeek, SlateData } from "./types";

function survivorLine(games: Game[], week: number): { text: string; result: "win" | "loss" | "open" } | null {
  const plan = buildPoolPlan("survivor", games, 1, [], week, [], "medium");
  const pick = plan.entries[0];
  if (!pick) return null;
  const g = games.find((x) => x.homeAbbr === pick.team || x.awayAbbr === pick.team);
  let result: "win" | "loss" | "open" = "open";
  if (g && g.homeScore != null && g.awayScore != null && gamePhase(g.startTime) === "final") {
    const won = pick.team === g.homeAbbr ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    result = g.homeScore === g.awayScore ? "open" : won ? "win" : "loss";
  }
  const text = `${pick.team} over ${pick.opponent} · ${result}`;
  return { text, result };
}

function tally(legs: PublicLeg[], survivor: { text: string; result: "win" | "loss" | "open" } | null): PublicWeek {
  const decided = legs.filter((l) => l.result === "win" || l.result === "loss");
  let w = decided.filter((l) => l.result === "win").length;
  let l = decided.filter((l) => l.result === "loss").length;
  let open = legs.filter((l) => l.result === "open").length;
  if (survivor?.result === "win") w += 1;
  else if (survivor?.result === "loss") l += 1;
  else if (survivor) open += 1;
  return { week: 0, w, l, open, survivor: survivor?.text ?? null };
}

/** Freeze this week's public card. History survives only when the database does. */
export async function savePublicHistory(data: SlateData): Promise<PublicWeek[]> {
  const desk = buildWeeklyDesk(data.games, data.players);
  const legs = gradePublicDesk({ desk, games: data.games, players: data.players });
  const survivor = survivorLine(data.games, data.week);
  const current = { ...tally(legs, survivor), week: data.week };
  const rows: PublicLeg[] = survivor
    ? [...legs, { id: "survivor-1", market: "survivor", pick: survivor.text.replace(/ · (open|win|loss)$/, ""), unit: 1, result: survivor.result }]
    : legs;
  try {
    const sql = await getSql();
    for (const row of rows) {
      const result = row.result === "open" ? "open" : row.result;
      const pnl = result === "open" ? 0 : pnlOf(result, row.unit);
      await sql`
        insert into public_grades (season, week, id, market, pick, unit, result, pnl)
        values (${data.season}, ${data.week}, ${row.id}, ${row.market}, ${row.pick}, ${row.unit}, ${result}, ${pnl})
        on conflict (season, week, id) do update set
          pick = case when public_grades.result = 'open' then excluded.pick else public_grades.pick end,
          result = excluded.result,
          pnl = excluded.pnl
      `;
    }
    const stored = await sql<{ week: number; result: string }>`
      select week, result from public_grades
      where season = ${data.season} and week <= ${data.week} and week > ${data.week - 8}
    `;
    const byWeek = new Map<number, PublicWeek>();
    for (const row of stored) {
      const slot = byWeek.get(row.week) ?? { week: row.week, w: 0, l: 0, open: 0, survivor: null };
      if (row.result === "win") slot.w += 1;
      else if (row.result === "loss") slot.l += 1;
      else slot.open += 1;
      byWeek.set(row.week, slot);
    }
    byWeek.set(data.week, current);
    return [...byWeek.values()].sort((a, b) => b.week - a.week);
  } catch {
    return [current];
  }
}
