import { cn } from "@/lib/utils";

export function EdgeMeter({
  edge,
  className,
}: {
  edge: number;
  /** extra classes */
  className?: string;
}) {
  // Map edge (-0.08 .. +0.08) onto 0..100
  const clamped = Math.max(-0.08, Math.min(0.08, edge));
  const width = ((clamped + 0.08) / 0.16) * 100;
  const tone =
    edge > 0.01 ? "bg-signal" : edge > 0 ? "bg-caution" : "bg-danger";

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tone)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function EdgeBadge({ edge }: { edge: number }) {
  const positive = edge > 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold",
        positive
          ? "bg-signal/15 text-signal"
          : edge > -0.02
            ? "bg-caution/15 text-caution"
            : "bg-danger/15 text-danger",
      )}
    >
      {positive ? "+" : ""}
      {(edge * 100).toFixed(2)} pp
    </span>
  );
}
