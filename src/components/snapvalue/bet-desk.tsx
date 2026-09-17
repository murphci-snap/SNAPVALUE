import { useEffect, useMemo, useState } from "react";
import { buildWeeklyDesk, type DeskBet } from "@/lib/dfs/desk";
import { deskTighten, ledgerSummary, loadLedger, settleDesk, type GradedBet } from "@/lib/dfs/bet-ledger";
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

function splitPropPick(pick: string): { name: string; market: string } {
  const m = pick.match(/^(.*?)\s+([ou])(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (!m) return { name: pick, market: "" };
  const side = m[2]!.toLowerCase() === "o" ? "Over" : "Under";
  return { name: m[1]!, market: `${side} ${m[3]} ${m[4]}` };
}

function PropCard({ bet, kicker }: { bet: DeskBet; kicker: string }) {
  const { name, market } = splitPropPick(bet.pick);
  return (
    <li className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-faint text-[10px] tracking-[0.18em] uppercase">{kicker}</p>
        <p className="font-mono text-[11px] text-value tabular-nums">{bet.unit}</p>
      </div>
      <h3 className="display mt-1 text-2xl leading-none font-semibold">{name}</h3>
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

export function BetDesk({
  games,
  players,
  week,
  season,
}: {
  games: Game[];
  players: Player[];
  week: number;
  season: number;
}) {
  const [history, setHistory] = useState<GradedBet[]>([]);
  const [ledger, setLedger] = useState<GradedBet[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHistory(loadLedger());
  }, []);

  const tighten = useMemo(() => deskTighten(history), [history]);
  const desk = useMemo(() => buildWeeklyDesk(games, players, tighten), [games, players, tighten]);

  useEffect(() => {
    setLedger(settleDesk({ desk, games, players, week, season }));
  }, [desk, games, players, week, season]);

  const rec = useMemo(() => ledgerSummary(ledger, week, season), [ledger, week, season]);

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Track record</p>
            <h2 className="display text-2xl leading-none font-semibold">
              WK {week} {rec.week.w}-{rec.week.l}
              <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
                season {rec.season.w}-{rec.season.l}
              </span>
            </h2>
          </div>
          <p className="font-mono text-sm tabular-nums">
            <span className={rec.season.units >= 0 ? "text-value" : "text-warn"}>
              {rec.season.units >= 0 ? "+" : ""}
              {rec.season.units.toFixed(2)}u
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {rec.season.w + rec.season.l ? `${Math.round(rec.season.hit * 100)}%` : "—"} hit
            </span>
          </p>
        </div>
        {Object.keys(rec.byMarket).length ? (
          <p className="text-muted-foreground mt-2 font-mono text-[11px]">
            {Object.entries(rec.byMarket)
              .map(([k, v]) => `${k} ${v.w}-${v.l}`)
              .join(" · ")}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">Grades when games are final. Nothing settled yet.</p>
        )}
        {desk.tightenNotes.length ? (
          <p className="text-ink mt-2 text-xs">{desk.tightenNotes.join(" · ")}</p>
        ) : null}
        {rec.weekRows.length ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-faint mt-3 text-xs tracking-wide uppercase"
          >
            {open ? "Hide week" : "This week’s grades"}
          </button>
        ) : null}
        {open ? (
          <ol className="mt-3 flex flex-col gap-1.5">
            {rec.weekRows.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-faint mr-2 font-mono text-[10px] uppercase">{b.market}</span>
                  {b.pick}
                </span>
                <span className={`shrink-0 font-mono text-xs tabular-nums ${b.result === "win" ? "text-value" : b.result === "loss" ? "text-warn" : "text-muted-foreground"}`}>
                  {b.result} {b.pnl > 0 ? "+" : ""}
                  {b.pnl.toFixed(2)}u
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <p className="text-muted-foreground max-w-2xl text-sm">
        Units scale with edge: props and 2-leg ATD 0.25–0.75u. Totals only go to 1u on a large gap.
        3-leg ATD / 2+ TD 0.1–0.25u. Lotto 0.1u. Sits are 0u. Fun only.
      </p>
      {desk.remainingOnly ? (
        <p className="text-faint -mt-6 font-mono text-[11px] tracking-wide uppercase">
          Remaining games this week — started / final slates are off the board
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
          0–2 cards that clear a higher edge bar. Empty is better than a forced pick. Do not parlay them.
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
          Yard props only with ≥2 books and a real gap vs an independent pace number. Empty slot if one book or no edge.
        </p>
        {desk.playerProps.length === 0 ? (
          <p className="text-muted-foreground text-sm">No two-book yard props clearing the bar.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {desk.playerProps.map((bet) => (
              <PropCard
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
                <li key={leg.name} className="rounded-lg bg-secondary px-3 py-3">
                  <p className="text-faint text-[10px] tracking-[0.16em] uppercase">
                    Leg {i + 1} · {leg.marketLabel ?? (leg.kind === "atd" ? "ATD" : "2+ TD")}
                  </p>
                  <p className="display text-2xl leading-none font-semibold">{leg.name}</p>
                  <p className="text-muted-foreground mt-1 font-mono text-sm">
                    {formatAmerican(leg.american)} · {leg.team} vs {leg.opponent}
                  </p>
                  <p className="mt-2 text-xs leading-snug">{leg.why}</p>
                </li>
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
          <p className="text-muted-foreground text-sm">Need 5 mid-priced ATDs on separate remaining games. Default empty when the board is thin.</p>
        )}
      </section>
    </div>
  );
}
