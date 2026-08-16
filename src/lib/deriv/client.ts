import { FALLBACK_SYMBOLS } from "./catalog";
import type { DerivSymbol } from "./types";

const APP_ID = "1089"; // Deriv's public demo app_id — read-only market data
const ENDPOINT = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

type Pending = {
  resolve: (v: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type TickHandler = (price: number, epoch: number) => void;

/**
 * Thin browser-only client over the Deriv WebSocket API.
 * Handles req_id correlation, reconnection and tick subscriptions.
 */
export class DerivClient {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pending = new Map<number, Pending>();
  private tickHandlers = new Map<string, Set<TickHandler>>();
  private subscriptionIds = new Map<string, string>();
  private openPromise: Promise<void> | null = null;

  onStatus: (status: "connecting" | "open" | "closed") => void = () => {};

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.openPromise) return this.openPromise;

    this.onStatus("connecting");
    this.openPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(ENDPOINT);
      this.ws = ws;

      const failTimer = setTimeout(
        () => reject(new Error("Timed out connecting to Deriv")),
        15000,
      );

      ws.onopen = () => {
        clearTimeout(failTimer);
        this.onStatus("open");
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(failTimer);
        reject(new Error("Could not reach the Deriv market feed"));
      };
      ws.onclose = () => {
        this.onStatus("closed");
        this.openPromise = null;
        this.subscriptionIds.clear();
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error("Connection closed"));
        }
        this.pending.clear();
      };
      ws.onmessage = (event) => this.handleMessage(event.data as string);
    }).finally(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) this.openPromise = null;
    });

    return this.openPromise;
  }

  private handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const tick = msg["tick"] as
      | { symbol: string; quote: number; epoch: number; id?: string }
      | undefined;
    if (tick) {
      if (tick.id) this.subscriptionIds.set(tick.symbol, tick.id);
      const handlers = this.tickHandlers.get(tick.symbol);
      if (handlers) for (const h of handlers) h(tick.quote, tick.epoch);
      return;
    }

    const id = msg["req_id"] as number | undefined;
    if (typeof id !== "number") return;
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);

    const error = msg["error"] as { message?: string; code?: string } | undefined;
    if (error) p.reject(new Error(error.message ?? error.code ?? "Deriv API error"));
    else p.resolve(msg);
  }

  async send(payload: Record<string, unknown>, timeoutMs = 20000) {
    await this.connect();
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");

    const req_id = this.reqId++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error("Deriv request timed out"));
      }, timeoutMs);
      this.pending.set(req_id, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...payload, req_id }));
    });
  }

  /**
   * Deriv returns an empty active_symbols list for restricted regions, so we
   * fall back to the built-in catalog. Unavailable symbols are dropped later
   * when their tick history request fails.
   */
  async activeSymbols(): Promise<{ symbols: DerivSymbol[]; usedFallback: boolean }> {
    let list: DerivSymbol[] = [];
    try {
      const res = await this.send({ active_symbols: "brief", product_type: "basic" });
      list = (res["active_symbols"] as DerivSymbol[]) ?? [];
    } catch {
      list = [];
    }
    const tradable = list.filter(
      (s) => s.exchange_is_open === 1 && s.is_trading_suspended === 0,
    );
    if (tradable.length > 0) return { symbols: tradable, usedFallback: false };
    return { symbols: FALLBACK_SYMBOLS, usedFallback: true };
  }

  async tickHistory(
    symbol: string,
    count = 500,
  ): Promise<{ prices: number[]; pipSize: number }> {
    const res = await this.send({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: "latest",
      style: "ticks",
    });
    const history = res["history"] as { prices?: number[] } | undefined;
    const pipSize = Number(res["pip_size"] ?? 2);
    return {
      prices: (history?.prices ?? []).map(Number).filter((n) => Number.isFinite(n)),
      pipSize: Number.isFinite(pipSize) ? pipSize : 2,
    };
  }

  subscribeTicks(symbol: string, handler: TickHandler): () => void {
    let set = this.tickHandlers.get(symbol);
    if (!set) {
      set = new Set();
      this.tickHandlers.set(symbol, set);
      void this.send({ ticks: symbol, subscribe: 1 }).catch(() => {});
    }
    set.add(handler);

    return () => {
      const current = this.tickHandlers.get(symbol);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) {
        this.tickHandlers.delete(symbol);
        const subId = this.subscriptionIds.get(symbol);
        if (subId) {
          this.subscriptionIds.delete(symbol);
          void this.send({ forget: subId }).catch(() => {});
        }
      }
    };
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}

let singleton: DerivClient | null = null;

export function getDerivClient(): DerivClient {
  if (!singleton) singleton = new DerivClient();
  return singleton;
}
