import { useMemo } from "react";
import { buildWeeklyDesk, type DeskBet } from "@/lib/dfs/desk";
import { formatAmerican, formatPct } from "@/lib/dfs/markets";
import type { Game, Player } from "@/lib/dfs/types";

function Conf({ n }: { n: number }) {
  const w = Math.max(8, Math.min(100, n));
  return (
    <div className="bg-secondary mt-3 h-1 overflow-hidden rounded-full">
      <div className="bg-value h-full rounded-full" style={{ width: `${w}%` }} />
    </div>
  );
}

function BetCard({ bet, kicker }: { bet: DeskBet; kicker?: string }) {
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

export function BetDesk({ games, players }: { games: Game[]; players: Player[] }) {
  const desk = useMemo(() => buildWeeklyDesk(games, players), [games, players]);

  return (
    <div className="flex flex-col gap-10">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Units: best bets and the spread lock are 1u. Player props and the moneyline dog are 0.5u. Two-leg ATD 0.5u.
        Lotto 0.1u. Fades are sit-outs, not bets. Fun only.
      </p>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-2xl font-semibold">Spread lock</h2>
          <p className="text-faint text-[11px] tracking-wide uppercase">{desk.sources.join(" · ")}</p>
        </div>
        {desk.spreadLock ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Against the spread · {desk.spreadLock.unit}</p>
              <p className="font-mono text-sm text-value tabular-nums">conf {desk.spreadLock.confidence}</p>
            </div>
            <h3 className="display mt-1 text-4xl leading-none font-semibold">{desk.spreadLock.pick}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{desk.spreadLock.line}</p>
            <p className="mt-4 text-sm leading-relaxed">{desk.spreadLock.why}</p>
            <p className="text-ink mt-2 text-sm leading-relaxed">{desk.spreadLock.tape}</p>
            <Conf n={desk.spreadLock.confidence} />
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">No spread posted yet.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Three best bets</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Always includes an under when a total is posted. One unit each. Do not parlay all three.
        </p>
        {desk.bestBets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Waiting on this week’s spreads and totals.</p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {desk.bestBets.map((bet, i) => (
              <BetCard key={bet.id} bet={bet} kicker={`${String(i + 1).padStart(2, "0")} · ${bet.market}`} />
            ))}
          </ol>
        )}
      </section>

      {desk.moneylineDog ? (
        <section>
          <h2 className="display text-2xl font-semibold">Moneyline dog</h2>
          <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
            Plus-money underdog with TD-market support. Half unit. Not a hail mary.
          </p>
          <ol className="grid gap-3 md:max-w-xl">
            <BetCard bet={desk.moneylineDog} kicker="Moneyline" />
          </ol>
        </section>
      ) : null}

      {desk.fades.length > 0 ? (
        <section>
          <h2 className="display text-2xl font-semibold">Sit these out</h2>
          <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
            Trap spots. Public will bet them. We do not.
          </p>
          <ol className="grid gap-3 md:grid-cols-3">
            {desk.fades.map((bet) => (
              <BetCard key={bet.id} bet={bet} kicker="Fade" />
            ))}
          </ol>
        </section>
      ) : null}

      <section>
        <h2 className="display text-2xl font-semibold">Player props</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          One over/under each: QB passing yards, RB rushing, RB receiving, WR receiving, TE receiving. Half unit.
        </p>
        {desk.playerProps.length === 0 ? (
          <p className="text-muted-foreground text-sm">Waiting on yardage props for this slate.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {desk.playerProps.map((bet) => (
              <BetCard
                key={bet.id}
                bet={bet}
                kicker={
                  bet.pick.includes("pass")
                    ? "QB pass"
                    : bet.pick.includes("rush")
                      ? "RB rush"
                      : bet.line.startsWith("RB")
                        ? "RB rec"
                        : bet.line.startsWith("WR")
                          ? "WR rec"
                          : "TE rec"
                }
              />
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Two-player anytime TD</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Two legs, two games. 0.5u. Not a same-game parlay.
        </p>
        {desk.atdParlay ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">2-leg ATD · 0.5u</p>
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
                  <p className="mt-2 text-xs leading-snug">{leg.why}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.atdParlay.why}</p>
            <p className="text-ink mt-2 text-xs leading-relaxed">{desk.atdParlay.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need two priced anytime-TD names on separate games.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Lotto ticket</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Five-player anytime TD. Five games. 0.1u. One miss kills it.
        </p>
        {desk.lottoTicket ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">5-leg ATD lotto · 0.1u</p>
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
                  <p className="mt-2 text-xs leading-snug">{leg.why}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.lottoTicket.why}</p>
            <p className="text-ink mt-2 text-xs leading-relaxed">{desk.lottoTicket.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need five priced anytime-TD names on separate games.</p>
        )}
      </section>
    </div>
  );
}
