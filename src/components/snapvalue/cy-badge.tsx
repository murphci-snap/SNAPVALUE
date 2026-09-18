import type { ContractYear } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export function CyBadge({ cy }: { cy?: ContractYear | null }) {
  if (!cy) return null;
  return (
    <span
      title={cy.blurb}
      className="inline-flex shrink-0 items-center rounded-full bg-[#f0c14b] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#1a1408]"
    >
      CY
    </span>
  );
}

export function NameWithCy({
  name,
  cy,
  className,
}: {
  name: string;
  cy?: ContractYear | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}>
      <span className="truncate">{name}</span>
      <CyBadge cy={cy} />
    </span>
  );
}

/** Quiet key under the NFL/NBA Players filters. */
export function CyLegend() {
  return (
    <p className="text-muted-foreground -mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span
        className="inline-flex shrink-0 items-center rounded-full bg-[#f0c14b] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#1a1408]"
        aria-hidden
      >
        CY
      </span>
      <span>= contract year (final year of deal / UFA after this season)</span>
    </p>
  );
}
