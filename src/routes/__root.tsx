import { createRootRoute, HeadContent, Navigate, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Providers } from "@/components/providers";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  notFoundComponent: () => <Navigate to="/" replace />,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SNAPVALUE — NFL DFS values, lineups, survivor" },
      {
        name: "description",
        content:
          "NFL DFS command center — DraftKings values, IT Factor, optimum lineups, survivor / loser pools, and a public gradebook. For entertainment only.",
      },
      { name: "theme-color", content: "#0b0d0c" },
      { property: "og:title", content: "SNAPVALUE — NFL DFS values, lineups, survivor" },
      {
        property: "og:description",
        content:
          "Read the tape. Spend the cap. Smash the slate — values, lineups, and survivor without accounts.",
      },
      { property: "og:image", content: "/command-center.jpg" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-dvh">
        <PreviewHostBridge />
        <AuthProvider>
          <Providers>
            <Outlet />
          </Providers>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
