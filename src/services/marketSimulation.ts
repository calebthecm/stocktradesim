import { getActiveDriftMultiplier } from './newsEngine';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockConfig {
  symbol: string;
  name: string;
  basePrice: number;
  mu: number;        // annualized drift
  sigma: number;     // annualized base volatility
  sector: string;
  dividendYield: number; // quarterly yield (0 = no dividend)
}

const TRADING_DAYS_PER_YEAR = 252;

// Base prices reflect approximate real-world values as of Jan 1 2026.
// mu values are realistic annualized expected returns (not hyped-up).
const STOCKS: Record<string, StockConfig> = {
  AAPL:  { symbol: 'AAPL',  name: 'Apple Inc.',              basePrice: 243,  mu: 0.12,  sigma: 0.28, sector: 'Technology',    dividendYield: 0.005 },
  MSFT:  { symbol: 'MSFT',  name: 'Microsoft Corporation',   basePrice: 432,  mu: 0.10,  sigma: 0.25, sector: 'Technology',    dividendYield: 0.007 },
  NVDA:  { symbol: 'NVDA',  name: 'NVIDIA Corporation',      basePrice: 137,  mu: 0.30,  sigma: 0.60, sector: 'Technology',    dividendYield: 0 },
  TSLA:  { symbol: 'TSLA',  name: 'Tesla Inc.',              basePrice: 403,  mu: 0.15,  sigma: 0.55, sector: 'Automotive',    dividendYield: 0 },
  AMZN:  { symbol: 'AMZN',  name: 'Amazon.com Inc.',         basePrice: 226,  mu: 0.14,  sigma: 0.32, sector: 'Consumer',      dividendYield: 0 },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.',           basePrice: 197,  mu: 0.10,  sigma: 0.28, sector: 'Technology',    dividendYield: 0 },
  META:  { symbol: 'META',  name: 'Meta Platforms Inc.',     basePrice: 603,  mu: 0.20,  sigma: 0.40, sector: 'Technology',    dividendYield: 0 },
  NFLX:  { symbol: 'NFLX',  name: 'Netflix Inc.',            basePrice: 892,  mu: 0.12,  sigma: 0.38, sector: 'Entertainment', dividendYield: 0 },
  AMD:   { symbol: 'AMD',   name: 'Advanced Micro Devices',  basePrice: 122,  mu: 0.20,  sigma: 0.58, sector: 'Technology',    dividendYield: 0 },
  BABA:  { symbol: 'BABA',  name: 'Alibaba Group',           basePrice: 88,   mu: -0.05, sigma: 0.45, sector: 'Consumer',      dividendYield: 0 },
  JPM:   { symbol: 'JPM',   name: 'JPMorgan Chase',          basePrice: 249,  mu: 0.09,  sigma: 0.22, sector: 'Finance',       dividendYield: 0.009 },
  COIN:  { symbol: 'COIN',  name: 'Coinbase Global',         basePrice: 282,  mu: 0.35,  sigma: 0.90, sector: 'Fintech',       dividendYield: 0 },
};

// Deterministic seeded PRNG (LCG)
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

// Box-Muller transform: two uniform randoms → standard normal
function boxMuller(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// Deterministic seed from symbol string + candle index
function candleSeed(symbol: string, candleIndex: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= candleIndex;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

// Trading days represented by each candle for GBM dt calculation.
// Sub-day: fraction of a 6.5-hour trading day.
// Multi-day: real trading days (1d=1, 1w=5, 1mo≈21).
const TRADING_DAYS_PER_CANDLE: Record<number, number> = {
  60_000:          1 / (6.5 * 60),   // 1m  — 1 min of a 390-min day
  300_000:         5 / (6.5 * 60),   // 5m
  900_000:        15 / (6.5 * 60),   // 15m
  3_600_000:       1 / 6.5,          // 1h
  14_400_000:      4 / 6.5,          // 4h
  86_400_000:      1,                // 1d
  604_800_000:     5,                // 1w  — 5 trading days
  2_592_000_000:  21,                // 1mo — ~21 trading days
};

function dtForTimeframe(timeframeMs: number): number {
  const tradingDays = TRADING_DAYS_PER_CANDLE[timeframeMs] ?? 1;
  return tradingDays / TRADING_DAYS_PER_YEAR;
}

// The simulation starts drifting prices from this calendar day (Jan 1 2026).
// basePrice values reflect approximate real-world prices as of that date.
const SIM_EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / 86_400_000);

// Build price history using GBM + GARCH-lite vol clustering.
// seedOffset shifts all candle seeds into absolute time so each calendar
// position always gets the same Z — making the walk globally consistent.
function buildPriceHistory(
  config: StockConfig,
  numCandles: number,
  dt: number,
  seedOffset: number = 0,
  startPrice?: number,
): number[] {
  const prices: number[] = [startPrice ?? config.basePrice];
  const { mu, sigma } = config;

  // GARCH-lite: α + β = 0.95 guarantees mean-reversion; γ adds proportional shock
  const alpha = 0.05;
  const beta = 0.90;
  const gamma = 0.05;
  let currentVol = sigma;

  for (let i = 0; i < numCandles - 1; i++) {
    const rng = lcg(candleSeed(config.symbol, (seedOffset + i) >>> 0));
    const Z = boxMuller(rng(), rng());

    // GARCH-lite update — clamped to [0.5σ, 3σ] to prevent runaway vol
    currentVol = alpha * sigma + beta * currentVol + gamma * Math.abs(Z) * sigma;
    currentVol = Math.max(0.5 * sigma, Math.min(3 * sigma, currentVol));

    // Discrete GBM step: S(t+dt) = S(t) * exp((μ - σ²/2)*dt + σ*√dt*Z)
    const drift = (mu - (currentVol * currentVol) / 2) * dt;
    const diffusion = currentVol * Math.sqrt(dt) * Z;
    const prev = prices[prices.length - 1];
    prices.push(Math.max(0.01, prev * Math.exp(drift + diffusion)));
  }

  return prices;
}

// Returns the 1d GBM price for a stock at the given calendar day index.
// Walks from SIM_EPOCH_DAY so prices genuinely drift as real days pass.
function getDailyPrice(config: StockConfig, dayIdx: number): number {
  const relIdx = dayIdx - SIM_EPOCH_DAY;
  if (relIdx <= 0) return config.basePrice;
  const dt = TRADING_DAYS_PER_CANDLE[86_400_000] / TRADING_DAYS_PER_YEAR;
  const prices = buildPriceHistory(config, relIdx + 1, dt, SIM_EPOCH_DAY);
  return prices[prices.length - 1];
}

function candleIndexAt(timestampMs: number, timeframeMs: number): number {
  return Math.floor(timestampMs / timeframeMs);
}

export function getStockInfo(symbol: string): StockConfig | null {
  return STOCKS[symbol.toUpperCase()] ?? null;
}

export function getAllStocks(): StockConfig[] {
  return Object.values(STOCKS);
}

export function getDividendYield(symbol: string): number {
  return STOCKS[symbol.toUpperCase()]?.dividendYield ?? 0;
}

export function getCurrentPrice(symbol: string, now: Date = new Date()): number {
  const config = getStockInfo(symbol);
  if (!config) return 0;

  const nowMs = now.getTime();
  const dayIdx = Math.floor(nowMs / 86_400_000);
  const dayStartMs = dayIdx * 86_400_000;
  const dayOpen = getDailyPrice(config, dayIdx);

  // Walk from midnight at 1m granularity — same anchor used by getCandleHistory sub-day.
  const dtMin = TRADING_DAYS_PER_CANDLE[60_000] / TRADING_DAYS_PER_YEAR;
  const absMinuteIdx = Math.floor(nowMs / 60_000);
  const dayStartMinuteIdx = Math.floor(dayStartMs / 60_000);
  const minutesElapsed = absMinuteIdx - dayStartMinuteIdx;

  // One pass: get current minute's open and close (for smooth intraday interpolation)
  const mp = buildPriceHistory(config, minutesElapsed + 2, dtMin, dayStartMinuteIdx, dayOpen);
  const minuteOpen = mp[mp.length - 2];
  const minuteClose = mp[mp.length - 1];

  // Smoothstep interpolation: price moves naturally from open→close over 60 seconds
  const secWithinMinute = Math.floor((nowMs % 60_000) / 1_000);
  const t = secWithinMinute / 60;
  const smooth = t * t * (3 - 2 * t);
  const livePrice = minuteOpen + (minuteClose - minuteOpen) * smooth;

  return Math.round(livePrice * getActiveDriftMultiplier(symbol.toUpperCase()) * 100) / 100;
}

// Today's day-open price — deterministic anchor for day P&L calculations.
export function getDayOpen(symbol: string, now: Date = new Date()): number {
  const config = getStockInfo(symbol);
  if (!config) return 0;
  const dayIdx = Math.floor(now.getTime() / 86_400_000);
  return Math.round(getDailyPrice(config, dayIdx) * 100) / 100;
}

// Minute-level price array from midnight to now — used for intraday sparklines.
export function getDayIntradayPrices(symbol: string, now: Date = new Date()): number[] {
  const config = getStockInfo(symbol);
  if (!config) return [];
  const nowMs = now.getTime();
  const dayIdx = Math.floor(nowMs / 86_400_000);
  const dayStartMs = dayIdx * 86_400_000;
  const dayOpen = getDailyPrice(config, dayIdx);
  const dtMin = TRADING_DAYS_PER_CANDLE[60_000] / TRADING_DAYS_PER_YEAR;
  const absMinuteIdx = Math.floor(nowMs / 60_000);
  const dayStartMinuteIdx = Math.floor(dayStartMs / 60_000);
  const minutesElapsed = absMinuteIdx - dayStartMinuteIdx;
  if (minutesElapsed <= 0) return [dayOpen];
  return buildPriceHistory(config, minutesElapsed + 1, dtMin, dayStartMinuteIdx, dayOpen);
}

export function getCandleHistory(
  symbol: string,
  startTime: Date,
  endTime: Date,
  timeframeMs: number,
): Candle[] {
  const config = getStockInfo(symbol);
  if (!config) return [];

  const dt = dtForTimeframe(timeframeMs);
  const startIdx = candleIndexAt(startTime.getTime(), timeframeMs);
  const endIdx = candleIndexAt(endTime.getTime(), timeframeMs);
  const count = Math.max(0, endIdx - startIdx);
  if (count === 0) return [];
  const windowCount = Math.min(count, 2000);

  // Determine the starting price for this window.
  // Multi-day timeframes: walk forward from SIM_EPOCH_DAY to startIdx.
  // Sub-day timeframes: anchor to that day's 1d price (prevents expensive minute-level walks).
  let windowStartPrice: number;
  if (timeframeMs >= 86_400_000) {
    const epochIdxInTf = candleIndexAt(SIM_EPOCH_DAY * 86_400_000, timeframeMs);
    const relStart = startIdx - epochIdxInTf;
    if (relStart <= 0) {
      windowStartPrice = config.basePrice;
    } else {
      const walk = buildPriceHistory(config, relStart + 1, dt, epochIdxInTf);
      windowStartPrice = walk[walk.length - 1];
    }
  } else {
    // Sub-day: anchor at midnight of the start day, walk to window start.
    // This makes all sub-day candles consistent with getCurrentPrice's midnight anchor.
    const startDayIdx = Math.floor(startTime.getTime() / 86_400_000);
    const dayOpen = getDailyPrice(config, startDayIdx);
    const dayStartMs = startDayIdx * 86_400_000;
    const dayStartTfIdx = Math.floor(dayStartMs / timeframeMs);
    const stepsFromMidnight = startIdx - dayStartTfIdx;
    if (stepsFromMidnight <= 0) {
      windowStartPrice = dayOpen;
    } else {
      const midWalk = buildPriceHistory(config, stepsFromMidnight + 1, dt, dayStartTfIdx, dayOpen);
      windowStartPrice = midWalk[midWalk.length - 1];
    }
  }

  // Build candles using absolute seeds so every candle at a given timestamp
  // always gets the same random draw — chart is consistent across refreshes.
  const windowPrices = buildPriceHistory(config, windowCount + 1, dt, startIdx, windowStartPrice);

  const candles: Candle[] = [];
  for (let i = 0; i < windowCount; i++) {
    const absIdx = startIdx + i;
    const close = windowPrices[i + 1];
    const open = windowPrices[i];
    const rng = lcg(candleSeed(config.symbol, absIdx + 100_000));
    const wickFraction = config.sigma * Math.sqrt(dt) * (0.5 + rng() * 0.5);
    const high = Math.max(open, close) * (1 + wickFraction);
    const low  = Math.min(open, close) * (1 - wickFraction);
    const volRng = lcg(candleSeed(config.symbol, absIdx + 200_000));
    const volume = Math.floor(30_000_000 + 60_000_000 * volRng());
    candles.push({
      timestamp: (startIdx + i) * timeframeMs,
      open:   Math.round(open  * 100) / 100,
      high:   Math.round(high  * 100) / 100,
      low:    Math.round(low   * 100) / 100,
      close:  Math.round(close * 100) / 100,
      volume,
    });
  }
  return candles;
}

export function getTimeframeMs(timeframe: string): number {
  const map: Record<string, number> = {
    '1m':  60_000,
    '5m':  300_000,
    '15m': 900_000,
    '1h':  3_600_000,
    '4h':  14_400_000,
    '1d':  86_400_000,
    '1w':  604_800_000,
    '1mo': 2_592_000_000,
  };
  return map[timeframe] ?? 60_000;
}

export function getTimeframeLabel(timeframeMs: number): string {
  const entries = Object.entries({
    '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000,
    '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000, '1mo': 2_592_000_000,
  });
  return entries.find(([, ms]) => ms === timeframeMs)?.[0] ?? '1m';
}
