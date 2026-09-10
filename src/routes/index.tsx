import { createFileRoute } from "@tanstack/react-router";
import { SnapApp } from "@/components/snapvalue/snap-app";
import { getSlate, peekSlate } from "@/lib/dfs/api";
import { REFRESH_MS } from "@/lib/dfs/constants";
import type { SlateResponse } from "@/lib/dfs/types";

function forPreview(data: SlateResponse): SlateResponse {
  if (!data.ok) return data;
  const featured = data.players.filter((p) => p.itFactor || p.isValuePlay);
  return { ...data, players: featured };
}

export const Route = createFileRoute("/")({
  loader: async () => {
    const cached = peekSlate();
    const data = cached ?? (await getSlate({ data: {} }));
    return forPreview(data);
  },
  staleTime: REFRESH_MS,
  component: Home,
  pendingComponent: Pending,
});

function Home() {
  const data = Route.useLoaderData();
  return <SnapApp initial={data} />;
}

function Pending() {
  return (
    <div className="hash-bg flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="display text-4xl font-semibold tracking-wide">SNAPVALUE</p>
      <p className="text-muted-foreground text-sm">Pulling Yahoo, CBS, FantasyPros, Vegas props, and X tape…</p>
    </div>
  );
}
