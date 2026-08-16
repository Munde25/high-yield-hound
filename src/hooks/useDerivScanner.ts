import { useCallback, useEffect, useRef, useState } from "react";
import { getDerivClient } from "@/lib/deriv/client";
import { analyseMarket } from "@/lib/deriv/analysis";
import type { DerivSymbol, MarketAnalysis, ScanPhase } from "@/lib/deriv/types";

const TICK_COUNT = 500;
const CONCURRENCY = 5;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onEach?: () => void,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index] as T;
      try {
        results.push(await fn(item));
      } catch {
        /* symbols the feed rejects are dropped from the scan */
      }
      onEach?.();
    }
  });
  await Promise.all(workers);
  return results;
}

export function useDerivScanner() {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<DerivSymbol[]>([]);
  const [analyses, setAnalyses] = useState<MarketAnalysis[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const running = useRef(false);

  const scan = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setPhase("connecting");

    try {
      const client = getDerivClient();
      await client.connect();

      const { symbols: tradable, usedFallback } = await client.activeSymbols();
      setFallback(usedFallback);
      setSymbols(tradable);
      setProgress({ done: 0, total: tradable.length });
      setPhase("loading");

      const collected: MarketAnalysis[] = [];
      await mapLimit(
        tradable,
        CONCURRENCY,
        async (symbol) => {
          const { prices: ticks, pipSize } = await client.tickHistory(
            symbol.symbol,
            TICK_COUNT,
          );
          if (ticks.length < 60) return null;
          const analysis = analyseMarket(symbol, ticks, pipSize);
          if (!analysis.best) return null;
          collected.push(analysis);
          setAnalyses(
            [...collected].sort((a, b) => b.best.edge - a.best.edge),
          );
          return analysis;
        },
        () => setProgress((p) => ({ ...p, done: p.done + 1 })),
      );

      setLastScan(Date.now());
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setPhase("error");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  return {
    phase,
    error,
    symbols,
    analyses,
    progress,
    lastScan,
    fallback,
    rescan: scan,
  };
}

/** Live tick stream for a single symbol, appended onto a seeded history. */
export function useLiveTicks(symbol: string | null, seed: number[]) {
  const [ticks, setTicks] = useState<number[]>(seed);

  useEffect(() => {
    setTicks(seed);
  }, [symbol, seed]);

  useEffect(() => {
    if (!symbol) return;
    const client = getDerivClient();
    const unsubscribe = client.subscribeTicks(symbol, (price: number) => {
      setTicks((prev) => [...prev.slice(-(TICK_COUNT - 1)), price]);
    });
    return unsubscribe;
  }, [symbol]);

  return ticks;
}
