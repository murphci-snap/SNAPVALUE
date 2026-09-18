import { createFileRoute } from "@tanstack/react-router";
import { loadSlate } from "@/lib/dfs/api";
import type { SlateWindow } from "@/lib/dfs/types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=30",
};

const WINDOWS = new Set<SlateWindow>(["main", "sun1", "sunday", "sun4", "mnf", "tnf", "snf"]);

export const Route = createFileRoute("/api/slate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("draftGroupId");
        const draftGroupId = raw ? Number(raw) : undefined;
        const force = url.searchParams.get("force") === "1";
        const winRaw = url.searchParams.get("window");
        const window = winRaw && WINDOWS.has(winRaw as SlateWindow) ? (winRaw as SlateWindow) : undefined;
        const data = await loadSlate(Number.isFinite(draftGroupId) ? draftGroupId : undefined, force, window);
        const headers = {
          ...cors,
          "Cache-Control": data.ok
            ? "public, s-maxage=120, stale-while-revalidate=7200"
            : "no-store",
        };
        return Response.json(data, { headers });
      },
    },
  },
});
