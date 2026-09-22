import { formatAmerican } from "@/lib/dfs/markets";
import type { DeskBet, TdLeg } from "@/lib/dfs/desk";
import type { Game, Player } from "@/lib/dfs/types";
import { normalizeName, playerSpotLine } from "@/lib/utils";
import { CyBadge } from "./cy-badge";

export function Conf({ n }: { n: number }) {
  const w = Math.max(8, Math.min(100, n));
  return (
    <div className="bg-secondary mt-3 h-1 overflow-hidden rounded-full">
      <div className="bg-value h-full rounded-full" style={{ width: `${w}%` }} />
    </div>
  );
}

export function BetCard({ bet, kicker }: { bet: DeskBet; kicker?: string }) {
  return (
    <li className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-faint text-[10px] tracking-[0.18em] uppercase">{kicker ?? bet.market}</p>
        <p className="font-mono text-[11px] text-value tabular-nums">{bet.unit}</p>
      </div>
      <h3 className="display mt-1 text-2xl leading-none font-semibold">{bet.title}</h3>
      <p className="text-muted-foreground mt-1 text-xs">{bet.line}</p>
      <p className="mt-3 text-sm leading-snug">{bet.why}</p>
      <p className="text-ink mt-2 text-xs leading-snug">{bet.tape}</p>
      <Conf n={bet.confidence} />
      <p className="text-faint mt-2 font-mono text-[11px]">
        {bet.books} · conf {bet.confidence}
      </p>
    </li>
  );
}

export function findPlayer(players: Player[], name: string, team?: string): Player | undefined {
  const key = normalizeName(name);
  const hits = players.filter((p) => normalizeName(p.name) === key);
  if (team) {
    const t = hits.find((p) => p.team === team);
    if (t) return t;
  }
  return hits[0] ?? players.find((p) => normalizeName(p.name).includes(key) || key.includes(normalizeName(p.name)));
}

export function Spot({ player, games }: { player?: Player; games: Game[] }) {
  if (!player) return null;
  const line = playerSpotLine(player, { games });
  if (!line) return null;
  return <p className="text-muted-foreground mt-1 text-[11px]">{line}</p>;
}
export function splitPropPick(pick: string): { name: string; market: string } {
  const m = pick.match(/^(.*?)\s+([ou])(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (!m) return { name: pick, market: "" };
  const side = m[2]!.toLowerCase() === "o" ? "Over" : "Under";
  return { name: m[1]!, market: `${side} ${m[3]} ${m[4]}` };
}

export function PropCard({ bet, kicker, players, games }: { bet: DeskBet; kicker: string; players: Player[]; games: Game[] }) {
  const { name, market } = splitPropPick(bet.pick);
  const player = findPlayer(players, name);
  return (
    <li className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-faint text-[10px] tracking-[0.18em] uppercase">{kicker}</p>
        <p className="font-mono text-[11px] text-value tabular-nums">{bet.unit}</p>
      </div>
      <h3 className="display mt-1 flex items-center gap-2 text-2xl leading-none font-semibold">
        {name}
        <CyBadge cy={player?.contractYear} />
      </h3>
      <Spot player={player} games={games} />
      <p className="display mt-2 text-lg leading-none font-semibold text-value">{market || bet.title}</p>
      <p className="text-muted-foreground mt-1 text-xs">{bet.line}</p>
      <p className="mt-3 text-sm leading-snug">{bet.why}</p>
      <p className="text-ink mt-2 text-xs leading-snug">{bet.tape}</p>
      <Conf n={bet.confidence} />
      <p className="text-faint mt-2 font-mono text-[11px]">
        {bet.books} · conf {bet.confidence}
      </p>
    </li>
  );
}

export function TdLegCard({
  leg,
  i,
  players,
  games,
  compact,
}: {
  leg: TdLeg;
  i: number;
  players: Player[];
  games: Game[];
  compact?: boolean;
}) {
  const player = findPlayer(players, leg.name, leg.team);
  return (
    <li className="rounded-lg bg-secondary px-3 py-3">
      <p className="text-faint text-[10px] tracking-[0.16em] uppercase">
        Leg {i + 1}
        {leg.marketLabel ? ` · ${leg.marketLabel}` : leg.kind === "atd" ? " · ATD" : leg.kind === "multi_td" ? " · 2+ TD" : ""}
      </p>
      <p className={`display flex items-center gap-2 leading-none font-semibold ${compact ? "text-xl" : "text-2xl"}`}>
        {leg.name}
        <CyBadge cy={player?.contractYear} />
      </p>
      <Spot player={player} games={games} />
      <p className="text-muted-foreground mt-1 font-mono text-xs">
        {formatAmerican(leg.american)}
        {!player ? ` · ${leg.team} vs ${leg.opponent}` : ""}
      </p>
      <p className="mt-2 text-xs leading-snug">{leg.why}</p>
    </li>
  );
}
