import { breakEvenFor, decimalsFromPip, lastDigitOf } from "./analysis";
import type { DerivSymbol, StrategyKind } from "./types";

/**
 * Elevated-accuracy signal engine.
 *
 * Where the plain scanner scores a single sample, this engine grades every
 * candidate on four independent axes and only promotes a signal when they
 * agree:
 *
 *  1. Conservatism  — Wilson 95% lower bound taken as the WORST of several
 *                     lookback windows, so a fluke in one window cannot lift
 *                     the score.
 *  2. Consensus     — the share of lookback windows that independently clear
 *                     the fair rate.
 *  3. Recency       — an exponentially weighted hit rate (half-life 120 ticks)
 *                     that detects whether the pattern is still live.
 *  4. Significance  — z-score of the deviation from the theoretical rate, plus
 *                     a chi-square uniformity test on the digit distribution.
 */

export type SignalTier = "elite" | "strong" | "moderate" | "watch";

export interface Signal {
  id: string;
  symbol: DerivSymbol;
  kind: StrategyKind;
  /** e.g. "Digit Over 3" */
  name: string;
  /** Short execution label, e.g. "OVER 3" */
  prediction: string;
  contractType: string;
  barrier?: number;
  /** Calibrated probability the next tick resolves in favour (0..1) */
  accuracy: number;
  /** Raw hit rate over the full sample */
  hitRate: number;
  /** Exponentially weighted recent hit rate */
  recentRate: number;
  /** Worst Wilson 95% lower bound across windows */
  floor: number;
  fairRate: number;
  breakEven: number;
  /** accuracy - breakEven; positive means a payout-beating edge */
  edge: number;
  /** 0..1 share of lookback windows that agree */
  consensus: number;
  /** z-score of deviation from the fair rate */
  significance: number;
  samples: number;
  tier: SignalTier;
  rationale: string[];
  /** Recommended number of ticks this read stays valid for */
  validTicks: number;
}

export interface MarketSignals {
  symbol: DerivSymbol;
  ticks: number[];
  digits: number[];
  lastPrice: number;
  decimals: number;
  /** Chi-square p-value for digit uniformity — low means exploitable bias */
  uniformityP: number;
  signals: Signal[];
  top: Signal | null;
  updatedAt: number;
}

const WINDOWS = [120, 240, 480, 960];
const HALF_LIFE = 120;

function wilson(wins: number, n: number, z = 1.96) {
  if (n <= 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

/** Survival function of the chi-square distribution (Wilson–Hilferty). */
function chiSquareP(chi2: number, df: number) {
  if (df <= 0) return 1;
  const t = Math.cbrt(chi2 / df);
  const mean = 1 - 2 / (9 * df);
  const sd = Math.sqrt(2 / (9 * df));
  return 1 - normalCdf((t - mean) / sd);
}

function normalCdf(z: number) {
  // Abramowitz & Stegun 7.1.26 on erf
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function clamp(v: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, v));
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

type Def = {
  id: string;
  kind: StrategyKind;
  name: string;
  prediction: string;
  contractType: string;
  barrier?: number;
  fairRate: number;
  /** Outcome series: 1 = win, 0 = loss, null = no trade */
  hit: (i: number) => 0 | 1 | null;
  length: number;
};

function grade(symbol: DerivSymbol, def: Def, uniformityP: number): Signal | null {
  const outcomes: (0 | 1)[] = [];
  for (let i = 0; i < def.length; i++) {
    const h = def.hit(i);
    if (h !== null) outcomes.push(h);
  }
  const n = outcomes.length;
  if (n < 80) return null;

  const wins = outcomes.reduce<number>((a, b) => a + b, 0);
  const hitRate = wins / n;

  // Recency-weighted rate (most recent outcome carries the most weight).
  let wSum = 0;
  let wWins = 0;
  for (let i = 0; i < n; i++) {
    const age = n - 1 - i;
    const w = Math.pow(0.5, age / HALF_LIFE);
    wSum += w;
    wWins += w * outcomes[i]!;
  }
  const recentRate = wSum > 0 ? wWins / wSum : hitRate;

  // Per-window Wilson floors and consensus.
  const windows = WINDOWS.filter((w) => w <= n);
  if (windows.length === 0) windows.push(n);
  let floor = 1;
  let agree = 0;
  const rates: number[] = [];
  for (const w of windows) {
    const slice = outcomes.slice(n - w);
    const sw = slice.reduce<number>((a, b) => a + b, 0);
    const rate = sw / slice.length;
    rates.push(rate);
    floor = Math.min(floor, wilson(sw, slice.length));
    if (rate > def.fairRate * 1.01) agree++;
  }
  const consensus = agree / windows.length;

  // Stability: how tightly the windows cluster.
  const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const spread = Math.sqrt(
    rates.reduce((a, r) => a + (r - meanRate) ** 2, 0) / rates.length,
  );
  const stability = clamp(1 - spread / 0.12);

  const se = Math.sqrt((def.fairRate * (1 - def.fairRate)) / n);
  const significance = se > 0 ? (hitRate - def.fairRate) / se : 0;

  // Calibrated accuracy: start from the most conservative floor, credit a live
  // recent drift, then discount for disagreement and instability.
  const drift = (recentRate - hitRate) * 0.5;
  const discount =
    1 - 0.14 * (1 - consensus) - 0.08 * (1 - stability) - (def.kind === "matches_differs" && uniformityP > 0.4 ? 0.05 : 0);
  const accuracy = clamp(Math.max(floor + drift, 0) * discount, 0, 0.995);

  const breakEven = breakEvenFor(def.fairRate);
  const edge = accuracy - breakEven;

  const tier: SignalTier =
    edge > 0.04 && consensus === 1 && significance > 2
      ? "elite"
      : edge > 0.015 && consensus >= 0.75
        ? "strong"
        : edge > 0
          ? "moderate"
          : "watch";

  const rationale = [
    `${pct(hitRate)} over the last ${n} ticks versus a ${pct(def.fairRate)} theoretical rate.`,
    `${agree}/${windows.length} lookback windows independently clear the fair rate (consensus ${pct(consensus)}).`,
    `Recent-weighted rate ${pct(recentRate)}, worst-case 95% floor ${pct(floor)}.`,
    `Deviation significance ${significance.toFixed(2)}σ, window stability ${pct(stability)}.`,
  ];
  if (def.kind !== "rise_fall") {
    rationale.push(
      uniformityP < 0.05
        ? `Digit distribution fails a uniformity test (p=${uniformityP.toFixed(3)}) — measurable bias present.`
        : `Digit distribution is close to uniform (p=${uniformityP.toFixed(3)}); treat as a thin read.`,
    );
  }

  const validTicks = Math.round(clamp(consensus * stability, 0.1, 1) * 40);

  return {
    id: def.id,
    symbol,
    kind: def.kind,
    name: def.name,
    prediction: def.prediction,
    contractType: def.contractType,
    ...(def.barrier === undefined ? {} : { barrier: def.barrier }),
    accuracy,
    hitRate,
    recentRate,
    floor,
    fairRate: def.fairRate,
    breakEven,
    edge,
    consensus,
    significance,
    samples: n,
    tier,
    rationale,
    validTicks,
  };
}

function digitDefs(digits: number[]): Def[] {
  const n = digits.length;
  const counts = new Array(10).fill(0) as number[];
  for (const d of digits) counts[d] = (counts[d] ?? 0) + 1;
  let hottest = 0;
  let coldest = 0;
  counts.forEach((c, i) => {
    if (c > (counts[hottest] ?? 0)) hottest = i;
    if (c < (counts[coldest] ?? Infinity)) coldest = i;
  });

  const defs: Def[] = [
    {
      id: "even_odd:DIGITEVEN",
      kind: "even_odd",
      name: "Digit Even",
      prediction: "EVEN",
      contractType: "DIGITEVEN",
      fairRate: 0.5,
      hit: (i) => (digits[i]! % 2 === 0 ? 1 : 0),
      length: n,
    },
    {
      id: "even_odd:DIGITODD",
      kind: "even_odd",
      name: "Digit Odd",
      prediction: "ODD",
      contractType: "DIGITODD",
      fairRate: 0.5,
      hit: (i) => (digits[i]! % 2 === 1 ? 1 : 0),
      length: n,
    },
    {
      id: `matches_differs:DIGITDIFF:${coldest}`,
      kind: "matches_differs",
      name: `Digit Differs from ${coldest}`,
      prediction: `DIFFERS ${coldest}`,
      contractType: "DIGITDIFF",
      barrier: coldest,
      fairRate: 0.9,
      hit: (i) => (digits[i] === coldest ? 0 : 1),
      length: n,
    },
    {
      id: `matches_differs:DIGITMATCH:${hottest}`,
      kind: "matches_differs",
      name: `Digit Matches ${hottest}`,
      prediction: `MATCHES ${hottest}`,
      contractType: "DIGITMATCH",
      barrier: hottest,
      fairRate: 0.1,
      hit: (i) => (digits[i] === hottest ? 1 : 0),
      length: n,
    },
  ];

  for (let b = 0; b <= 8; b++) {
    defs.push({
      id: `over_under:DIGITOVER:${b}`,
      kind: "over_under",
      name: `Digit Over ${b}`,
      prediction: `OVER ${b}`,
      contractType: "DIGITOVER",
      barrier: b,
      fairRate: (9 - b) / 10,
      hit: (i) => (digits[i]! > b ? 1 : 0),
      length: n,
    });
  }
  for (let b = 1; b <= 9; b++) {
    defs.push({
      id: `over_under:DIGITUNDER:${b}`,
      kind: "over_under",
      name: `Digit Under ${b}`,
      prediction: `UNDER ${b}`,
      contractType: "DIGITUNDER",
      barrier: b,
      fairRate: b / 10,
      hit: (i) => (digits[i]! < b ? 1 : 0),
      length: n,
    });
  }
  return defs;
}

function riseFallDefs(ticks: number[]): Def[] {
  const moves: (0 | 1)[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!;
    const cur = ticks[i]!;
    if (cur === prev) continue;
    moves.push(cur > prev ? 1 : 0);
  }
  return [
    {
      id: "rise_fall:CALL",
      kind: "rise_fall",
      name: "Rise (Call)",
      prediction: "RISE",
      contractType: "CALL",
      fairRate: 0.5,
      hit: (i) => moves[i]!,
      length: moves.length,
    },
    {
      id: "rise_fall:PUT",
      kind: "rise_fall",
      name: "Fall (Put)",
      prediction: "FALL",
      contractType: "PUT",
      fairRate: 0.5,
      hit: (i) => (moves[i] === 0 ? 1 : 0),
      length: moves.length,
    },
  ];
}

export function digitUniformityP(digits: number[]): number {
  const n = digits.length;
  if (n < 50) return 1;
  const counts = new Array(10).fill(0) as number[];
  for (const d of digits) counts[d] = (counts[d] ?? 0) + 1;
  const expected = n / 10;
  const chi2 = counts.reduce((a, c) => a + (c - expected) ** 2 / expected, 0);
  return chiSquareP(chi2, 9);
}

export function analyseSignals(
  symbol: DerivSymbol,
  ticks: number[],
  pipDecimals?: number,
): MarketSignals {
  const decimals = pipDecimals ?? decimalsFromPip(symbol.pip);
  const digits = ticks.map((t) => lastDigitOf(t, decimals));
  const uniformityP = digitUniformityP(digits);

  const defs = [...digitDefs(digits), ...riseFallDefs(ticks)];
  const signals = defs
    .map((d) => grade(symbol, d, uniformityP))
    .filter((s): s is Signal => s !== null)
    .sort((a, b) => b.edge - a.edge);

  return {
    symbol,
    ticks,
    digits,
    decimals,
    lastPrice: ticks[ticks.length - 1] ?? 0,
    uniformityP,
    signals,
    top: signals[0] ?? null,
    updatedAt: Date.now(),
  };
}

export const TIER_LABEL: Record<SignalTier, string> = {
  elite: "Elite",
  strong: "Strong",
  moderate: "Moderate",
  watch: "Watch only",
};
