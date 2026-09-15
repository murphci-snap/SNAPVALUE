import { isQuestionable, isSidelined } from "./scoring";
import type { Player } from "./types";

export type InjuryKind = "out" | "ir" | "doubtful" | "q" | "cleared";

export interface LateSwapAlert {
  player: Player;
  kind: InjuryKind;
  tag: string;
  delta: boolean;
  prior: string;
  impact: number;
  bumpValue: string[];
  bumpBargain: string[];
  locked: boolean;
}

type Snap = Record<string, { injury: string | null; status: string }>;

const LS = "sv-injury-snap-v1";

function tagOf(p: Player): string {
  if (isSidelined(p.injury, p.status)) return (p.injury || p.status || "OUT").toUpperCase();
  if (isQuestionable(p.injury, p.status)) return "Q";
  return "Active";
}

function kindOf(p: Player): InjuryKind | null {
  const blob = `${p.injury ?? ""} ${p.status ?? ""}`.toLowerCase();
  if (/\bir\b/.test(blob) || /^ir$/i.test(p.status)) return "ir";
  if (/\bdoubtful\b/.test(blob)) return "doubtful";
  if (isSidelined(p.injury, p.status)) return "out";
  if (isQuestionable(p.injury, p.status)) return "q";
  return null;
}

function readSnap(key: string): Snap {
  try {
    const raw = localStorage.getItem(`${LS}:${key}`);
    if (!raw) return {};
    return JSON.parse(raw) as Snap;
  } catch {
    return {};
  }
}

export function writeInjurySnap(key: string, players: Player[]) {
  const snap: Snap = {};
  for (const p of players) {
    if (p.showdownRole === "CPT") continue;
    snap[String(p.dkId || p.id)] = { injury: p.injury, status: p.status };
  }
  try {
    localStorage.setItem(`${LS}:${key}`, JSON.stringify(snap));
  } catch {
    /* quota */
  }
}

export function buildLateSwap(players: Player[], locks: string[], snapKey: string): LateSwapAlert[] {
  const snap = typeof localStorage !== "undefined" ? readSnap(snapKey) : {};
  const valueByPos = new Map<string, string[]>();
  const bargainByPos = new Map<string, string[]>();
  for (const p of players) {
    if (p.showdownRole === "CPT") continue;
    if (p.isValuePlay) {
      const arr = valueByPos.get(p.position) ?? [];
      arr.push(p.shortName || p.name);
      valueByPos.set(p.position, arr);
    }
    if (p.cheapImpact) {
      const arr = bargainByPos.get(p.position) ?? [];
      arr.push(p.shortName || p.name);
      bargainByPos.set(p.position, arr);
    }
  }

  const alerts: LateSwapAlert[] = [];
  for (const p of players) {
    if (p.showdownRole === "CPT") continue;
    const id = String(p.dkId || p.id);
    const prior = snap[id];
    const nowKind = kindOf(p);
    const wasOut = prior ? isSidelined(prior.injury, prior.status) : false;
    const wasQ = prior ? isQuestionable(prior.injury, prior.status) : false;
    const cleared = Boolean(prior) && (wasOut || wasQ) && !nowKind;
    if (!nowKind && !cleared) continue;

    const notable = p.salary >= 3800 || p.isValuePlay || p.itFactor || p.cheapImpact || p.projection >= 8;
    const delta =
      !prior ||
      (prior.injury ?? "") !== (p.injury ?? "") ||
      prior.status !== p.status;
    if (!notable && !delta) continue;

    const kind: InjuryKind = cleared ? "cleared" : nowKind ?? "q";
    const impact = p.salary * Math.max(p.projection, kind === "cleared" ? 6 : 8);
    alerts.push({
      player: p,
      kind,
      tag: cleared ? "ACTIVE" : tagOf(p),
      delta,
      prior: prior ? (prior.injury || prior.status || "Active") : "—",
      impact,
      bumpValue: (valueByPos.get(p.position) ?? []).filter((n) => n !== (p.shortName || p.name)).slice(0, 2),
      bumpBargain: (bargainByPos.get(p.position) ?? []).filter((n) => n !== (p.shortName || p.name)).slice(0, 1),
      locked: locks.includes(p.id),
    });
  }

  const rank: Record<InjuryKind, number> = { out: 0, ir: 0, doubtful: 1, q: 2, cleared: 3 };
  alerts.sort((a, b) => rank[a.kind] - rank[b.kind] || b.impact - a.impact || b.player.salary - a.player.salary);
  return alerts.slice(0, 24);
}