export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockData {
  symbol: string;
  name: string;
  basePrice: number;
  volatility: number;
  sector: string;
}

const STOCKS_DATABASE: Record<string, StockData> = {
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', basePrice: 195.5, volatility: 0.018, sector: 'Technology' },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corporation', basePrice: 420.0, volatility: 0.016, sector: 'Technology' },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.', basePrice: 180.0, volatility: 0.017, sector: 'Technology' },
  AMZN: { symbol: 'AMZN', name: 'Amazon.com Inc.', basePrice: 205.0, volatility: 0.022, sector: 'Consumer' },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corporation', basePrice: 950.0, volatility: 0.028, sector: 'Technology' },
  TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', basePrice: 310.0, volatility: 0.035, sector: 'Automotive' },
  META: { symbol: 'META', name: 'Meta Platforms Inc.', basePrice: 520.0, volatility: 0.025, sector: 'Technology' },
  NFLX: { symbol: 'NFLX', name: 'Netflix Inc.', basePrice: 410.0, volatility: 0.026, sector: 'Entertainment' },
  INTC: { symbol: 'INTC', name: 'Intel Corporation', basePrice: 45.0, volatility: 0.024, sector: 'Technology' },
  AMD: { symbol: 'AMD', name: 'Advanced Micro Devices', basePrice: 220.0, volatility: 0.027, sector: 'Technology' },
  PYPL: { symbol: 'PYPL', name: 'PayPal Holdings', basePrice: 72.0, volatility: 0.023, sector: 'Fintech' },
  UBER: { symbol: 'UBER', name: 'Uber Technologies', basePrice: 85.0, volatility: 0.025, sector: 'Transportation' },
};

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generatePriceMovement(
  seed: number,
  volatility: number,
  timeMultiplier: number = 1
): number {
  const random1 = seededRandom(seed);
  const random2 = seededRandom(seed + 1);

  const z0 = Math.sqrt(-2 * Math.log(random1)) * Math.cos(2 * Math.PI * random2);
  const dailyReturn = z0 * volatility * Math.sqrt(timeMultiplier) * 0.01;

  return dailyReturn;
}

function normalizePrice(price: number): number {
  return Math.round(price * 100) / 100;
}

export function getStockInfo(symbol: string): StockData | null {
  return STOCKS_DATABASE[symbol.toUpperCase()] || null;
}

export function getAllStocks(): StockData[] {
  return Object.values(STOCKS_DATABASE);
}

export function getCurrentPrice(symbol: string, now: Date = new Date()): number {
  const stock = getStockInfo(symbol);
  if (!stock) return 0;

  const epochMs = now.getTime();
  const daysSinceEpoch = Math.floor(epochMs / (24 * 60 * 60 * 1000));

  const gapMultiplier = 1 + generatePriceMovement(daysSinceEpoch * 1000, stock.volatility);
  let price = stock.basePrice * gapMultiplier;

  const msIntoDay = epochMs % (24 * 60 * 60 * 1000);
  const hoursIntoDay = msIntoDay / (60 * 60 * 1000);

  const volatilityMultiplier = 1 + (Math.sin((hoursIntoDay - 6.5) * Math.PI / 13) * 0.5 + 0.5);
  const intraMovement = generatePriceMovement(
    daysSinceEpoch * 1000 + Math.floor(hoursIntoDay),
    stock.volatility * volatilityMultiplier,
    1
  );

  price = price * (1 + intraMovement);

  return normalizePrice(Math.max(0.01, price));
}

export function getCandle(symbol: string, startTime: Date, timeframeMs: number): Candle {
  const stock = getStockInfo(symbol);
  if (!stock) return { timestamp: startTime.getTime(), open: 0, high: 0, low: 0, close: 0, volume: 0 };

  const start = startTime.getTime();
  const end = start + timeframeMs;
  const midpoint = start + timeframeMs / 2;
  const quarterpoint1 = start + timeframeMs / 4;
  const quarterpoint3 = start + (3 * timeframeMs) / 4;

  const openPrice = getCurrentPrice(symbol, new Date(start));
  const closePrice = getCurrentPrice(symbol, new Date(end));
  const highPrice = getCurrentPrice(symbol, new Date(midpoint));
  const lowPrice = Math.min(
    getCurrentPrice(symbol, new Date(quarterpoint1)),
    getCurrentPrice(symbol, new Date(quarterpoint3))
  );

  const volumeSeed = Math.floor(start / timeframeMs);
  const baseVolume = 50000000;
  const volumeMultiplier = 0.5 + 1.5 * seededRandom(volumeSeed);
  const volume = Math.floor(baseVolume * volumeMultiplier);

  return {
    timestamp: start,
    open: normalizePrice(openPrice),
    high: normalizePrice(Math.max(openPrice, closePrice, highPrice, lowPrice)),
    low: normalizePrice(Math.min(openPrice, closePrice, highPrice, lowPrice)),
    close: normalizePrice(closePrice),
    volume,
  };
}

export function getCandleHistory(
  symbol: string,
  startTime: Date,
  endTime: Date,
  timeframeMs: number
): Candle[] {
  const candles: Candle[] = [];
  let currentTime = new Date(startTime);

  while (currentTime.getTime() < endTime.getTime()) {
    const candle = getCandle(symbol, currentTime, timeframeMs);
    candles.push(candle);
    currentTime = new Date(currentTime.getTime() + timeframeMs);
  }

  return candles;
}

export function getTimeframeMs(timeframe: string): number {
  const timeframes: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1mo': 30 * 24 * 60 * 60 * 1000,
  };
  return timeframes[timeframe] || 60 * 1000;
}

export function getTimeframeLabel(timeframeMs: number): string {
  const labels: Record<number, string> = {
    [60 * 1000]: '1m',
    [5 * 60 * 1000]: '5m',
    [15 * 60 * 1000]: '15m',
    [60 * 60 * 1000]: '1h',
    [4 * 60 * 60 * 1000]: '4h',
    [24 * 60 * 60 * 1000]: '1d',
    [7 * 24 * 60 * 60 * 1000]: '1w',
    [30 * 24 * 60 * 60 * 1000]: '1mo',
  };
  return labels[timeframeMs] || '1m';
}
