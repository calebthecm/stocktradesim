// tick-market Edge Function
// Computes current prices for all symbols using the same deterministic GBM
// simulation as the frontend, then upserts into market_prices.
// Called by clients every 10s (rate-limited server-side).
// Invoked with verify_jwt=false so any visitor can trigger a tick.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Simulation constants (must match marketSimulation.ts exactly) ────────────

const TRADING_DAYS_PER_YEAR = 252;
const SIM_EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / 86_400_000);

const TRADING_DAYS_PER_CANDLE: Record<number, number> = {
  60_000:         1 / (6.5 * 60),
  86_400_000:     1,
};

interface StockConfig {
  symbol: string;
  basePrice: number;
  mu: number;
  sigma: number;
}

const STOCKS: StockConfig[] = [
  { symbol: 'AAPL',  basePrice: 243,  mu: 0.12,  sigma: 0.28 },
  { symbol: 'MSFT',  basePrice: 432,  mu: 0.10,  sigma: 0.25 },
  { symbol: 'NVDA',  basePrice: 137,  mu: 0.30,  sigma: 0.60 },
  { symbol: 'TSLA',  basePrice: 403,  mu: 0.15,  sigma: 0.55 },
  { symbol: 'AMZN',  basePrice: 226,  mu: 0.14,  sigma: 0.32 },
  { symbol: 'GOOGL', basePrice: 197,  mu: 0.10,  sigma: 0.28 },
  { symbol: 'META',  basePrice: 603,  mu: 0.20,  sigma: 0.40 },
  { symbol: 'NFLX',  basePrice: 892,  mu: 0.12,  sigma: 0.38 },
  { symbol: 'AMD',   basePrice: 122,  mu: 0.20,  sigma: 0.58 },
  { symbol: 'BABA',  basePrice: 88,   mu: -0.05, sigma: 0.45 },
  { symbol: 'JPM',   basePrice: 249,  mu: 0.09,  sigma: 0.22 },
  { symbol: 'COIN',  basePrice: 282,  mu: 0.35,  sigma: 0.90 },
];

// ── Deterministic PRNG ───────────────────────────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

function boxMuller(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

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

function buildPriceHistory(
  config: StockConfig,
  numCandles: number,
  dt: number,
  seedOffset: number = 0,
  startPrice?: number,
): number[] {
  const prices: number[] = [startPrice ?? config.basePrice];
  const { mu, sigma } = config;
  const alpha = 0.05, beta = 0.90, gamma = 0.05;
  let currentVol = sigma;

  for (let i = 0; i < numCandles - 1; i++) {
    const rng = lcg(candleSeed(config.symbol, (seedOffset + i) >>> 0));
    const Z = boxMuller(rng(), rng());
    currentVol = alpha * sigma + beta * currentVol + gamma * Math.abs(Z) * sigma;
    currentVol = Math.max(0.5 * sigma, Math.min(3 * sigma, currentVol));
    const drift = (mu - (currentVol * currentVol) / 2) * dt;
    const diffusion = currentVol * Math.sqrt(dt) * Z;
    const prev = prices[prices.length - 1];
    prices.push(Math.max(0.01, prev * Math.exp(drift + diffusion)));
  }
  return prices;
}

function getDailyPrice(config: StockConfig, dayIdx: number): number {
  const relIdx = dayIdx - SIM_EPOCH_DAY;
  if (relIdx <= 0) return config.basePrice;
  const dt = TRADING_DAYS_PER_CANDLE[86_400_000] / TRADING_DAYS_PER_YEAR;
  const prices = buildPriceHistory(config, relIdx + 1, dt, SIM_EPOCH_DAY);
  return prices[prices.length - 1];
}

function computePrices(now: Date) {
  const nowMs = now.getTime();
  const dayIdx = Math.floor(nowMs / 86_400_000);
  const dayStartMs = dayIdx * 86_400_000;
  const dtMin = TRADING_DAYS_PER_CANDLE[60_000] / TRADING_DAYS_PER_YEAR;
  const absMinuteIdx = Math.floor(nowMs / 60_000);
  const dayStartMinuteIdx = Math.floor(dayStartMs / 60_000);
  const minutesElapsed = absMinuteIdx - dayStartMinuteIdx;
  const secWithinMinute = Math.floor((nowMs % 60_000) / 1_000);
  const t = secWithinMinute / 60;
  const smooth = t * t * (3 - 2 * t);

  return STOCKS.map((config) => {
    const dayOpen = getDailyPrice(config, dayIdx);

    // Build intraday minute walk + one extra step for close
    const mp = buildPriceHistory(config, minutesElapsed + 2, dtMin, dayStartMinuteIdx, dayOpen);
    const minuteOpen = mp[mp.length - 2];
    const minuteClose = mp[mp.length - 1];
    const price = minuteOpen + (minuteClose - minuteOpen) * smooth;

    // Day high/low from intraday walk
    const intradayPrices = mp.slice(0, minutesElapsed + 1);
    const dayHigh = Math.max(...intradayPrices, price);
    const dayLow = Math.min(...intradayPrices, price);

    return {
      symbol: config.symbol,
      price:    Math.round(price    * 10000) / 10000,
      day_open: Math.round(dayOpen  * 10000) / 10000,
      day_high: Math.round(dayHigh  * 10000) / 10000,
      day_low:  Math.round(dayLow   * 10000) / 10000,
      updated_at: now.toISOString(),
    };
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────

const STALE_MS = 8_000; // only write if prices are older than 8 seconds

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Rate-limit: check if prices were updated recently
  const { data: latest } = await supabase
    .from('market_prices')
    .select('updated_at')
    .limit(1)
    .maybeSingle();

  const lastUpdate = latest ? new Date(latest.updated_at).getTime() : 0;
  const now = new Date();

  if (now.getTime() - lastUpdate < STALE_MS) {
    // Prices are fresh — return without writing
    const { data: prices } = await supabase
      .from('market_prices')
      .select('*');
    return Response.json({ prices, refreshed: false });
  }

  const prices = computePrices(now);
  await supabase.from('market_prices').upsert(prices, { onConflict: 'symbol' });

  return Response.json({ prices, refreshed: true });
});
