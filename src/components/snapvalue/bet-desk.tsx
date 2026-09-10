import { useMemo } from "react";
import { buildWeeklyDesk } from "@/lib/dfs/desk";
import { formatAmerican, formatPct } from "@/lib/dfs/markets";
import type { Game, Player } from "@/lib/dfs/types";

export function BetDesk({ games, players }: { games: Game[]; players: Player[] }) {
  const desk = useMemo(() => buildWeeklyDesk(games, players), [games, players]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-2xl font-semibold">Three best bets</h2>
          <p className="text-faint text-[11px] tracking-wide uppercase">{desk.sources.join(" · ")}</p>
        </div>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Grok prices the board against Vegas/FanDuel numbers, then checks public tape and X ATD chatter. These are
          sides and totals — not DFS.
        </p>
        {desk.bestBets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Waiting on this week’s spreads and totals.</p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {desk.bestBets.map((bet, i) => (
              <li key={bet.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
                <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
                  {String(i + 1).padStart(2, "0")} · {bet.market}
                </p>
                <h3 className="display mt-1 text-2xl leading-none font-semibold">{bet.title}</h3>
                <p className="text-muted-foreground mt-1 text-[12px]">{bet.line}</p>
                <p className="mt-3 text-sm leading-snug">{bet.why}</p>
                <p className="text-ink mt-2 text-[12px] leading-snug">{bet.tape}</p>
                <p className="text-faint mt-3 font-mono text-[11px]">
                  {bet.books} · confidence {bet.confidence}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Spread lock</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          One ATS card for the week. If it also sits in the three best bets, that is the number we want on the card.
        </p>
        {desk.spreadLock ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)] md:max-w-xl">
            <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Against the spread</p>
            <h3 className="display mt-1 text-4xl leading-none font-semibold">{desk.spreadLock.pick}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{desk.spreadLock.line}</p>
            <p className="mt-4 text-sm leading-relaxed">{desk.spreadLock.why}</p>
            <p className="text-ink mt-2 text-sm leading-relaxed">{desk.spreadLock.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">No spread posted yet.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Two-player anytime TD</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Two legs, two games. Built from Vegas anytime-TD prices, smash matchups, and independent kickoffs — not a
          same-game parlay lottery.
        </p>
        {desk.atdParlay ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">2-leg ATD</p>
              <p className="display text-3xl leading-none font-semibold">
                {formatAmerican(desk.atdParlay.combinedAmerican)}
                <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                  {formatPct(desk.atdParlay.combinedProb)} combined
                </span>
              </p>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-2">
              {desk.atdParlay.legs.map((leg, i) => (
                <li key={leg.name} className="rounded-lg bg-secondary px-3 py-3">
                  <p className="text-faint text-[10px] tracking-[0.16em] uppercase">Leg {i + 1}</p>
                  <p className="display text-2xl leading-none font-semibold">{leg.name}</p>
                  <p className="text-muted-foreground mt-1 font-mono text-sm">
                    {formatAmerican(leg.american)} · {leg.team} vs {leg.opponent}
                  </p>
                  <p className="mt-2 text-[12px] leading-snug">{leg.why}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.atdParlay.why}</p>
            <p className="text-ink mt-2 text-[12px] leading-relaxed">{desk.atdParlay.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need two priced anytime-TD names on separate games.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Lotto ticket</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Five-player anytime TD. Five different games, long shot, one unit you can lose smiling. Not the two-leg card.
        </p>
        {desk.lottoTicket ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">5-leg ATD lotto</p>
              <p className="display text-3xl leading-none font-semibold">
                {formatAmerican(desk.lottoTicket.combinedAmerican)}
                <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                  {formatPct(desk.lottoTicket.combinedProb)} combined
                </span>
              </p>
            </div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {desk.lottoTicket.legs.map((leg, i) => (
                <li key={leg.name} className="rounded-lg bg-secondary px-3 py-3">
                  <p className="text-faint text-[10px] tracking-[0.16em] uppercase">Leg {i + 1}</p>
                  <p className="display text-xl leading-none font-semibold">{leg.name}</p>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {formatAmerican(leg.american)} · {leg.team} vs {leg.opponent}
                  </p>
                  <p className="mt-2 text-[12px] leading-snug">{leg.why}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.lottoTicket.why}</p>
            <p className="text-ink mt-2 text-[12px] leading-relaxed">{desk.lottoTicket.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need five priced anytime-TD names on separate games.</p>
        )}
      </section>
    </div>
  );
}
