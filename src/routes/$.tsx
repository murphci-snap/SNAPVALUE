import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias paths like /Players /GPP from preview hosts — keep the SPA on /. */
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
