import { useMemo } from "react";
import { buildNbaDesk } from "@/lib/nba/desk";
import type { NbaSlateData } from "@/lib/nba/types";
import { playerSpotLine } from "@/lib/utils";

export function NbaBets({ data }: { data: NbaSlateData }) {
  const desk = useMemo(() => buildNbaDesk(data.games, data.players), [data.games, data.players]);
  return (
    <div className="flex flex-col gap-10">
      <p className="text-muted-foreground max-w-2xl text-sm">
        NBA desk: spreads, totals, and player props (points, boards, dimes, threes). No anytime-TD or lotto. Empty
        when there’s no edge. Fun only.
      </p>
      {desk.remainingOnly ? (
        <p className="text-faint -mt-6 font-mono text-[11px] tracking-wide uppercase">Remaining games — started slates are off the board</p>
      ) : null}

      <section>
        <h2 className="display text-2xl font-semibold">Spread lock</h2>
        {desk.spreadLock ? (
          <article className="mt-3 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <p className="text-faint text-[10px] tracking-[0.18em] uppercase">Against the spread · {desk.spreadLock.unit}</p>
            <h3 className="display mt-1 text-4xl font-semibold">{desk.spreadLock.pick}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{desk.spreadLock.line}</p>
            <p className="mt-3 text-sm">{desk.spreadLock.why}</p>
            <p className="text-ink mt-2 text-sm">{desk.spreadLock.tape}</p>
          </article>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No spread with a real edge on remaining games.</p>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Totals</h2>
        {desk.totals.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No total clearing a 4-point implied gap.</p>
        ) : (
          <ol className="mt-3 grid gap-3 md:grid-cols-2">
            {desk.totals.map((b) => (
              <li key={b.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
                <p className="font-mono text-[11px] text-value">{b.unit}</p>
                <h3 className="display text-2xl font-semibold">{b.title}</h3>
                <p className="text-muted-foreground text-xs">{b.line}</p>
                <p className="mt-2 text-sm">{b.why}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="display text-2xl font-semibold">Player props</h2>
        <p className="text-muted-foreground mb-3 text-sm">Points, rebounds, assists, threes. Empty slot if no gap.</p>
        {desk.props.length === 0 ? (
          <p className="text-muted-foreground text-sm">No player props clearing the bar.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {desk.props.map((b) => {
              const p = data.players.find((x) => b.pick.startsWith(x.name));
              return (
                <li key={b.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
                  <p className="font-mono text-[11px] text-value">{b.unit}</p>
                  <h3 className="display text-2xl font-semibold">{b.title}</h3>
                  {p ? <p className="text-muted-foreground text-[11px]">{playerSpotLine(p, { games: data.games, weather: false })}</p> : null}
                  <p className="text-value mt-2 text-lg">{b.pick.replace(b.title, "").trim()}</p>
                  <p className="mt-2 text-sm">{b.why}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {desk.fades.length ? (
        <section>
          <h2 className="display text-2xl font-semibold">Sit these out</h2>
          <ol className="mt-3 grid gap-3 md:grid-cols-3">
            {desk.fades.map((b) => (
              <li key={b.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
                <h3 className="display text-2xl font-semibold">{b.title}</h3>
                <p className="text-muted-foreground text-xs">{b.line}</p>
                <p className="mt-2 text-sm">{b.why}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
