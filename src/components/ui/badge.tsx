import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        neu: "border-transparent bg-status-neu/10 text-status-neu",
        bestaetigt: "border-transparent bg-status-bestaetigt/10 text-status-bestaetigt",
        abgelehnt: "border-transparent bg-status-abgelehnt/10 text-status-abgelehnt",
        abgeschlossen:
          "border-transparent bg-status-abgeschlossen/10 text-status-abgeschlossen",
        storniert: "border-transparent bg-status-storniert/10 text-status-storniert",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
