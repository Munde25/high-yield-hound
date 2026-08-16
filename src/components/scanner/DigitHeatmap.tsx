import { cn } from "@/lib/utils";
import type { DigitProfile } from "@/lib/deriv/types";

export function DigitHeatmap({
  profile,
  compact = false,
}: {
  profile: DigitProfile;
  compact?: boolean;
}) {
  const max = Math.max(...profile.frequencies, 0.0001);

  return (
    <div className="flex items-end gap-1">
      {profile.frequencies.map((f, digit) => {
        const height = compact ? 24 : 64;
        const isHot = digit === profile.hottest;
        const isCold = digit === profile.coldest;
        return (
          <div key={digit} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="relative w-full rounded-sm bg-muted"
              style={{ height }}
              title={`Digit ${digit}: ${(f * 100).toFixed(1)}%`}
            >
              <div
                className={cn(
                  "absolute bottom-0 w-full rounded-sm transition-all duration-500",
                  isHot ? "bg-signal" : isCold ? "bg-danger" : "bg-accent/60",
                )}
                style={{ height: `${(f / max) * 100}%` }}
              />
            </div>
            <span
              className={cn(
                "num text-[10px]",
                isHot ? "text-signal" : isCold ? "text-danger" : "text-muted-foreground",
              )}
            >
              {digit}
            </span>
            {!compact && (
              <span className="num text-[10px] text-muted-foreground">
                {(f * 100).toFixed(0)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
