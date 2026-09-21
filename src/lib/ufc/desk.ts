import type { UfcBet, UfcFight, UfcFighter } from "./types";
import { buildUfcDeskImpl, publishedUfcBetsImpl, type UfcDesk } from "./desk-build";

export type { UfcDesk };

export function buildUfcDesk(fights: UfcFight[], players: UfcFighter[]): UfcDesk {
  return buildUfcDeskImpl(fights, players);
}

export function publishedUfcBets(desk: UfcDesk): UfcBet[] {
  return publishedUfcBetsImpl(desk);
}
