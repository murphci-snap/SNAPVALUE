import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase",
  {
    variants: {
      variant: {
        default: "bg-secondary text-muted-foreground",
        value: "bg-value/15 text-value",
        hot: "bg-hot/15 text-hot",
        warn: "bg-warn/15 text-warn",
        outline: "shadow-[var(--shadow-border)] text-muted-foreground",
        it: "bg-ink/20 text-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
