import { useEffect, useMemo, useState } from "react";
import { buildWeeklyDesk, type DeskBet } from "@/lib/dfs/desk";
import { deskTighten, loadLedger, settleDesk, type GradedBet } from "@/lib/dfs/bet-ledger";
import { formatAmerican, formatPct } from "@/lib/dfs/markets";
import type { Game, Player } from "@/lib/dfs/types";
import { BetDeskWeeklyGrade } from "./bet-desk-weekly-grade";
import { BetCard, Conf, PropCard, TdLegCard } from "./bet-desk-cards";

function FadeBlock({ fades }: { fades: DeskBet[] }) {
  const shorts = fades.filter((b) => b.id.startsWith("fade-short"));
  const rest = fades.filter((b) => !b.id.startsWith("fade-short"));
  const teams = shorts.map((b) => b.title.replace(/^Fade\s+/, ""));
  return (
    <section>
      <h2 className="display text-2xl font-semibold">Sit these out</h2>
      <p className="text-muted-foreground mb-4 max-w-2xl text-sm">Trap spots. Public will bet them. We do not. 0u.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {shorts.length ? (
          <article className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
            <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Short favorites · coin-flip TD games</p>
            <h3 className="display mt-1 text-3xl leading-none font-semibold">{teams.join(" · ")}</h3>
            <p className="text-muted-foreground mt-3 text-sm">
              Same story on each: a short favorite in a coin-flip touchdown market. Casual money piles on. We stand down.
            </p>
          </article>
        ) : null}
        {rest.map((bet) => (
          <ol key={bet.id} className="grid">
            <BetCard bet={bet} kicker="Fade" />
          </ol>
        ))}
      </div>
    </section>
  );
}

export function BetDesk({
  games,
  players,
  week,
  season,
  site = "DK",
}: {
  games: Game[];
  players: Player[];
  week: number;
  season: number;
  site?: "DK" | "FD";
}) {
  const [history, setHistory] = useState<GradedBet[]>([]);
  const [ledger, setLedger] = useState<GradedBet[]>([]);
  useEffect(() => {
    setHistory(loadLedger());
  }, []);

  const tighten = useMemo(() => deskTighten(history), [history]);
  const desk = useMemo(() => buildWeeklyDesk(games, players, tighten), [games, players, tighten]);

  useEffect(() => {
    setLedger(settleDesk({ desk, games, players, week, season }));
  }, [desk, games, players, week, season]);

  return (
    <div className="flex flex-col gap-10">
      <BetDeskWeeklyGrade
        ledger={ledger}
        week={week}
        season={season}
        tightenNotes={desk.tightenNotes}
      />

      <p className="text-muted-foreground max-w-2xl text-sm">
        Units scale with edge: props and 2-leg ATD 0.25–0.75u. Totals only go to 1u on a large gap.
        3-leg ATD / 2+ TD 0.1–0.25u. Lotto 0.1u. Sits are 0u. Fun only.
      </p>
      {desk.remainingOnly ? (
        <p className="text-faint -mt-6 font-mono text-[11px] tracking-wide uppercase">
          Remaining games this week — started / final slates are off the board
        </p>
      ) : null}
      {desk.easeNote ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {desk.easeNote}
        </p>
      ) : null}

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
          <p className="text-muted-foreground text-sm">No spread with a real edge on remaining games.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Best bets</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          {desk.weekendEase
            ? "0–2 cards on the Saturday-eased bar. Still not forced — empty beats junk. Do not parlay them."
            : "0–2 cards that clear a higher edge bar. Empty is better than a forced pick. Do not parlay them."}
        </p>
        {desk.bestBets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No spread or total clearing the bar on remaining games.</p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-2">
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

      {desk.fades.length > 0 ? <FadeBlock fades={desk.fades} /> : null}

      <section>
        <h2 className="display text-2xl font-semibold">Player props</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Yard props only with ≥2 books and a real gap vs an independent pace number. Empty slot if one book or no edge.
        </p>
        {desk.playerProps.length === 0 ? (
          <p className="text-muted-foreground text-sm">No two-book yard props clearing the bar.</p>
        ) : site === "FD" && desk.playerProps.filter((b) => /fanduel/i.test(b.books)).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            FanDuel isn’t on a two-book prop that clears the bar. Lineups stay DraftKings until FD salaries post.
          </p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(site === "FD" ? desk.playerProps.filter((b) => /fanduel/i.test(b.books)) : desk.playerProps).map((bet) => (
              <PropCard
                key={bet.id}
                bet={bet}
                players={players}
                games={games}
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
          Two legs, two games. Skill-first; extra QBs only with real edge. {desk.atdParlay?.unit ?? "0.25–0.75u"} by edge.
        </p>
        {desk.atdParlay ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
                2-leg ATD · {desk.atdParlay.unit ?? "0.5u"}
              </p>
              <p className="display text-3xl leading-none font-semibold">
                {formatAmerican(desk.atdParlay.combinedAmerican)}
                <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                  {formatPct(desk.atdParlay.combinedProb)} combined
                </span>
              </p>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-2">
              {desk.atdParlay.legs.map((leg, i) => (
                <TdLegCard key={leg.name} leg={leg} i={i} players={players} games={games} />
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.atdParlay.why}</p>
            <p className="text-ink mt-2 text-xs leading-relaxed">{desk.atdParlay.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need 2 mid-board priced ATDs with a real edge, separate remaining games.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Three-player anytime TD</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Three legs, three games. Skill-first; extra QBs only with real edge. 0.25u. Not a same-game parlay.
        </p>
        {desk.atdParlay3 ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
                3-leg ATD · {desk.atdParlay3.unit ?? "0.25u"}
              </p>
              <p className="display text-3xl leading-none font-semibold">
                {formatAmerican(desk.atdParlay3.combinedAmerican)}
                <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                  {formatPct(desk.atdParlay3.combinedProb)} combined
                </span>
              </p>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {desk.atdParlay3.legs.map((leg, i) => (
                <TdLegCard key={leg.name} leg={leg} i={i} players={players} games={games} />
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.atdParlay3.why}</p>
            <p className="text-ink mt-2 text-xs leading-relaxed">{desk.atdParlay3.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need 3 strong priced ATDs on separate remaining games. Hidden when the board is thin.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Two-player 2+ TD</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Two legs, two games. 2+ TDs when the model supports it, otherwise mix an ATD. {desk.multiTdParlay?.unit ?? "0.25u"}.
          Not a same-game parlay.
        </p>
        {desk.multiTdParlay ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
                Multi-TD parlay · {desk.multiTdParlay.unit ?? "0.25u"}
              </p>
              <p className="display text-3xl leading-none font-semibold">
                {formatAmerican(desk.multiTdParlay.combinedAmerican)}
                <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                  {formatPct(desk.multiTdParlay.combinedProb)} combined
                </span>
              </p>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-2">
              {desk.multiTdParlay.legs.map((leg, i) => (
                <TdLegCard key={leg.name} leg={leg} i={i} players={players} games={games} />
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.multiTdParlay.why}</p>
            <p className="text-ink mt-2 text-xs leading-relaxed">{desk.multiTdParlay.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need two 2+ TD candidates on separate games.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Lotto ticket</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Five-player anytime TD. Skill-first; extra QBs only with real edge. Posted prices only. 0.1u.
        </p>
        {desk.lottoTicket ? (
          <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
                {desk.lottoTicket.legs.length}-leg ATD lotto · 0.1u
              </p>
              <p className="display text-3xl leading-none font-semibold">
                {formatAmerican(desk.lottoTicket.combinedAmerican)}
                <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                  {formatPct(desk.lottoTicket.combinedProb)} combined
                </span>
              </p>
            </div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {desk.lottoTicket.legs.map((leg, i) => (
                <TdLegCard key={leg.name} leg={leg} i={i} players={players} games={games} compact />
              ))}
            </ol>
            <p className="mt-4 text-sm leading-relaxed">{desk.lottoTicket.why}</p>
            <p className="text-ink mt-2 text-xs leading-relaxed">{desk.lottoTicket.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground text-sm">Need 5 mid-priced ATDs on separate remaining games. Default empty when the board is thin.</p>
        )}
      </section>
    </div>
  );
}
