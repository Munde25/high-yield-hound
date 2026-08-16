import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confidenceLabel } from "@/lib/deriv/analysis";
import { symbolSupportsDigits } from "@/lib/deriv/catalog";
import type { MarketAnalysis } from "@/lib/deriv/types";
import { DigitHeatmap } from "./DigitHeatmap";
import { Sparkline } from "./Sparkline";
import { EdgeBadge, EdgeMeter } from "./EdgeMeter";
import { BotExportDialog } from "./BotExportDialog";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p className="num mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function MarketRow({ analysis, rank }: { analysis: MarketAnalysis; rank: number }) {
  const [open, setOpen] = useState(false);
  const best = analysis.best;
  const up = analysis.changePct >= 0;
  const hasDigits = symbolSupportsDigits(analysis.symbol);

  return (
    <div className="panel animate-rise overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[2.5rem_1fr] items-center gap-3 p-3 text-left transition-colors hover:bg-surface-raised md:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_9rem_7rem_2rem]"
      >
        <span className="num text-sm text-muted-foreground">
          {String(rank).padStart(2, "0")}
        </span>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {analysis.symbol.display_name}
            </p>
            <Badge variant="outline" className="num shrink-0 text-[10px]">
              {analysis.symbol.symbol}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {analysis.symbol.market_display_name} ·{" "}
            {analysis.symbol.submarket_display_name}
          </p>
        </div>

        <div className="hidden min-w-0 md:block">
          <p className="truncate text-sm font-medium text-signal">{best.name}</p>
          <p className="num mt-0.5 text-xs text-muted-foreground">
            hit {(best.hitRate * 100).toFixed(1)}% · floor{" "}
            {(best.confidenceFloor * 100).toFixed(1)}% · need{" "}
            {(best.breakEven * 100).toFixed(1)}%
          </p>
        </div>

        <div className="hidden md:block">
          <Sparkline values={analysis.ticks} />
        </div>

        <div className="hidden md:block">
          <EdgeBadge edge={best.edge} />
          <EdgeMeter edge={best.edge} className="mt-1.5" />
        </div>

        <ChevronDown
          className={cn(
            "hidden size-4 text-muted-foreground transition-transform md:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="animate-rise border-t border-border bg-background/40 p-4">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="label-eyebrow mb-2">
                {hasDigits
                  ? "Last-digit distribution (500 ticks)"
                  : "Recent tick path (500 ticks)"}
              </p>
              {hasDigits ? (
                <DigitHeatmap profile={analysis.digitProfile} />
              ) : (
                <div className="rounded-md border border-border bg-surface p-2">
                  <Sparkline values={analysis.ticks} height={64} />
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Last" value={analysis.lastPrice.toString()} />
                <Stat
                  label="Change"
                  value={`${up ? "+" : ""}${analysis.changePct.toFixed(3)}%`}
                />
                <Stat label="Tick vol" value={`${analysis.volatility.toFixed(4)}%`} />
                <Stat
                  label="Streak"
                  value={`${analysis.currentStreak.length} ${analysis.currentStreak.direction}`}
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {best.rationale} Sample confidence:{" "}
                <span className="text-foreground">{confidenceLabel(best.samples)}</span>{" "}
                ({best.samples} observations).
              </p>
            </div>

            <div>
              <p className="label-eyebrow mb-2">Ranked strategies for this market</p>
              <div className="space-y-1.5">
                {analysis.candidates.slice(0, 6).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="num text-[11px] text-muted-foreground">
                        {(c.hitRate * 100).toFixed(1)}% observed · break-even{" "}
                        {(c.breakEven * 100).toFixed(1)}%
                      </p>
                    </div>
                    <EdgeBadge edge={c.edge} />
                    <BotExportDialog analysis={analysis} strategy={c} triggerLabel="XML" />
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <BotExportDialog
                  analysis={analysis}
                  strategy={best}
                  triggerLabel={`Export best: ${best.name}`}
                />
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <a
                    href={`https://app.deriv.com/bot`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {up ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    Open DBot
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
