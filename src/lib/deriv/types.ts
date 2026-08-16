export interface DerivSymbol {
  symbol: string;
  display_name: string;
  market: string;
  market_display_name: string;
  submarket: string;
  submarket_display_name: string;
  pip: number;
  exchange_is_open: 0 | 1;
  is_trading_suspended: 0 | 1;
  /** Set for catalog entries; otherwise inferred from the market. */
  supportsDigits?: boolean;
}


export type StrategyKind =
  | "even_odd"
  | "over_under"
  | "matches_differs"
  | "rise_fall";

export interface StrategyCandidate {
  /** Stable id, e.g. "over_under:DIGITOVER:2" */
  id: string;
  kind: StrategyKind;
  /** Human name, e.g. "Digit Over 2" */
  name: string;
  /** Deriv contract type used by the bot, e.g. DIGITOVER */
  contractType: string;
  /** Barrier / prediction digit where applicable */
  barrier?: number;
  /** Observed hit rate over the sample (0..1) */
  hitRate: number;
  /** Wilson 95% lower bound of the hit rate */
  confidenceFloor: number;
  /** Theoretical fair probability of this outcome */
  fairRate: number;
  /** Win rate required to break even against Deriv payouts */
  breakEven: number;
  /** confidenceFloor - breakEven; positive means statistical edge */
  edge: number;
  wins: number;
  samples: number;
  rationale: string;
}

export interface DigitProfile {
  counts: number[];
  frequencies: number[];
  hottest: number;
  coldest: number;
  evenRate: number;
}

export interface MarketAnalysis {
  symbol: DerivSymbol;
  ticks: number[];
  digits: number[];
  lastPrice: number;
  changePct: number;
  volatility: number;
  digitProfile: DigitProfile;
  upRate: number;
  currentStreak: { direction: "up" | "down" | "flat"; length: number };
  best: StrategyCandidate;
  candidates: StrategyCandidate[];
  updatedAt: number;
}

export type ScanPhase = "idle" | "connecting" | "loading" | "ready" | "error";
