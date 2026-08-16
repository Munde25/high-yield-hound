import { useCallback, useEffect, useRef, useState } from "react";
import { getDerivClient } from "@/lib/deriv/client";
import { FALLBACK_SYMBOLS } from "@/lib/deriv/catalog";
import { analyseSignals, type MarketSignals } from "@/lib/deriv/signals";
import type { DerivSymbol } from "@/lib/deriv/types";

const HISTORY = 1000;
const RECOMPUTE_MS = 1200;
const CONCURRENCY = 4;

/** Volatility / continuous indices — the markets digit contracts are valid on. */
export const VOLATILITY_SYMBOLS: DerivSymbol[] = FALLBACK_SYMBOLS.filter(
  (s) => s.supportsDigits,
);

type Phase = "connecting" | "loading" | "live" | "error";

export function useSignalFeed(symbols: DerivSymbol[] = VOLATILITY_SYMBOLS) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: symbols.length });
  const [markets, setMarkets] = useState<MarketSignals[]>([]);
  const [tickRate, setTickRate] = useState(1);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const ticksRef = useRef(new Map<string, number[]>());
  const decimalsRef = useRef(new Map<string, number>());
  const symbolRef = useRef(new Map<string, DerivSymbol>());
  const lastTickAt = useRef<number | null>(null);
  const intervals = useRef<number[]>([]);
  const dirty = useRef(false);

  const recompute = useCallback(() => {
    const out: MarketSignals[] = [];
    for (const [code, ticks] of ticksRef.current) {
      const symbol = symbolRef.current.get(code);
      if (!symbol || ticks.length < 120) continue;
      out.push(analyseSignals(symbol, ticks, decimalsRef.current.get(code)));
    }
    out.sort((a, b) => (b.top?.edge ?? -1) - (a.top?.edge ?? -1));
    setMarkets(out);
    setUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        const client = getDerivClient();
        await client.connect();
        if (cancelled) return;
        setPhase("loading");
        setProgress({ done: 0, total: symbols.length });

        let cursor = 0;
        const worker = async () => {
          while (cursor < symbols.length && !cancelled) {
            const symbol = symbols[cursor++]!;
            try {
              const { prices, pipSize } = await client.tickHistory(
                symbol.symbol,
                HISTORY,
              );
              if (prices.length >= 120) {
                ticksRef.current.set(symbol.symbol, prices);
                decimalsRef.current.set(symbol.symbol, pipSize);
                symbolRef.current.set(symbol.symbol, symbol);
                unsubscribers.push(
                  client.subscribeTicks(symbol.symbol, (price) => {
                    const prev = ticksRef.current.get(symbol.symbol) ?? [];
                    ticksRef.current.set(symbol.symbol, [
                      ...prev.slice(-(HISTORY - 1)),
                      price,
                    ]);
                    dirty.current = true;
                    const now = Date.now();
                    if (lastTickAt.current) {
                      intervals.current = [
                        ...intervals.current.slice(-40),
                        now - lastTickAt.current,
                      ];
                    }
                    lastTickAt.current = now;
                  }),
                );
              }
            } catch {
              /* symbols unavailable in this region are skipped */
            }
            if (!cancelled) {
              setProgress((p) => ({ ...p, done: p.done + 1 }));
              dirty.current = true;
            }
          }
        };
        await Promise.all(
          new Array(Math.min(CONCURRENCY, symbols.length)).fill(0).map(worker),
        );
        if (cancelled) return;
        recompute();
        setPhase(ticksRef.current.size > 0 ? "live" : "error");
        if (ticksRef.current.size === 0)
          setError("No volatility feeds are reachable from your region right now.");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Feed unavailable");
          setPhase("error");
        }
      }
    })();

    const timer = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      recompute();
      const list = intervals.current;
      if (list.length > 5) {
        const avg = list.reduce((a, b) => a + b, 0) / list.length;
        if (avg > 0) setTickRate(1000 / avg);
      }
    }, RECOMPUTE_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      for (const u of unsubscribers) u();
    };
  }, [symbols, recompute]);

  return { phase, error, progress, markets, tickRate, updatedAt };
}
