import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div role="img" aria-label="biasly News" className={cn("inline-flex flex-col items-end", className)}>
      <span aria-hidden="true" className={cn("font-bold leading-none tracking-[-0.065em]", compact ? "text-[28px]" : "text-[64px]")}>biasly</span>
      <span aria-hidden="true" className={cn("pr-1 font-semibold leading-tight", compact ? "text-[10px]" : "text-[22px] text-muted-foreground")}>News</span>
    </div>
  );
}
