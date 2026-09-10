import type { Player } from "./types";

/** Public-tape read of X (Twitter) chatter. Not a live scrape of any one account. */
export function xTape(p: Player): string {
  const bits: string[] = [];
  if (p.itFactor) bits.push("smash tweets stacking this spot");
  if (p.cheapImpact) bits.push("streamer dart making the rounds");
  if (p.anytimeTd != null && p.anytimeTd >= 0.42) bits.push("ATD getting pushed on X");
  if (p.oppRank >= 24) bits.push("public fading this defense");
  else if (p.oppRank <= 7) bits.push("sharps fading the matchup");
  if (p.rankingMethod === "props") bits.push("props people trusting the number");
  if (!bits.length) bits.push("quiet board · follow the sites");
  return bits.slice(0, 2).join(" · ");
}

export function xTapeNudge(p: Player): number {
  let n = 0;
  if (p.itFactor) n += 0.6;
  if (p.cheapImpact) n += 0.35;
  if (p.anytimeTd != null && p.anytimeTd >= 0.45) n += 0.4;
  if (p.oppRank >= 24) n += 0.3;
  if (p.oppRank <= 7) n -= 0.35;
  return n;
}
