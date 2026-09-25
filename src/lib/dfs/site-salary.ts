import type { Player, Position } from "./types";

/** FanDuel NFL classic is half-PPR. DraftKings projections are full PPR. */
export function fdProjection(player: Player): number {
  if (player.position === "DST") return player.projection;
  const catches = player.week?.receptions ?? 0;
  if (catches <= 0) return player.projection;
  return Math.max(0, player.projection - 0.5 * catches);
}

export function asFdPlayer(player: Player): Player | null {
  const salary = player.fdSalary ?? 0;
  if (salary <= 0) return null;
  const projection = fdProjection(player);
  return {
    ...player,
    salary,
    dkSalary: player.dkSalary ?? player.salary,
    projection,
    value: projection / (salary / 1000),
  };
}

export function fdPool(players: Player[]): Player[] {
  return players.flatMap((p) => {
    const next = asFdPlayer(p);
    return next ? [next] : [];
  });
}

export const FD_CAP = 60_000;

export function teamKey(team: string): string {
  const u = team.toUpperCase();
  if (u === "JAX") return "JAC";
  if (u === "WSH") return "WAS";
  if (u === "LA") return "LAR";
  return u;
}

export function fdPosition(raw: string): Position | null {
  const u = raw.toUpperCase();
  if (u === "D" || u === "DEF" || u === "DST") return "DST";
  if (u === "QB" || u === "RB" || u === "WR" || u === "TE") return u;
  return null;
}
