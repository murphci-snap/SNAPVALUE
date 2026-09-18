import { useEffect, useMemo, useState } from "react";
import { ledgerSummary, loadLedger, type GradedBet } from "@/lib/dfs/bet-ledger";
import { formatAmerican } from "@/lib/dfs/markets";
import { buildUfcDesk, publishedUfcBets } from "@/lib/ufc/desk";
import { settleUfcBets } from "@/lib/ufc/grade";
import { methodLabel } from "@/lib/ufc/scoring";
import type { UfcBet, UfcSlateData, UfcTrifecta } from "@/lib/ufc/types";

function Conf({ n }: { n: number }) {
  const w = Math.max(8, Math.min(100, n));
  return (
    <div className="bg-secondary mt-3 h-1 overflow-hidden rounded-full">
      <div className="bg-value h-full rounded-full" style={{ width: `${w}%` }} />
    </div>
  );
}

function comboPct(p: number): string {
  if (p < 0.04) return `${(p * 100).toFixed(1)}%`;
  return `${Math.round(p * 100)}%`;
}

function legKindLabel(kind: UfcTrifecta["legs"][number]["kind"]): string {
  if (kind === "ml") return "ML";
  if (kind === "ko") return "KO / TKO";
  if (kind === "sub") return "Submission";
  return "Decision";
}

function ParlayCard({
  ticket,
  kicker,
}: {
  ticket: UfcTrifecta;
  kicker: string;
}) {
  return (
    <article className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
          {kicker} · {ticket.unit}
          {ticket.priced ? "" : " · model lean"}
        </p>
        <p className="display text-3xl leading-none font-semibold">
          {ticket.combinedAmerican != null ? formatAmerican(ticket.combinedAmerican) : "—"}
          <span className="text-muted-foreground ml-2 font-sans text-sm font-normal">
            {comboPct(ticket.combinedProb)} combined
          </span>
        </p>
      </div>
      <ol className={`mt-4 grid gap-3 ${ticket.legs.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
        {ticket.legs.map((leg, i) => (
          <li key={`${leg.kind}-${leg.fightId}-${i}`} className="rounded-lg bg-secondary/60 px-3 py-3">
            <p className="text-faint text-[10px] tracking-[0.16em] uppercase">
              Leg {i + 1} · {legKindLabel(leg.kind)}
            </p>
            <h3 className="display mt-1 text-xl leading-none font-semibold">{leg.fighter}</h3>
            <p className="text-value mt-2 text-sm">
              {leg.kind === "ml" ? "ML" : `by ${methodLabel(leg.kind)}`}
              {leg.american != null ? ` ${formatAmerican(leg.american)}` : ""}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{leg.line}</p>
            <p className="text-ink mt-2 text-xs leading-snug">{leg.why}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-relaxed">{ticket.why}</p>
      <p className="text-ink mt-2 text-xs leading-relaxed">{ticket.tape}</p>
      <p className="text-faint mt-3 font-mono text-[11px]">
        {ticket.books} · conf {ticket.confidence} · all legs must hit
      </p>
    </article>
  );
}

function Card({ bet, kicker }: { bet: UfcBet; kicker: string }) {
  return (
    <li className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-faint text-[10px] tracking-[0.18em] uppercase">
          {kicker}
          {bet.priced ? "" : " · model lean"}
        </p>
        <p className="font-mono text-[11px] text-value tabular-nums">{bet.unit}</p>
      </div>
      <h3 className="display mt-1 text-2xl leading-none font-semibold">{bet.title}</h3>
      <p className="text-muted-foreground mt-1 text-xs">{bet.line}</p>
      <p className="text-value mt-2 text-sm">{bet.pick}</p>
      <p className="mt-3 text-sm leading-snug">{bet.why}</p>
      <p className="text-ink mt-2 text-xs leading-snug">{bet.tape}</p>
      <Conf n={bet.confidence} />
      <p className="text-faint mt-2 font-mono text-[11px]">
        {bet.books} · conf {bet.confidence}
      </p>
    </li>
  );
}

export function UfcBets({ data }: { data: UfcSlateData }) {
  const [history, setHistory] = useState<GradedBet[]>([]);
  const [open, setOpen] = useState(false);
  const desk = useMemo(
    () => buildUfcDesk(data.fights, data.allPlayers.length ? data.allPlayers : data.players),
    [data.fights, data.allPlayers, data.players],
  );
  const published = useMemo(() => publishedUfcBets(desk), [desk]);

  useEffect(() => {
    setHistory(loadLedger());
  }, []);

  useEffect(() => {
    const next = settleUfcBets({ bets: published, fights: data.fights, eventId: data.eventId, season: 2026 });
    setHistory(next);
  }, [published, data.fights, data.eventId]);

  const rec = useMemo(() => {
    const ufc = history.filter((b) => b.sport === "UFC" || b.week === data.eventId);
    return ledgerSummary(ufc, data.eventId, 2026);
  }, [history, data.eventId]);

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Track record</p>
            <h2 className="display text-2xl leading-none font-semibold">
              UFC {data.eventId} {rec.week.w}-{rec.week.l}
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
        {rec.weekRows.length ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-faint mt-3 text-xs tracking-wide uppercase">
            {open ? "Hide card" : "This card’s grades"}
          </button>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">Grades when the fight is final. Empty slots stay empty. Same ledger as NFL.</p>
        )}
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
        UFC 331 desk. Price is the prior. Edge is fair vs posted. Empty is better than a forced pick. Fun only.
        {desk.oddsOk ? ` Sources ${desk.sources.join(" · ")}.` : " Odds feed is down — card is up, bets stay empty."}
      </p>

      <section>
        <h2 className="display text-2xl font-semibold">Trifecta</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          One ticket. One KO/TKO winner, one submission winner, one decision winner — three different fights. Combined
          parlay price. All three must hit.
        </p>
        {desk.trifecta ? (
          <ParlayCard ticket={desk.trifecta} kicker="Trifecta parlay" />
        ) : (
          <p className="text-muted-foreground text-sm">{desk.trifectaNote || "Empty is better than a forced trifecta."}</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Props</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          Method, goes the distance, round totals. Min edge. Not the line vs itself.
        </p>
        {desk.props.length === 0 ? (
          <p className="text-muted-foreground text-sm">{desk.oddsOk ? "No method / distance / rounds prop clearing the bar." : "No posted props to work."}</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {desk.props.map((b) => (
              <Card key={b.id} bet={b} kicker={b.market} />
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Lotto</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">0.1u. Longshot dogs or method longshots. Different fights. Not an all-favorites parlay.</p>
        {desk.lotto.length === 0 ? (
          <p className="text-muted-foreground text-sm">No lotto number worth a dime.</p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {desk.lotto.map((b) => (
              <Card key={b.id} bet={b} kicker="0.1u lotto" />
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Lotto parlay</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
          One ticket. 3–4 different fights. Plus-money only. Ranked by model edge vs implied, not biggest plus money.
          0.1u. All legs must hit. Separate from the single lotto tickets.
        </p>
        {desk.lottoParlay ? (
          <ParlayCard ticket={desk.lottoParlay} kicker={`${desk.lottoParlay.legs.length}-leg lotto parlay`} />
        ) : (
          <p className="text-muted-foreground text-sm">Fewer than three longshots clear the edge floor. Empty beats a junk-dog pile.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Best value on the card</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">Highest edge. Prelims allowed. Fight, price, why, unit.</p>
        {desk.bestValue ? (
          <ol className="grid gap-3 md:max-w-xl">
            <Card bet={desk.bestValue} kicker={`${/\b(prelims|early)\b/.test(desk.bestValue.line) ? "Prelim" : "Main"} · best value`} />
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">No value bet clearing the floor.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Moneyline</h2>
        <p className="text-muted-foreground mb-4 max-w-2xl text-sm">Only when edge clears a floor. −400 and shorter is not automatic. No forced lock.</p>
        {desk.moneyline ? (
          <ol className="grid gap-3 md:max-w-xl">
            <Card bet={desk.moneyline} kicker="ML" />
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">No moneyline with a real edge. Heavy chalk stays on the board.</p>
        )}
      </section>
    </div>
  );
}
