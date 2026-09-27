import type { ComponentProps } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type CategoryChipProps = ComponentProps<"button"> & { selected?: boolean; showIcon?: boolean };

export function CategoryChip({ selected = false, showIcon = true, className, children, ...props }: CategoryChipProps) {
  const Icon = selected ? Check : Plus;
  return (
    <button type="button" aria-pressed={selected} className={cn("inline-flex min-h-8 items-center gap-3 rounded-md border border-transparent bg-secondary px-3 py-1 text-caption font-medium hover:border-foreground/30 active:bg-border disabled:pointer-events-none disabled:opacity-50", selected && "border-foreground bg-foreground text-background", className)} {...props}>
      {children}{showIcon && <Icon size={14} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
