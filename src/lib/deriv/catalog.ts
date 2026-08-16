import type { DerivSymbol } from "./types";

type Seed = [symbol: string, display: string, submarket: string, submarketLabel: string];

function group(
  market: string,
  marketLabel: string,
  seeds: Seed[],
  supportsDigits: boolean,
): DerivSymbol[] {
  return seeds.map(([symbol, display_name, submarket, submarket_display_name]) => ({
    symbol,
    display_name,
    market,
    market_display_name: marketLabel,
    submarket,
    submarket_display_name,
    pip: 0.01,
    exchange_is_open: 1 as const,
    is_trading_suspended: 0 as const,
    supportsDigits,
  }));
}

/**
 * Fallback catalog used when Deriv's active_symbols call returns nothing for the
 * caller's region. Every entry is still validated against the live tick feed,
 * so unavailable markets are dropped automatically.
 */
export const FALLBACK_SYMBOLS: DerivSymbol[] = [
  ...group(
    "synthetic_index",
    "Derived",
    [
      ["R_10", "Volatility 10 Index", "random_index", "Continuous Indices"],
      ["R_25", "Volatility 25 Index", "random_index", "Continuous Indices"],
      ["R_50", "Volatility 50 Index", "random_index", "Continuous Indices"],
      ["R_75", "Volatility 75 Index", "random_index", "Continuous Indices"],
      ["R_100", "Volatility 100 Index", "random_index", "Continuous Indices"],
      ["1HZ10V", "Volatility 10 (1s) Index", "random_index", "Continuous Indices"],
      ["1HZ25V", "Volatility 25 (1s) Index", "random_index", "Continuous Indices"],
      ["1HZ50V", "Volatility 50 (1s) Index", "random_index", "Continuous Indices"],
      ["1HZ75V", "Volatility 75 (1s) Index", "random_index", "Continuous Indices"],
      ["1HZ100V", "Volatility 100 (1s) Index", "random_index", "Continuous Indices"],
      ["1HZ150V", "Volatility 150 (1s) Index", "random_index", "Continuous Indices"],
      ["1HZ250V", "Volatility 250 (1s) Index", "random_index", "Continuous Indices"],
      ["JD10", "Jump 10 Index", "jump_index", "Jump Indices"],
      ["JD25", "Jump 25 Index", "jump_index", "Jump Indices"],
      ["JD50", "Jump 50 Index", "jump_index", "Jump Indices"],
      ["JD75", "Jump 75 Index", "jump_index", "Jump Indices"],
      ["JD100", "Jump 100 Index", "jump_index", "Jump Indices"],
      ["stpRNG", "Step Index", "step_index", "Step Indices"],
      ["stpRNG2", "Step 200 Index", "step_index", "Step Indices"],
      ["stpRNG3", "Step 300 Index", "step_index", "Step Indices"],
      ["stpRNG4", "Step 400 Index", "step_index", "Step Indices"],
      ["stpRNG5", "Step 500 Index", "step_index", "Step Indices"],
      ["RDBEAR", "Bear Market Index", "random_daily", "Daily Reset Indices"],
      ["RDBULL", "Bull Market Index", "random_daily", "Daily Reset Indices"],
      ["BOOM300N", "Boom 300 Index", "crash_index", "Crash/Boom Indices"],
      ["BOOM500", "Boom 500 Index", "crash_index", "Crash/Boom Indices"],
      ["BOOM1000", "Boom 1000 Index", "crash_index", "Crash/Boom Indices"],
      ["CRASH300N", "Crash 300 Index", "crash_index", "Crash/Boom Indices"],
      ["CRASH500", "Crash 500 Index", "crash_index", "Crash/Boom Indices"],
      ["CRASH1000", "Crash 1000 Index", "crash_index", "Crash/Boom Indices"],
    ],
    true,
  ),
  ...group(
    "forex",
    "Forex",
    [
      ["frxEURUSD", "EUR/USD", "major_pairs", "Major Pairs"],
      ["frxGBPUSD", "GBP/USD", "major_pairs", "Major Pairs"],
      ["frxUSDJPY", "USD/JPY", "major_pairs", "Major Pairs"],
      ["frxAUDUSD", "AUD/USD", "major_pairs", "Major Pairs"],
      ["frxUSDCAD", "USD/CAD", "major_pairs", "Major Pairs"],
      ["frxUSDCHF", "USD/CHF", "major_pairs", "Major Pairs"],
      ["frxNZDUSD", "NZD/USD", "major_pairs", "Major Pairs"],
      ["frxEURGBP", "EUR/GBP", "minor_pairs", "Minor Pairs"],
      ["frxEURJPY", "EUR/JPY", "minor_pairs", "Minor Pairs"],
      ["frxGBPJPY", "GBP/JPY", "minor_pairs", "Minor Pairs"],
      ["frxAUDJPY", "AUD/JPY", "minor_pairs", "Minor Pairs"],
      ["frxEURAUD", "EUR/AUD", "minor_pairs", "Minor Pairs"],
    ],
    false,
  ),
  ...group(
    "commodities",
    "Commodities",
    [
      ["frxXAUUSD", "Gold/USD", "metals", "Metals"],
      ["frxXAGUSD", "Silver/USD", "metals", "Metals"],
      ["frxXPTUSD", "Platinum/USD", "metals", "Metals"],
      ["frxXPDUSD", "Palladium/USD", "metals", "Metals"],
    ],
    false,
  ),
  ...group(
    "cryptocurrency",
    "Cryptocurrencies",
    [
      ["cryBTCUSD", "BTC/USD", "non_stable_coin", "Cryptocurrencies"],
      ["cryETHUSD", "ETH/USD", "non_stable_coin", "Cryptocurrencies"],
    ],
    false,
  ),
  ...group(
    "indices",
    "Stock Indices",
    [
      ["OTC_SPC", "US 500", "americas_OTC", "American Indices"],
      ["OTC_NDX", "US Tech 100", "americas_OTC", "American Indices"],
      ["OTC_DJI", "Wall Street 30", "americas_OTC", "American Indices"],
      ["OTC_FTSE", "UK 100", "europe_OTC", "European Indices"],
      ["OTC_GDAXI", "Germany 40", "europe_OTC", "European Indices"],
      ["OTC_N225", "Japan 225", "asia_oceania_OTC", "Asian Indices"],
    ],
    false,
  ),
];

const DIGIT_MARKETS = new Set(["synthetic_index"]);

export function symbolSupportsDigits(symbol: DerivSymbol): boolean {
  if (typeof symbol.supportsDigits === "boolean") return symbol.supportsDigits;
  return DIGIT_MARKETS.has(symbol.market);
}
