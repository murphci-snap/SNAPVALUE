import { getJson, settled } from "./http";
import { normalizeName } from "@/lib/utils";
import type { Player, SlateFormat } from "./types";
import { fdPosition, teamKey } from "./site-salary";

const FD_AUTH = "Basic ZWFmNzdmMTI3ZWEwMDNkNGUyNzVhM2VkMDdkNmY1Mjc6";

interface FdList {
  id: string;
  sport?: string;
  label?: string;
  salary_cap?: number;
  fixture_counts?: { pending?: number };
}

interface FdTeam {
  id: string;
  code?: string;
}

interface FdPlayer {
  first_name?: string;
  last_name?: string;
  position?: string;
  salary?: number;
  draftable?: boolean;
  team?: { _members?: string[] };
}

function headers(): HeadersInit {
  return { Authorization: FD_AUTH, Accept: "application/json" };
}

function pickList(lists: FdList[], format: SlateFormat, gameName?: string): FdList | undefined {
  const nfl = lists.filter(
    (x) => x.sport === "NFL" && (x.salary_cap ?? 0) >= 50000 && x.label && !/snake|test/i.test(x.label),
  );
  if (format === "showdown" && gameName) {
    const want = gameName.replace(/\s+/g, " ").trim().toLowerCase();
    const hit = nfl.find((x) => (x.label ?? "").replace(/\s+/g, " ").trim().toLowerCase() === want);
    if (hit) return hit;
  }
  return nfl.find((x) => x.label === "Main") ?? nfl.sort((a, b) => (b.fixture_counts?.pending ?? 0) - (a.fixture_counts?.pending ?? 0))[0];
}

/** Posted FanDuel salaries for this slate. Empty map if the book is down. */
export async function loadFanDuelSalaries(format: SlateFormat, gameName?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const lists = await settled(
    getJson<{ fixture_lists?: FdList[] }>("https://api.fanduel.com/fixture-lists", { headers: headers() }, 8000),
  );
  const slate = pickList(lists?.fixture_lists ?? [], format, gameName);
  if (!slate) return out;
  const body = await settled(
    getJson<{ players?: FdPlayer[]; teams?: FdTeam[] }>(
      `https://api.fanduel.com/fixture-lists/${slate.id}/players`,
      { headers: headers() },
      12000,
    ),
  );
  const teams = new Map((body?.teams ?? []).map((t) => [String(t.id), teamKey(t.code ?? "")]));
  for (const p of body?.players ?? []) {
    const pos = fdPosition(p.position ?? "");
    const salary = Number(p.salary ?? 0);
    if (!pos || salary <= 0 || p.draftable === false) continue;
    const team = teams.get(String(p.team?._members?.[0] ?? "")) ?? "";
    const name = normalizeName(`${p.first_name ?? ""} ${p.last_name ?? ""}`);
    if (!name) continue;
    out.set(`${name}|${team}|${pos}`, salary);
    if (!out.has(`${name}|${pos}`)) out.set(`${name}|${pos}`, salary);
  }
  return out;
}

export function applyFanDuelSalaries(players: Player[], salaries: Map<string, number>) {
  let n = 0;
  for (const p of players) {
    if (p.showdownRole === "CPT") {
      p.fdSalary = null;
      continue;
    }
    const name = normalizeName(p.name);
    const team = teamKey(p.team);
    const salary = salaries.get(`${name}|${team}|${p.position}`) ?? salaries.get(`${name}|${p.position}`);
    p.fdSalary = salary && salary > 0 ? salary : null;
    if (p.fdSalary) n += 1;
  }
  return n;
}
