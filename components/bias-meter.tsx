import { cn } from "@/lib/utils";

export type FramingPercentages = { left: number; center: number; right: number };

export function BiasMeter({ percentages, showAxis = false, showLegend = false, compact = false, className }: { percentages?: FramingPercentages | null; showAxis?: boolean; showLegend?: boolean; compact?: boolean; className?: string }) {
  const values = percentages ? [percentages.left, percentages.center, percentages.right] : [];
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > 0.01) {
    return <p className="text-caption text-muted-foreground">AI-estimated framing unavailable</p>;
  }
  const segments = [
    { label: "Left", value: values[0], color: "bg-framing-left text-white" },
    { label: "Center", value: values[1], color: "bg-framing-center text-[#0d0d0f]" },
    { label: "Right", value: values[2], color: "bg-framing-right text-white" },
  ];
  const inlineLabelMinimum = compact ? 16 : 20;
  const label = segments.map((segment) => segment.label + " " + segment.value + "%").join(", ");
  return (
    <div className={cn("min-w-0", className)}>
      <div role="img" aria-label={"AI-estimated framing: " + label} className={cn("flex overflow-hidden rounded-sm", compact ? "h-4" : "h-7")}>
        {segments.map(({ label, value, color }) => <div key={label} aria-hidden="true" style={{ width: value + "%" }} className={cn("flex min-w-0 items-center justify-center font-semibold", compact ? "text-[9px]" : "text-[10px]", color)}>{value >= inlineLabelMinimum && <span className="truncate px-1">{label} {value}%</span>}</div>)}
      </div>
      {showLegend && <div aria-hidden="true" className="mt-2 grid grid-cols-3 gap-2 text-caption"><span>Left {segments[0].value}%</span><span className="text-center">Center {segments[1].value}%</span><span className="text-right">Right {segments[2].value}%</span></div>}
      {showAxis && <div aria-hidden="true" className="mt-2 flex justify-between text-caption text-muted-foreground"><span>0%</span><span>50%</span><span>100%</span></div>}
    </div>
  );
}
