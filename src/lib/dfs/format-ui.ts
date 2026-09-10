import type { MatchupQuality, Player, Position, SeasonStats } from "./types";

export function matchupLabel(p: Player): string {
  const rank = p.oppRank ? `${p.oppRank}` : "—";
  const tone =
    p.oppQuality === "High" ? "Smash" : p.oppQuality === "Low" ? "Tough" : p.oppQuality === "Medium" ? "Neutral" : "";
  return tone ? `${tone} · ${rank}` : `${rank}`;
}

export function matchupTone(q: MatchupQuality, rank: number): "value" | "warn" | "hot" | "default" {
  if (q === "High" || rank >= 24) return "value";
  if (q === "Low" || rank <= 8) return "warn";
  if (rank >= 16) return "hot";
  return "default";
}

export function kickoffLabel(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(d);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = now - t;
  const min = Math.round(Math.abs(diff) / 60000);
  if (min < 1) return diff >= 0 ? "just now" : "soon";
  if (min < 60) return diff >= 0 ? `${min}m ago` : `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return diff >= 0 ? `${hr}h ago` : `in ${hr}h`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(t));
}

export function rankingLabel(p: Player): string {
  if (p.rankingMethod === "props") return "Vegas";
  if (p.rankingMethod === "consensus") return "Yahoo · CBS · FP";
  return "FPPG";
}

export function seasonLine(pos: Position, s: SeasonStats | null): { k: string; v: string }[] {
  if (!s) return [];
  const g = s.games || 1;
  if (pos === "QB") {
    return [
      { k: "CMP/ATT", v: `${Math.round(s.passCmp)}/${Math.round(s.passAtt)}` },
      { k: "PASS YDS", v: Math.round(s.passYds).toLocaleString() },
      { k: "TD", v: String(Math.round(s.passTd)) },
      { k: "INT", v: String(Math.round(s.interceptions)) },
      { k: "RUSH YDS", v: Math.round(s.rushYds).toLocaleString() },
      { k: "RUSH TD", v: String(Math.round(s.rushTd)) },
      { k: "FPTS", v: s.fantasyPts.toFixed(0) },
      { k: "PPG", v: s.fantasyPpg.toFixed(1) },
    ];
  }
  if (pos === "RB") {
    return [
      { k: "ATT", v: String(Math.round(s.rushAtt)) },
      { k: "RUSH YDS", v: Math.round(s.rushYds).toLocaleString() },
      { k: "YPC", v: s.rushAtt ? (s.rushYds / s.rushAtt).toFixed(1) : "—" },
      { k: "RUSH TD", v: String(Math.round(s.rushTd)) },
      { k: "REC", v: String(Math.round(s.receptions)) },
      { k: "TGT", v: String(Math.round(s.targets)) },
      { k: "REC YDS", v: Math.round(s.recYds).toLocaleString() },
      { k: "PPG", v: s.fantasyPpg.toFixed(1) },
    ];
  }
  if (pos === "DST") {
    return [
      { k: "SACK", v: String(Math.round(s.sacks)) },
      { k: "INT", v: String(Math.round(s.defInt)) },
      { k: "FR", v: String(Math.round(s.fumRec)) },
      { k: "TD", v: String(Math.round(s.defTd)) },
      { k: "PA", v: String(Math.round(s.ptsAllowed)) },
      { k: "YA", v: Math.round(s.ydsAllowed).toLocaleString() },
      { k: "FPTS", v: s.fantasyPts.toFixed(0) },
      { k: "PPG", v: s.fantasyPpg.toFixed(1) },
    ];
  }
  return [
    { k: "REC", v: String(Math.round(s.receptions)) },
    { k: "TGT", v: String(Math.round(s.targets)) },
    { k: "YDS", v: Math.round(s.recYds).toLocaleString() },
    { k: "YPR", v: s.receptions ? (s.recYds / s.receptions).toFixed(1) : "—" },
    { k: "TD", v: String(Math.round(s.recTd)) },
    { k: "TGT/G", v: (s.targets / g).toFixed(1) },
    { k: "FPTS", v: s.fantasyPts.toFixed(0) },
    { k: "PPG", v: s.fantasyPpg.toFixed(1) },
  ];
}

export function weekLine(p: Player): { k: string; v: string }[] {
  const w = p.week;
  const props = p.props;
  const n = (v: number | undefined | null, digits = 1, suffix = "") => {
    if (v == null || !Number.isFinite(v) || v === 0) return "—";
    return `${v.toFixed(digits)}${suffix}`;
  };
  if (p.position === "QB") {
    return [
      { k: "PASS", v: n(props?.passYds ?? w?.passYds, 0, " yds") },
      { k: "TD", v: n(props?.passTd ?? w?.passTd, 1) },
      { k: "INT", v: n(props?.interceptions ?? w?.interceptions, 1) },
      { k: "RUSH", v: n(props?.rushYds ?? w?.rushYds, 0, " yds") },
    ];
  }
  if (p.position === "RB") {
    return [
      { k: "RUSH", v: n(props?.rushYds ?? w?.rushYds, 0, " yds") },
      { k: "TD", v: n((props?.rushTd ?? w?.rushTd ?? 0) + (props?.recTd ?? w?.recTd ?? 0), 1) },
      { k: "REC", v: n(props?.receptions ?? w?.receptions, 1) },
      { k: "REC YDS", v: n(props?.recYds ?? w?.recYds, 0) },
    ];
  }
  if (p.position === "DST") {
    if (!w) return [{ k: "FPPG", v: p.fppg.toFixed(1) }];
    return [
      { k: "SACK", v: n(w.sacks, 1) },
      { k: "INT", v: n(w.defInt, 1) },
      { k: "PA", v: n(w.ptsAllowed, 0) },
      { k: "TD", v: n(w.defTd, 1) },
    ];
  }
  return [
    { k: "REC", v: n(props?.receptions ?? w?.receptions, 1) },
    { k: "YDS", v: n(props?.recYds ?? w?.recYds, 0) },
    { k: "TD", v: n(props?.recTd ?? w?.recTd, 1) },
    { k: "RUSH", v: n(props?.rushYds ?? w?.rushYds, 0) },
  ];
}

export function propLineItems(p: Player): { k: string; v: string }[] {
  const line = p.props;
  if (!line) return [];
  const out: { k: string; v: string }[] = [];
  if (line.passYds != null) out.push({ k: "Pass yds", v: line.passYds.toFixed(1) });
  if (line.passTd != null) out.push({ k: "Pass TD", v: line.passTd.toFixed(1) });
  if (line.interceptions != null) out.push({ k: "INT", v: line.interceptions.toFixed(1) });
  if (line.rushYds != null) out.push({ k: "Rush yds", v: line.rushYds.toFixed(1) });
  if (line.rushTd != null) out.push({ k: "Rush TD", v: line.rushTd.toFixed(1) });
  if (line.receptions != null) out.push({ k: "Rec", v: line.receptions.toFixed(1) });
  if (line.recYds != null) out.push({ k: "Rec yds", v: line.recYds.toFixed(1) });
  if (line.recTd != null) out.push({ k: "Rec TD", v: line.recTd.toFixed(1) });
  if (p.anytimeTd != null) out.push({ k: "ATD", v: `${Math.round(p.anytimeTd * 100)}%` });
  if (line.books?.length) out.push({ k: "Books", v: line.books.join(" · ") });
  return out;
}
