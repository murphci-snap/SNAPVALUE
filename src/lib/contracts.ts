import { getHtml, settled } from "@/lib/dfs/http";
import { normalizeName } from "@/lib/utils";

export type ContractYearKind = "UFA" | "RFA" | "ERFA" | "VOID" | "PO" | "CY";

export type ContractYear = {
  kind: ContractYearKind;
  blurb: string;
};

type CyIndex = {
  byName: Map<string, ContractYear>;
  byNameTeam: Map<string, ContractYear>;
};

const TTL_MS = 2 * 60 * 60 * 1000;
type Hit = { at: number; value: CyIndex };
const g = globalThis as typeof globalThis & { __snapCyNfl?: Hit; __snapCyNba?: Hit };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function emptyIndex(): CyIndex {
  return { byName: new Map(), byNameTeam: new Map() };
}

function blurbFor(kind: ContractYearKind): string {
  if (kind === "UFA") return "UFA after this season";
  if (kind === "RFA") return "RFA after this season";
  if (kind === "ERFA") return "ERFA after this season";
  if (kind === "VOID") return "Final year of contract";
  if (kind === "PO") return "Player option after this season";
  return "Final year of contract";
}

function kindFrom(raw: string): ContractYearKind {
  const t = raw.toUpperCase();
  if (t === "UFA" || t.includes("UNRESTRICTED")) return "UFA";
  if (t === "RFA" || t.includes("RESTRICTED")) return "RFA";
  if (t === "ERFA") return "ERFA";
  if (t === "VOID") return "VOID";
  if (t === "PO" || t.includes("PLAYER OPTION")) return "PO";
  return "CY";
}

function put(idx: CyIndex, name: string, team: string | null, kind: ContractYearKind) {
  const n = normalizeName(name);
  if (!n || n.length < 4) return;
  const hit: ContractYear = { kind, blurb: blurbFor(kind) };
  const spec = (k: ContractYearKind) => (k === "CY" ? 0 : 1);
  const prev = idx.byName.get(n);
  if (!prev || spec(kind) >= spec(prev.kind)) idx.byName.set(n, hit);
  if (team) {
    const key = `${n}|${teamKey(team)}`;
    const old = idx.byNameTeam.get(key);
    if (!old || spec(kind) >= spec(old.kind)) idx.byNameTeam.set(key, hit);
  }
}

function teamKey(t: string): string {
  const x = t.toUpperCase().replace(/[^A-Z]/g, "");
  const map: Record<string, string> = {
    WAS: "WAS",
    WSH: "WAS",
    JAC: "JAX",
    JAX: "JAX",
    GNB: "GB",
    GB: "GB",
    SFO: "SF",
    SF: "SF",
    KAN: "KC",
    KC: "KC",
    NWE: "NE",
    NE: "NE",
    TAM: "TB",
    TB: "TB",
    NOR: "NO",
    NO: "NO",
    LAR: "LAR",
    LA: "LAR",
    ARZ: "ARI",
    ARI: "ARI",
    GSW: "GS",
    GS: "GS",
    NYK: "NY",
    NY: "NY",
    SAS: "SA",
    SA: "SA",
    NOP: "NO",
    UTA: "UTA",
    UTAH: "UTA",
    BRK: "BKN",
    BKN: "BKN",
    PHO: "PHX",
    PHX: "PHX",
    CHO: "CHA",
    CHA: "CHA",
  };
  return map[x] ?? x;
}

export function lookupContractYear(idx: CyIndex | null | undefined, name: string, lastName: string, team: string): ContractYear | null {
  if (!idx) return null;
  const n = normalizeName(name);
  const t = teamKey(team);
  const withTeam = idx.byNameTeam.get(`${n}|${t}`);
  if (withTeam) return withTeam;
  const byName = idx.byName.get(n);
  if (byName) return byName;
  const last = normalizeName(lastName || name.split(/\s+/).pop() || "");
  if (last.length >= 4) {
    const lastTeam = idx.byNameTeam.get(`${last}|${t}`);
    // only if the index stored last+team — we don't, skip last-only to avoid collisions
    if (lastTeam) return lastTeam;
  }
  return null;
}

async function postOtc(season: number): Promise<string> {
  const body = new URLSearchParams({ action: "get_free_agents", season: String(season), team_id: "" }).toString();
  const res = await fetch("https://overthecap.com/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://overthecap.com",
      Referer: "https://overthecap.com/free-agency/",
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    signal: AbortSignal.timeout(16000),
  });
  if (!res.ok) throw new Error(`OTC ${res.status}`);
  return res.text();
}

function parseOtc(html: string): CyIndex {
  const idx = emptyIndex();
  const rowRe = /<tr[^>]*data-old-team="([^"]*)"[^>]*data-fatype="([^"]*)"[^>]*>[\s\S]*?<a href="\/player\/[^"]+">([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const team = m[1] ?? "";
    const type = m[2] ?? "";
    const name = (m[3] ?? "").replace(/&/g, "&").replace(/&#39;/g, "'").trim();
    if (!name || /defense|dst|team/i.test(name)) continue;
    const kind = kindFrom(type);
    put(idx, name, team, kind);
  }
  return idx;
}

function parseSpotracNba(html: string): CyIndex {
  const idx = emptyIndex();
  const re = /href="https?:\/\/www\.spotrac\.com\/nba\/player\/_\/id\/\d+\/[^"]*"[^>]*>([^<]{3,60})<\/a>([\s\S]{0,900})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = (m[1] ?? "").replace(/&/g, "&").replace(/&#39;/g, "'").trim();
    if (!name || /free agent/i.test(name)) continue;
    const chunk = m[2] ?? "";
    let kind: ContractYearKind = "CY";
    if (/Player Option/i.test(chunk) && !/\bUFA\b/.test(chunk) && !/\bRFA\b/.test(chunk)) kind = "PO";
    const teamM = chunk.match(/\b(ATL|BOS|BKN|BRK|CHA|CHI|CLE|DAL|DEN|DET|GSW|GS|HOU|IND|LAC|LAL|MEM|MIA|MIL|MIN|NOP|NO|NYK|NY|OKC|ORL|PHI|PHX|PHO|POR|SAC|SAS|SA|TOR|UTA|WAS)\b/);
    put(idx, name, teamM?.[1] ?? null, kind);
  }
  return idx;
}

function parseHoopsRumors(html: string): CyIndex {
  const idx = emptyIndex();
  let section: ContractYearKind = "UFA";
  const bits = html.split(/<(?:h2|h3)[^>]*>/i);
  for (const bit of bits) {
    const head = bit.slice(0, 80).toLowerCase();
    if (head.includes("unrestricted")) section = "UFA";
    else if (head.includes("restricted")) section = "RFA";
    else if (head.includes("player option")) section = "PO";
    else if (head.includes("team option") || head.includes("mutual") || head.includes("two-way")) continue;
    const names = bit.matchAll(/>([A-Z][A-Za-z.'’\-]+(?:\s+[A-Z][A-Za-z.'’\-]+)+)<\/a><\/strong>/g);
    for (const n of names) put(idx, n[1]!.replace(/’/g, "'"), null, section);
  }
  return idx;
}

export async function loadNflContractYears(): Promise<CyIndex> {
  const hit = g.__snapCyNfl;
  if (hit && Date.now() - hit.at < TTL_MS && hit.value.byName.size > 40) return hit.value;
  const html = await postOtc(2027);
  const idx = parseOtc(html);
  if (idx.byName.size < 40) throw new Error("OTC free-agent list too small");
  g.__snapCyNfl = { at: Date.now(), value: idx };
  return idx;
}

export async function loadNbaContractYears(): Promise<CyIndex> {
  const hit = g.__snapCyNba;
  if (hit && Date.now() - hit.at < TTL_MS && hit.value.byName.size > 20) return hit.value;
  const [spotrac, hoops] = await Promise.all([
    settled(getHtml("https://www.spotrac.com/nba/free-agents/_/year/2027", 16000)),
    settled(getHtml("https://www.hoopsrumors.com/2025/09/2027-nba-free-agents.html", 16000)),
  ]);
  const idx = emptyIndex();
  if (spotrac) {
    const s = parseSpotracNba(spotrac);
    for (const [k, v] of s.byName) put(idx, k, null, v.kind);
    for (const [k, v] of s.byNameTeam) {
      const [name, team] = k.split("|");
      put(idx, name ?? k, team ?? null, v.kind);
    }
  }
  if (hoops) {
    const h = parseHoopsRumors(hoops);
    for (const [k, v] of h.byName) put(idx, k, null, v.kind);
  }
  if (idx.byName.size < 20) throw new Error("NBA free-agent list too small");
  g.__snapCyNba = { at: Date.now(), value: idx };
  return idx;
}

export function applyContractYears<T extends { name: string; lastName: string; team: string; position?: string }>(
  players: T[],
  idx: CyIndex | null,
): void {
  if (!idx) {
    for (const p of players) (p as T & { contractYear: ContractYear | null }).contractYear = null;
    return;
  }
  for (const p of players) {
    if (p.position === "DST") {
      (p as T & { contractYear: ContractYear | null }).contractYear = null;
      continue;
    }
    (p as T & { contractYear: ContractYear | null }).contractYear = lookupContractYear(idx, p.name, p.lastName, p.team);
  }
}
