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
const HOURS_PER_TRADING_DAY = 6.5;

const STOCKS: Record<string, StockConfig> = {
  AAPL:  { symbol: 'AAPL',  name: 'Apple Inc.',              basePrice: 182,  mu: 0.22,  sigma: 0.28, sector: 'Technology',    dividendYield: 0.005 },
  MSFT:  { symbol: 'MSFT',  name: 'Microsoft Corporation',   basePrice: 415,  mu: 0.20,  sigma: 0.25, sector: 'Technology',    dividendYield: 0.007 },
  NVDA:  { symbol: 'NVDA',  name: 'NVIDIA Corporation',      basePrice: 875,  mu: 0.45,  sigma: 0.60, sector: 'Technology',    dividendYield: 0 },
  TSLA:  { symbol: 'TSLA',  name: 'Tesla Inc.',              basePrice: 245,  mu: 0.30,  sigma: 0.55, sector: 'Automotive',    dividendYield: 0 },
  AMZN:  { symbol: 'AMZN',  name: 'Amazon.com Inc.',         basePrice: 195,  mu: 0.25,  sigma: 0.32, sector: 'Consumer',      dividendYield: 0 },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.',           basePrice: 175,  mu: 0.18,  sigma: 0.28, sector: 'Technology',    dividendYield: 0 },
  META:  { symbol: 'META',  name: 'Meta Platforms Inc.',     basePrice: 520,  mu: 0.35,  sigma: 0.40, sector: 'Technology',    dividendYield: 0 },
  NFLX:  { symbol: 'NFLX',  name: 'Netflix Inc.',            basePrice: 680,  mu: 0.20,  sigma: 0.38, sector: 'Entertainment', dividendYield: 0 },
  AMD:   { symbol: 'AMD',   name: 'Advanced Micro Devices',  basePrice: 165,  mu: 0.40,  sigma: 0.58, sector: 'Technology',    dividendYield: 0 },
  BABA:  { symbol: 'BABA',  name: 'Alibaba Group',           basePrice: 78,   mu: -0.05, sigma: 0.45, sector: 'Consumer',      dividendYield: 0 },
  JPM:   { symbol: 'JPM',   name: 'JPMorgan Chase',          basePrice: 210,  mu: 0.14,  sigma: 0.22, sector: 'Finance',       dividendYield: 0.009 },
  COIN:  { symbol: 'COIN',  name: 'Coinbase Global',         basePrice: 225,  mu: 0.50,  sigma: 0.90, sector: 'Fintech',       dividendYield: 0 },
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

function candlesPerDay(timeframeMs: number): number {
  const msPerHour = 3_600_000;
  return Math.max(1, (HOURS_PER_TRADING_DAY * msPerHour) / timeframeMs);
}

function dtForTimeframe(timeframeMs: number): number {
  return 1 / (TRADING_DAYS_PER_YEAR * candlesPerDay(timeframeMs));
}

// Build price history using GBM + GARCH-lite vol clustering
function buildPriceHistory(config: StockConfig, numCandles: number, dt: number): number[] {
  const prices: number[] = [config.basePrice];
  const { mu, sigma } = config;

  // GARCH-lite: α + β = 0.95 guarantees mean-reversion; γ adds proportional shock
  const alpha = 0.05;
  const beta = 0.90;
  const gamma = 0.05;
  let currentVol = sigma;

  for (let i = 0; i < numCandles - 1; i++) {
    const rng = lcg(candleSeed(config.symbol, i));
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

  const timeframeMs = getTimeframeMs('1d');
  const idx = candleIndexAt(now.getTime(), timeframeMs);
  const history = buildPriceHistory(config, Math.min(idx + 1, 1000), dtForTimeframe(timeframeMs));
  const price = history[history.length - 1];
  return Math.round(price * 100) / 100;
}

export function getCandleHistory(
  symbol: string,
  startTime: Date,
  endTime: Date,
  timeframeMs: number
): Candle[] {
  const config = getStockInfo(symbol);
  if (!config) return [];

  const dt = dtForTimeframe(timeframeMs);
  const startIdx = candleIndexAt(startTime.getTime(), timeframeMs);
  const endIdx = candleIndexAt(endTime.getTime(), timeframeMs);
  const count = Math.max(0, endIdx - startIdx);
  if (count === 0) return [];

  // Build only the window of candles needed. GBM loop uses local indices 0..N,
  // seeded per symbol+index, so results are deterministic for any given window size.
  const windowCount = Math.min(count, 2000);
  const windowPrices = buildPriceHistory(config, windowCount + 1, dt);

  const candles: Candle[] = [];
  for (let i = 0; i < windowCount; i++) {
    const absIdx = startIdx + i;
    // windowPrices[0] is the "open" for the first candle; windowPrices[i+1] is the close
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
