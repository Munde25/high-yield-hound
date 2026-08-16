import { symbolSupportsDigits } from "./catalog";
import type {
  DerivSymbol,
  DigitProfile,
  MarketAnalysis,
  StrategyCandidate,
} from "./types";

/** Deriv's approximate house edge baked into digit / rise-fall payouts. */
const HOUSE_EDGE = 0.045;

/** Wilson score interval lower bound at ~95% confidence. */
export function wilsonLower(wins: number, samples: number, z = 1.96): number {
  if (samples <= 0) return 0;
  const p = wins / samples;
  const z2 = z * z;
  const denom = 1 + z2 / samples;
  const centre = p + z2 / (2 * samples);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * samples)) / samples);
  return Math.max(0, (centre - margin) / denom);
}

/** Win rate needed to break even given a fair outcome probability. */
export function breakEvenFor(fairRate: number): number {
  return Math.min(0.999, fairRate / (1 - HOUSE_EDGE));
}

export function decimalsFromPip(pip: number): number {
  if (!pip || pip <= 0) return 2;
  return Math.max(0, Math.round(-Math.log10(pip)));
}

export function lastDigitOf(price: number, decimals: number): number {
  const s = price.toFixed(decimals);
  const clean = s.replace("-", "").replace(".", "");
  return Number(clean[clean.length - 1] ?? "0");
}

function digitProfile(digits: number[]): DigitProfile {
  const counts = new Array(10).fill(0) as number[];
  for (const d of digits) counts[d] = (counts[d] ?? 0) + 1;
  const total = digits.length || 1;
  const frequencies = counts.map((c) => c / total);
  let hottest = 0;
  let coldest = 0;
  frequencies.forEach((f, i) => {
    if (f > (frequencies[hottest] ?? 0)) hottest = i;
    if (f < (frequencies[coldest] ?? 1)) coldest = i;
  });
  const evens = digits.filter((d) => d % 2 === 0).length;
  return { counts, frequencies, hottest, coldest, evenRate: evens / total };
}

function candidate(
  input: Omit<StrategyCandidate, "confidenceFloor" | "breakEven" | "edge" | "hitRate">,
): StrategyCandidate {
  const hitRate = input.samples > 0 ? input.wins / input.samples : 0;
  const confidenceFloor = wilsonLower(input.wins, input.samples);
  const breakEven = breakEvenFor(input.fairRate);
  return {
    ...input,
    hitRate,
    confidenceFloor,
    breakEven,
    edge: confidenceFloor - breakEven,
  };
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function buildCandidates(
  digits: number[],
  ticks: number[],
  allowDigits = true,
): StrategyCandidate[] {
  const n = digits.length;
  const profile = digitProfile(digits);
  const out: StrategyCandidate[] = [];

  // --- Even / Odd -----------------------------------------------------------
  if (allowDigits) {
  const evens = digits.filter((d) => d % 2 === 0).length;
  const evenSide = evens >= n - evens;
  out.push(
    candidate({
      id: `even_odd:${evenSide ? "DIGITEVEN" : "DIGITODD"}`,
      kind: "even_odd",
      name: evenSide ? "Digit Even" : "Digit Odd",
      contractType: evenSide ? "DIGITEVEN" : "DIGITODD",
      fairRate: 0.5,
      wins: evenSide ? evens : n - evens,
      samples: n,
      rationale: `${pct(profile.evenRate)} of the last ${n} ticks closed on an even digit.`,
    }),
  );

  // --- Over / Under --------------------------------------------------------
  for (let barrier = 0; barrier <= 8; barrier++) {
    const wins = digits.filter((d) => d > barrier).length;
    out.push(
      candidate({
        id: `over_under:DIGITOVER:${barrier}`,
        kind: "over_under",
        name: `Digit Over ${barrier}`,
        contractType: "DIGITOVER",
        barrier,
        fairRate: (9 - barrier) / 10,
        wins,
        samples: n,
        rationale: `Last digit exceeded ${barrier} on ${wins}/${n} ticks.`,
      }),
    );
  }
  for (let barrier = 1; barrier <= 9; barrier++) {
    const wins = digits.filter((d) => d < barrier).length;
    out.push(
      candidate({
        id: `over_under:DIGITUNDER:${barrier}`,
        kind: "over_under",
        name: `Digit Under ${barrier}`,
        contractType: "DIGITUNDER",
        barrier,
        fairRate: barrier / 10,
        wins,
        samples: n,
        rationale: `Last digit stayed below ${barrier} on ${wins}/${n} ticks.`,
      }),
    );
  }

  // --- Matches / Differs ---------------------------------------------------
  const coldCount = profile.counts[profile.coldest] ?? 0;
  out.push(
    candidate({
      id: `matches_differs:DIGITDIFF:${profile.coldest}`,
      kind: "matches_differs",
      name: `Digit Differs from ${profile.coldest}`,
      contractType: "DIGITDIFF",
      barrier: profile.coldest,
      fairRate: 0.9,
      wins: n - coldCount,
      samples: n,
      rationale: `Digit ${profile.coldest} is the coldest at ${pct(
        profile.frequencies[profile.coldest] ?? 0,
      )} versus a 10% baseline.`,
    }),
  );
  const hotCount = profile.counts[profile.hottest] ?? 0;
  out.push(
    candidate({
      id: `matches_differs:DIGITMATCH:${profile.hottest}`,
      kind: "matches_differs",
      name: `Digit Matches ${profile.hottest}`,
      contractType: "DIGITMATCH",
      barrier: profile.hottest,
      fairRate: 0.1,
      wins: hotCount,
      samples: n,
      rationale: `Digit ${profile.hottest} is the hottest at ${pct(
        profile.frequencies[profile.hottest] ?? 0,
      )} versus a 10% baseline.`,
    }),
  );
  }

  // --- Rise / Fall ---------------------------------------------------------
  let ups = 0;
  let moves = 0;
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1] as number;
    const cur = ticks[i] as number;
    if (cur === prev) continue;
    moves++;
    if (cur > prev) ups++;
  }
  if (moves > 0) {
    const riseSide = ups >= moves - ups;
    out.push(
      candidate({
        id: `rise_fall:${riseSide ? "CALL" : "PUT"}`,
        kind: "rise_fall",
        name: riseSide ? "Rise (Call)" : "Fall (Put)",
        contractType: riseSide ? "CALL" : "PUT",
        fairRate: 0.5,
        wins: riseSide ? ups : moves - ups,
        samples: moves,
        rationale: `${pct(ups / moves)} of ${moves} directional moves were upward.`,
      }),
    );
  }

  return out.sort((a, b) => b.edge - a.edge);
}

function streakOf(ticks: number[]): MarketAnalysis["currentStreak"] {
  if (ticks.length < 2) return { direction: "flat", length: 0 };
  let direction: "up" | "down" | "flat" = "flat";
  let length = 0;
  for (let i = ticks.length - 1; i > 0; i--) {
    const cur = ticks[i] as number;
    const prev = ticks[i - 1] as number;
    const dir: "up" | "down" | "flat" =
      cur > prev ? "up" : cur < prev ? "down" : "flat";
    if (direction === "flat") {
      direction = dir;
      length = 1;
    } else if (dir === direction) {
      length++;
    } else break;
  }
  return { direction, length };
}

export function analyseMarket(
  symbol: DerivSymbol,
  ticks: number[],
  pipDecimals?: number,
): MarketAnalysis {
  const decimals = pipDecimals ?? decimalsFromPip(symbol.pip);
  const digits = ticks.map((t) => lastDigitOf(t, decimals));
  const candidates = buildCandidates(digits, ticks, symbolSupportsDigits(symbol));
  const first = ticks[0] ?? 0;
  const last = ticks[ticks.length - 1] ?? 0;

  const returns: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1] as number;
    if (prev !== 0) returns.push(((ticks[i] as number) - prev) / prev);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length || 1);

  let ups = 0;
  let moves = 0;
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1] as number;
    const cur = ticks[i] as number;
    if (cur === prev) continue;
    moves++;
    if (cur > prev) ups++;
  }

  return {
    symbol,
    ticks,
    digits,
    lastPrice: last,
    changePct: first ? ((last - first) / first) * 100 : 0,
    volatility: Math.sqrt(variance) * 100,
    digitProfile: digitProfile(digits),
    upRate: moves ? ups / moves : 0.5,
    currentStreak: streakOf(ticks),
    best: candidates[0] as StrategyCandidate,
    candidates,
    updatedAt: Date.now(),
  };
}

export function confidenceLabel(samples: number): string {
  if (samples >= 800) return "High";
  if (samples >= 300) return "Medium";
  return "Low";
}
