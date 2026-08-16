import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Radar, ShieldAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useDerivScanner } from "@/hooks/useDerivScanner";
import { MarketRow } from "@/components/scanner/MarketRow";
import {
  ScannerToolbar,
  type ToolbarState,
} from "@/components/scanner/ScannerToolbar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deriv Edge Scanner — Win-Rate Analysis & Bot Export" },
      {
        name: "description",
        content:
          "Scan every open Deriv market on live tick data, rank digit and rise/fall strategies by statistical win rate, and export a matching DBot XML bot for each.",
      },
      { property: "og:title", content: "Deriv Edge Scanner — Win-Rate Analysis & Bot Export" },
      {
        property: "og:description",
        content:
          "Live Deriv market scanner ranking strategies by confidence-adjusted win rate, with one-click Deriv Bot XML export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { phase, error, analyses, progress, lastScan, fallback, rescan } =
    useDerivScanner();
  const [filters, setFilters] = useState<ToolbarState>({
    query: "",
    market: "all",
    strategy: "all",
    onlyEdge: false,
  });

  const markets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of analyses) seen.set(a.symbol.market, a.symbol.market_display_name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [analyses]);

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return analyses
      .map((a) => {
        if (filters.strategy === "all") return a;
        const match = a.candidates.find((c) => c.kind === filters.strategy);
        return match ? { ...a, best: match } : null;
      })
      .filter((a): a is (typeof analyses)[number] => a !== null)
      .filter((a) => filters.market === "all" || a.symbol.market === filters.market)
      .filter(
        (a) =>
          !q ||
          a.symbol.display_name.toLowerCase().includes(q) ||
          a.symbol.symbol.toLowerCase().includes(q),
      )
      .filter((a) => !filters.onlyEdge || a.best.edge > 0)
      .sort((a, b) => b.best.edge - a.best.edge);
  }, [analyses, filters]);

  const withEdge = analyses.filter((a) => a.best.edge > 0).length;
  const busy = phase === "connecting" || phase === "loading";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-eyebrow flex items-center gap-2">
              <Radar className="size-3.5 text-signal" />
              Deriv market intelligence
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Edge Scanner
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every open Deriv market is analysed on its last 500 live ticks. Each
              strategy is scored by its Wilson 95% confidence floor against the win
              rate the payout actually requires — then paired with a ready-to-load
              Deriv Bot file.
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="label-eyebrow">Markets scanned</p>
              <p className="num text-2xl font-semibold">{analyses.length}</p>
            </div>
            <div className="text-right">
              <p className="label-eyebrow">Positive edge</p>
              <p className="num text-2xl font-semibold text-signal">{withEdge}</p>
            </div>
            <div className="text-right">
              <p className="label-eyebrow">Feed</p>
              <p className="num flex items-center justify-end gap-1.5 text-sm">
                <Activity
                  className={
                    busy ? "size-3.5 animate-ticker text-caution" : "size-3.5 text-signal"
                  }
                />
                {busy ? "Streaming" : phase === "error" ? "Offline" : "Live"}
              </p>
            </div>
          </div>
        </div>

        {busy && (
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between">
              <span className="label-eyebrow">
                {phase === "connecting" ? "Connecting to Deriv" : "Pulling tick history"}
              </span>
              <span className="num text-xs text-muted-foreground">
                {progress.done}/{progress.total}
              </span>
            </div>
            <Progress
              value={progress.total ? (progress.done / progress.total) * 100 : 8}
            />
          </div>
        )}

        {phase === "error" && (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 text-danger" />
            <div>
              <p className="text-sm font-medium">Could not load the market feed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        )}
      </header>

      {fallback && !busy && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <Radar className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Deriv returned no market list for your region, so the scanner used its
            built-in symbol catalog. Every symbol shown below was still verified
            against the live tick feed — availability for actual trading depends on
            your Deriv account.
          </p>
        </div>
      )}

      <ScannerToolbar
        state={filters}
        markets={markets}
        onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
        onRescan={rescan}
        busy={busy}
      />

      <section className="mt-4 space-y-2" aria-label="Ranked markets">
        <div className="hidden grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_9rem_7rem_2rem] gap-3 px-3 md:grid">
          <span className="label-eyebrow">#</span>
          <span className="label-eyebrow">Market</span>
          <span className="label-eyebrow">Best strategy</span>
          <span className="label-eyebrow">Ticks</span>
          <span className="label-eyebrow">Edge</span>
          <span />
        </div>

        {rows.map((a, i) => (
          <MarketRow key={a.symbol.symbol} analysis={a} rank={i + 1} />
        ))}

        {!busy && rows.length === 0 && (
          <div className="panel p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No markets match the current filters.
            </p>
          </div>
        )}
      </section>

      <footer className="mt-10 flex items-start gap-3 rounded-lg border border-caution/30 bg-caution/5 p-4">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-caution" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Statistical analysis, not a guarantee</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Deriv synthetic indices are generated to be near-random, so most
            measured "edges" are short-lived sampling noise. Exported bot files
            include a loss multiplier that can escalate stakes quickly. Always
            load a bot on a demo account, verify each block, and never risk
            capital you cannot lose. Nothing here is financial advice.
          </p>
          <Badge variant="outline" className="num mt-1 text-[10px]">
            {lastScan ? `Last scan ${new Date(lastScan).toLocaleTimeString()}` : "Scanning…"}
          </Badge>
        </div>
      </footer>
    </main>
  );
}
