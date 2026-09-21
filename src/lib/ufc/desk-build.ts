import type { UfcFight, UfcFighter } from "./types";
import type { UfcDesk } from "./desk-helpers";
import { buildDeskHead } from "./desk-build-head";
import { buildDeskTail } from "./desk-build-tail";
import { publishedUfcBetsImpl as publishedImpl } from "./desk-publish";
import type { UfcBet } from "./types";

export type { UfcDesk };

export function buildUfcDeskImpl(fights: UfcFight[], players: UfcFighter[]): UfcDesk {
  return buildDeskTail(buildDeskHead(fights, players));
}

export function publishedUfcBetsImpl(desk: UfcDesk): UfcBet[] {
  return publishedImpl(desk);
}
