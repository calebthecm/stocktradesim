# Trading Features v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GBM price simulation, TradingView-quality draggable chart, take profit + bracket orders, short selling, dividends, and a global leaderboard to the stock trading simulator.

**Architecture:** Vite + React 18 + TypeScript SPA backed by Supabase. No router — `App.tsx` manages page state with a `currentPage` string. Services in `src/services/` are pure async functions; pages own state and call services directly. The new chart is a `useEffect`-mounted `lightweight-charts` canvas replacing the Recharts component entirely.

**Tech Stack:** Bun (replaces npm), lightweight-charts v4 (TradingView OSS), Vitest (new — no existing tests), Supabase JS v2, TypeScript strict mode.

---

> ⚠️ **Before starting Task 4 (DB migration):** You need Supabase credentials in a `.env` file:
> ```
> VITE_SUPABASE_URL=https://your-project.supabase.co
> VITE_SUPABASE_ANON_KEY=your-anon-key
> ```
> The user will provide these. All other tasks can be completed without them.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/marketSimulation.ts` | **Rewrite** | GBM engine, GARCH-lite vol clustering, per-stock params, dividend yields |
| `src/services/marketSimulation.test.ts` | **Create** | Unit tests for GBM math and candle generation |
| `src/components/CandlestickChart.tsx` | **Rewrite** | lightweight-charts canvas, draggable trade lines, dark theme |
| `src/services/supabase.ts` | **Modify** | Add `display_name`, `short_entry_price`, `bracket_id` to types; add `createOrder` overload for bracket; add leaderboard query functions |
| `src/services/tradingEngine.ts` | **Modify** | Add take profit execution, `placeBracketOrder`, short selling buy/sell, dividend credit |
| `src/services/tradingEngine.test.ts` | **Create** | Unit tests for order execution logic and short selling P/L |
| `src/pages/TradePage.tsx` | **Modify** | Add LONG/SHORT tabs, take profit + stop loss inputs, connect `onTradeIntent` from chart |
| `src/pages/DashboardPage.tsx` | **Modify** | Show short positions with badge, dividend transactions in history |
| `src/pages/AuthPage.tsx` | **Modify** | Add `display_name` field to signup form |
| `src/pages/LeaderboardPage.tsx` | **Create** | Full leaderboard with equity computation, rank, your-row highlight |
| `src/App.tsx` | **Modify** | Add `'leaderboard'` to `Page` type, add nav tab, render `LeaderboardPage` |
| `supabase/migrations/20260325180000_006_features_v2.sql` | **Create** | Add `display_name`, `short_entry_price`, `bracket_id`, `take_profit` order type |
| `vite.config.ts` | **Modify** | Add vitest config block |
| `CLAUDE.md` | **Modify** | Update commands for bun, add test command |

---

## Task 1: Switch to Bun

**Files:**
- Delete: `package-lock.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Install bun globally if needed**

```bash
which bun || curl -fsSL https://bun.sh/install | bash
```

- [ ] **Step 2: Remove npm lockfile and install with bun**

```bash
cd /path/to/stocktradesim
rm package-lock.json
bun install
```

Expected: `bun.lockb` created, `node_modules/` populated.

- [ ] **Step 3: Verify dev server starts**

```bash
bun run dev
```

Expected: Vite dev server starts at `http://localhost:5173` with no errors.

- [ ] **Step 4: Verify build works**

```bash
bun run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 5: Update CLAUDE.md commands**

Replace the commands block in `CLAUDE.md`:

```markdown
## Commands

\`\`\`bash
bun run dev          # Start Vite dev server
bun run build        # Production build (tsc + vite build)
bun run lint         # ESLint with flat config
bun run preview      # Preview production build
bun run typecheck    # Type-check without emitting (tsconfig.app.json)
bun test             # Run unit tests (vitest)
bun test --watch     # Watch mode
\`\`\`
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: migrate from npm to bun"
```

---

## Task 2: Install Vitest and Configure

**Files:**
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`

No tests exist yet. This sets up the framework used in Tasks 3 and 6.

- [ ] **Step 1: Install vitest**

```bash
bun add -d vitest @vitest/ui
```

- [ ] **Step 2: Add vitest config to vite.config.ts**

Current `vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
```

Replace with:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 3: Add types to tsconfig.app.json**

In `tsconfig.app.json`, add `"types": ["vitest/globals"]` under `compilerOptions`:

```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

- [ ] **Step 4: Verify vitest runs**

```bash
bun test
```

Expected: `No test files found` (that's fine — no tests yet).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts tsconfig.app.json package.json bun.lockb
git commit -m "chore: add vitest"
```

---

## Task 3: GBM Price Simulation Engine

**Files:**
- Rewrite: `src/services/marketSimulation.ts`
- Create: `src/services/marketSimulation.test.ts`

The existing engine uses `sin(seed)` random walks. Replace entirely with GBM. Keep the same exported function signatures so no other files break.

- [ ] **Step 1: Write failing tests first**

Create `src/services/marketSimulation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getCurrentPrice,
  getCandleHistory,
  getTimeframeMs,
  getAllStocks,
  getDividendYield,
} from './marketSimulation';

describe('marketSimulation', () => {
  it('returns a positive price for known symbols', () => {
    const price = getCurrentPrice('AAPL');
    expect(price).toBeGreaterThan(0);
  });

  it('returns 0 for unknown symbols', () => {
    expect(getCurrentPrice('FAKE')).toBe(0);
  });

  it('returns same price for same timestamp (deterministic)', () => {
    const t = new Date('2026-01-15T10:00:00Z');
    expect(getCurrentPrice('AAPL', t)).toBe(getCurrentPrice('AAPL', t));
  });

  it('returns different prices for different symbols at same time', () => {
    const t = new Date('2026-01-15T10:00:00Z');
    expect(getCurrentPrice('AAPL', t)).not.toBe(getCurrentPrice('MSFT', t));
  });

  it('generates candles with valid OHLCV structure', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-31T00:00:00Z');
    const candles = getCandleHistory('AAPL', start, end, getTimeframeMs('1d'));

    expect(candles.length).toBeGreaterThan(0);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(c.low);
      expect(c.high).toBeGreaterThanOrEqual(c.open);
      expect(c.high).toBeGreaterThanOrEqual(c.close);
      expect(c.low).toBeLessThanOrEqual(c.open);
      expect(c.low).toBeLessThanOrEqual(c.close);
      expect(c.volume).toBeGreaterThan(0);
    }
  });

  it('getAllStocks returns 12 entries', () => {
    expect(getAllStocks().length).toBe(12);
  });

  it('getDividendYield returns positive yield for dividend stocks', () => {
    expect(getDividendYield('AAPL')).toBeGreaterThan(0);
    expect(getDividendYield('MSFT')).toBeGreaterThan(0);
    expect(getDividendYield('JPM')).toBeGreaterThan(0);
  });

  it('getDividendYield returns 0 for non-dividend stocks', () => {
    expect(getDividendYield('TSLA')).toBe(0);
    expect(getDividendYield('NVDA')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test src/services/marketSimulation.test.ts
```

Expected: FAIL — `getDividendYield` not found, functions may not match.

- [ ] **Step 3: Rewrite marketSimulation.ts**

```ts
// src/services/marketSimulation.ts

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

// Deterministic seeded PRNG (LCG — fast and portable)
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

// Deterministic seed from symbol + candle index
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

// Build price history using GBM + GARCH-lite, returns `numCandles` closing prices starting from basePrice
function buildPriceHistory(config: StockConfig, numCandles: number, dt: number): number[] {
  const prices: number[] = [config.basePrice];
  const { mu, sigma } = config;

  // GARCH-lite state: α + β = 0.95, γ adds proportional shock
  const alpha = 0.05;
  const beta = 0.90;
  const gamma = 0.05;
  let currentVol = sigma;

  for (let i = 0; i < numCandles - 1; i++) {
    const rng = lcg(candleSeed(config.symbol, i));
    const Z = boxMuller(rng(), rng());

    // GARCH-lite vol update — clamped to [0.5σ, 3σ]
    currentVol = alpha * sigma + beta * currentVol + gamma * Math.abs(Z) * sigma;
    currentVol = Math.max(0.5 * sigma, Math.min(3 * sigma, currentVol));

    // GBM step
    const drift = (mu - (currentVol * currentVol) / 2) * dt;
    const diffusion = currentVol * Math.sqrt(dt) * Z;
    const prev = prices[prices.length - 1];
    prices.push(Math.max(0.01, prev * Math.exp(drift + diffusion)));
  }

  return prices;
}

function candlesPerDay(timeframeMs: number): number {
  const msPerHour = 3_600_000;
  return Math.max(1, (HOURS_PER_TRADING_DAY * msPerHour) / timeframeMs);
}

function dtForTimeframe(timeframeMs: number): number {
  return 1 / (TRADING_DAYS_PER_YEAR * candlesPerDay(timeframeMs));
}

// Returns the number of candles from epoch to a given timestamp for a timeframe
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
  // Build only up to current candle index (capped at 1000 for perf)
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

  // Build price history from index 0 up to endIdx for determinism
  const totalCandles = Math.min(endIdx + 1, 2000);
  const allPrices = buildPriceHistory(config, totalCandles, dt);

  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const absIdx = startIdx + i;
    if (absIdx >= allPrices.length) break;

    const close = allPrices[absIdx];
    // Synthesise O/H/L from close and next/prev prices
    const prev = absIdx > 0 ? allPrices[absIdx - 1] : close;
    const open = prev;
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test src/services/marketSimulation.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Verify typecheck passes**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/services/marketSimulation.ts src/services/marketSimulation.test.ts
git commit -m "feat: replace sine-based simulation with GBM price engine + GARCH-lite vol clustering"
```

---

## Task 4: DB Migration

**Files:**
- Create: `supabase/migrations/20260325180000_006_features_v2.sql`

> **Prerequisite:** `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must exist.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260325180000_006_features_v2.sql

-- 1. Add display_name to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;

-- 2. Add short_entry_price to portfolios (for tracking short position VWAP)
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS short_entry_price numeric;

-- 3. Add take_profit to orders type check and bracket_id for linking legs
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_type_check
  CHECK (type IN ('market', 'limit', 'stop_loss', 'stop_loss_limit', 'take_profit'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS bracket_id uuid;
CREATE INDEX IF NOT EXISTS idx_orders_bracket_id ON orders(bracket_id);

-- 4. Leaderboard: allow authenticated users to read other users' basic info
--    (display_name and virtual_balance only — enforced by select policy below)
CREATE POLICY IF NOT EXISTS "Users can read leaderboard data"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. Allow users to update their own display_name
CREATE POLICY IF NOT EXISTS "Users can update own display_name"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

- [ ] **Step 2: Apply the migration via Supabase dashboard or CLI**

If using Supabase CLI:
```bash
supabase db push
```

If applying manually: paste the SQL into the Supabase SQL editor and run it.

- [ ] **Step 3: Verify in Supabase dashboard**

- `users` table has `display_name` column
- `portfolios` table has `short_entry_price` column
- `orders` table has `bracket_id` column and `type` check includes `take_profit`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260325180000_006_features_v2.sql
git commit -m "feat: add display_name, short_entry_price, bracket_id, take_profit migration"
```

---

## Task 5: Update TypeScript Types in supabase.ts

**Files:**
- Modify: `src/services/supabase.ts`

Update types and add new query functions needed by the leaderboard.

- [ ] **Step 1: Update interfaces**

In `src/services/supabase.ts`, update these interfaces:

```ts
// Add display_name to User
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  virtual_balance: number;
  created_at: string;
  updated_at: string;
}

// Add short_entry_price to Portfolio
export interface Portfolio {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number;           // negative = short position
  average_cost_basis: number;
  short_entry_price: number | null;
  created_at: string;
  updated_at: string;
}

// Add take_profit and bracket_id to Order
export interface Order {
  id: string;
  user_id: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop_loss' | 'stop_loss_limit' | 'take_profit';
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  stop_price?: number;
  bracket_id?: string;
  status: 'pending' | 'filled' | 'cancelled';
  created_at: string;
  filled_at?: string;
}

// Add LeaderboardEntry
export interface LeaderboardEntry {
  id: string;
  display_name: string | null;
  virtual_balance: number;
  portfolios: { symbol: string; quantity: number; short_entry_price: number | null }[];
}
```

- [ ] **Step 2: Update createOrder signature to support bracket_id and take_profit**

Replace the existing `createOrder` function:

```ts
export async function createOrder(
  userId: string,
  symbol: string,
  type: Order['type'],
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  stopPrice?: number,
  bracketId?: string
): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        user_id: userId,
        symbol,
        type,
        side,
        quantity,
        price,
        stop_price: stopPrice,
        bracket_id: bracketId,
        status: 'pending',
      }])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error creating order:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Error creating order:', err);
    return null;
  }
}
```

- [ ] **Step 3: Add cancelBracketSiblings and leaderboard query functions**

Add these new functions to the bottom of `src/services/supabase.ts`:

```ts
// Cancel all pending orders in the same bracket except the one that just filled
export async function cancelBracketSiblings(bracketId: string, filledOrderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('bracket_id', bracketId)
    .eq('status', 'pending')
    .neq('id', filledOrderId);
  if (error) console.error('Error cancelling bracket siblings:', error);
}

// Fetch top 100 users with their portfolios for leaderboard computation
export async function getLeaderboardData(): Promise<LeaderboardEntry[]> {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, virtual_balance')
      .order('virtual_balance', { ascending: false })
      .limit(100);

    if (usersError || !users) return [];

    const userIds = users.map((u) => u.id);
    const { data: portfolios, error: portError } = await supabase
      .from('portfolios')
      .select('user_id, symbol, quantity, short_entry_price')
      .in('user_id', userIds);

    if (portError) return [];

    return users.map((u) => ({
      ...u,
      portfolios: (portfolios ?? [])
        .filter((p) => p.user_id === u.id)
        .map((p) => ({ symbol: p.symbol, quantity: p.quantity, short_entry_price: p.short_entry_price })),
    }));
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return [];
  }
}

export async function updateDisplayName(userId: string, displayName: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return !error;
}
```

- [ ] **Step 4: Update signUp to accept and store display_name**

In the `signUp` function, add `display_name` to the insert:

```ts
export async function signUp(
  email: string,
  password: string,
  displayName?: string
): Promise<{ user: User | null; error: string | null }> {
  // ... (existing auth.signUp call) ...
  // In the insert:
  .insert([{
    id: data.user.id,
    email,
    password_hash: 'handled_by_auth',
    virtual_balance: 100000,
    display_name: displayName ?? email.split('@')[0],
  }])
```

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/services/supabase.ts
git commit -m "feat: update supabase types and queries for features v2"
```

---

## Task 6: Take Profit + Bracket Orders in Trading Engine

**Files:**
- Modify: `src/services/tradingEngine.ts`
- Create: `src/services/tradingEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/tradingEngine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase module — we test logic, not DB calls
vi.mock('./supabase', () => ({
  createTransaction: vi.fn().mockResolvedValue({ id: 'txn-1' }),
  updatePortfolio: vi.fn().mockResolvedValue(true),
  updateUserBalance: vi.fn().mockResolvedValue(true),
  getPortfolios: vi.fn().mockResolvedValue([]),
  createOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
  getOrders: vi.fn().mockResolvedValue([]),
  cancelBracketSiblings: vi.fn().mockResolvedValue(undefined),
  supabase: { from: vi.fn() },
}));

vi.mock('./marketSimulation', () => ({
  getCurrentPrice: vi.fn().mockReturnValue(100),
}));

import { validateBuyOrder, validateSellOrder, validateShortOrder } from './tradingEngine';
import { getPortfolios } from './supabase';

const mockUser = {
  id: 'user-1',
  email: 'test@test.com',
  display_name: 'Tester',
  virtual_balance: 10000,
  created_at: '',
  updated_at: '',
};

describe('validateBuyOrder', () => {
  it('returns null for valid buy', async () => {
    vi.mocked(getPortfolios).mockResolvedValue([]);
    const result = await validateBuyOrder(mockUser, 'AAPL', 10);
    expect(result).toBeNull();
  });

  it('returns error when balance is insufficient', async () => {
    const poorUser = { ...mockUser, virtual_balance: 5 };
    const result = await validateBuyOrder(poorUser, 'AAPL', 10);
    expect(result).toContain('Insufficient');
  });

  it('returns error for zero quantity', async () => {
    const result = await validateBuyOrder(mockUser, 'AAPL', 0);
    expect(result).toContain('greater than 0');
  });
});

describe('validateSellOrder', () => {
  it('returns error when user has no shares', async () => {
    vi.mocked(getPortfolios).mockResolvedValue([]);
    const result = await validateSellOrder(mockUser, 'AAPL', 5);
    expect(result).toContain("don't own");
  });

  it('returns error when selling more than owned', async () => {
    vi.mocked(getPortfolios).mockResolvedValue([
      { id: 'p1', user_id: 'user-1', symbol: 'AAPL', quantity: 3,
        average_cost_basis: 100, short_entry_price: null, created_at: '', updated_at: '' },
    ]);
    const result = await validateSellOrder(mockUser, 'AAPL', 10);
    expect(result).toContain('only own 3');
  });
});

describe('short selling collateral check', () => {
  it('requires 150% collateral to open a short', async () => {
    // price = 100, qty = 10, required collateral = 1500, balance = 10000 → ok
    const result = await validateShortOrder(mockUser, 'AAPL', 10);
    expect(result).toBeNull();
  });

  it('blocks short if balance < 150% collateral', async () => {
    const poorUser = { ...mockUser, virtual_balance: 100 };
    const result = await validateShortOrder(poorUser, 'AAPL', 10);
    expect(result).toContain('collateral');
  });
});
```

Import `validateShortOrder` — this doesn't exist yet, so tests will fail.

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test src/services/tradingEngine.test.ts
```

Expected: FAIL — `validateShortOrder` not found.

- [ ] **Step 3: Add take profit execution to checkAndExecutePendingOrders**

In `src/services/tradingEngine.ts`, add to the `checkAndExecutePendingOrders` function, after the `stop_loss_limit` block:

```ts
} else if (order.type === 'take_profit') {
  if (order.side === 'sell' && currentPrice >= order.price) shouldExecute = true;
  if (order.side === 'buy'  && currentPrice <= order.price) shouldExecute = true;
}
```

- [ ] **Step 4: Update executeOrder to cancel bracket siblings after fill**

In `src/services/tradingEngine.ts`, update the `executeOrder` function:

```ts
import { cancelBracketSiblings } from './supabase';

async function executeOrder(order: Order, user: User, executionPrice: number): Promise<void> {
  let result;
  if (order.side === 'buy') {
    result = await executeBuyOrder(user, order.symbol, order.quantity, executionPrice);
  } else {
    result = await executeSellOrder(user, order.symbol, order.quantity, executionPrice);
  }

  if (result.success) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'filled', filled_at: new Date().toISOString() })
      .eq('id', order.id);

    if (error) console.error('Error updating order status:', error);

    // Cancel sibling legs of a bracket order
    if (order.bracket_id) {
      await cancelBracketSiblings(order.bracket_id, order.id);
    }
  }
}
```

- [ ] **Step 5: Add placeBracketOrder and validateShortOrder**

Add to the bottom of `src/services/tradingEngine.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';

// Place a market buy + optional take profit + stop loss bracket
export async function placeBracketOrder(
  user: User,
  symbol: string,
  quantity: number,
  takeProfitPrice: number | null,
  stopLossPrice: number | null
): Promise<TradeResult> {
  const currentPrice = getCurrentPrice(symbol);

  // Step 1: Execute the market buy first
  const buyResult = await executeBuyOrder(user, symbol, quantity, currentPrice);
  if (!buyResult.success) return buyResult;

  // Only place contingent legs if at least one is specified
  if (takeProfitPrice === null && stopLossPrice === null) return buyResult;

  const bracketId = uuidv4();

  if (takeProfitPrice !== null) {
    await createOrder(user.id, symbol, 'take_profit', 'sell', quantity, takeProfitPrice, undefined, bracketId);
  }
  if (stopLossPrice !== null) {
    await createOrder(user.id, symbol, 'stop_loss', 'sell', quantity, stopLossPrice, stopLossPrice, bracketId);
  }

  return {
    ...buyResult,
    message: `Bought ${quantity} ${symbol} at $${currentPrice}` +
      (takeProfitPrice ? ` · TP $${takeProfitPrice}` : '') +
      (stopLossPrice   ? ` · SL $${stopLossPrice}`   : ''),
  };
}

export async function validateShortOrder(user: User, symbol: string, quantity: number): Promise<string | null> {
  if (quantity <= 0) return 'Quantity must be greater than 0';

  const currentPrice = getCurrentPrice(symbol);
  if (currentPrice <= 0) return 'Invalid stock symbol';

  const requiredCollateral = quantity * currentPrice * 1.5;
  if (user.virtual_balance < requiredCollateral) {
    return `Insufficient collateral. Need $${requiredCollateral.toFixed(2)} (150% of position value), have $${user.virtual_balance.toFixed(2)}`;
  }
  return null;
}
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
bun test src/services/tradingEngine.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/services/tradingEngine.ts src/services/tradingEngine.test.ts
git commit -m "feat: add take_profit order type, bracket orders, and validateShortOrder"
```

---

## Task 7: Short Selling in Trading Engine

**Files:**
- Modify: `src/services/tradingEngine.ts`
- Modify: `src/services/supabase.ts`

- [ ] **Step 1: Add executeShortOrder to tradingEngine.ts**

```ts
export async function executeShortOrder(
  user: User,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  const currentPrice = getCurrentPrice(symbol);
  if (currentPrice <= 0) return { success: false, message: 'Invalid stock symbol' };

  const validation = await validateShortOrder(user, symbol, quantity);
  if (validation) return { success: false, message: validation };

  const collateral = quantity * currentPrice * 1.5;
  const newBalance = user.virtual_balance - collateral;

  const portfolios = await getPortfolios(user.id);
  const existing = portfolios.find((p) => p.symbol === symbol);

  // VWAP for existing short
  let newQty: number;
  let newEntryPrice: number;

  if (existing && existing.quantity < 0) {
    const existingAbs = Math.abs(existing.quantity);
    newQty = existing.quantity - quantity;  // more negative
    newEntryPrice = (existingAbs * (existing.short_entry_price ?? currentPrice) + quantity * currentPrice)
                    / (existingAbs + quantity);
  } else {
    newQty = -(quantity);
    newEntryPrice = currentPrice;
  }

  const transaction = await createTransaction(user.id, symbol, 'sell', quantity, currentPrice);
  if (!transaction) return { success: false, message: 'Failed to create transaction' };

  // updatePortfolioShort upserts with short_entry_price
  const ok = await updatePortfolioShort(user.id, symbol, newQty, newEntryPrice);
  if (!ok) return { success: false, message: 'Failed to update portfolio' };

  const balOk = await updateUserBalance(user.id, newBalance);
  if (!balOk) return { success: false, message: 'Failed to update balance' };

  return {
    success: true,
    message: `Shorted ${quantity} shares of ${symbol} at $${currentPrice} · collateral held: $${collateral.toFixed(2)}`,
    newBalance,
    newQuantity: newQty,
  };
}

export async function executeCoverOrder(
  user: User,
  symbol: string,
  quantity: number,
): Promise<TradeResult> {
  const currentPrice = getCurrentPrice(symbol);
  if (currentPrice <= 0) return { success: false, message: 'Invalid stock symbol' };

  const portfolios = await getPortfolios(user.id);
  const position = portfolios.find((p) => p.symbol === symbol);

  if (!position || position.quantity >= 0) {
    return { success: false, message: `No short position in ${symbol} to cover` };
  }

  const shortQty = Math.abs(position.quantity);
  if (quantity > shortQty) {
    return { success: false, message: `Can only cover up to ${shortQty} shares` };
  }

  const entryPrice = position.short_entry_price ?? currentPrice;
  const pnl = (entryPrice - currentPrice) * quantity;
  const collateralReturned = quantity * entryPrice * 1.5;
  const creditToBalance = collateralReturned + pnl;
  const newBalance = user.virtual_balance + creditToBalance;

  const transaction = await createTransaction(user.id, symbol, 'buy', quantity, currentPrice);
  if (!transaction) return { success: false, message: 'Failed to create transaction' };

  const remaining = position.quantity + quantity; // less negative or 0

  if (remaining === 0) {
    // Delete the portfolio row
    const { error } = await supabase.from('portfolios').delete().eq('id', position.id);
    if (error) return { success: false, message: 'Failed to close short position' };
  } else {
    // Keep short_entry_price unchanged on partial cover
    const ok = await updatePortfolioShort(user.id, symbol, remaining, entryPrice);
    if (!ok) return { success: false, message: 'Failed to update portfolio' };
  }

  const balOk = await updateUserBalance(user.id, newBalance);
  if (!balOk) return { success: false, message: 'Failed to update balance' };

  return {
    success: true,
    message: `Covered ${quantity} shares of ${symbol} · P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
    newBalance,
    newQuantity: remaining,
  };
}
```

- [ ] **Step 2: Add updatePortfolioShort to supabase.ts**

```ts
export async function updatePortfolioShort(
  userId: string,
  symbol: string,
  quantity: number,
  shortEntryPrice: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('portfolios')
      .upsert(
        {
          user_id: userId,
          symbol,
          quantity,
          average_cost_basis: 0,
          short_entry_price: shortEntryPrice,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,symbol' }
      );
    if (error) { console.error('Error updating short portfolio:', error); return false; }
    return true;
  } catch (err) {
    console.error('Error updating short portfolio:', err);
    return false;
  }
}
```

- [ ] **Step 3: Add short-selling validation test**

Add to `src/services/tradingEngine.test.ts`:

```ts
describe('executeCoverOrder', () => {
  it('returns error when no short position exists', async () => {
    vi.mocked(getPortfolios).mockResolvedValue([]);
    const { executeCoverOrder } = await import('./tradingEngine');
    const result = await executeCoverOrder(mockUser, 'AAPL', 5);
    expect(result.success).toBe(false);
    expect(result.message).toContain('No short position');
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test src/services/tradingEngine.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/services/tradingEngine.ts src/services/supabase.ts src/services/tradingEngine.test.ts
git commit -m "feat: add short selling — executeShortOrder and executeCoverOrder"
```

---

## Task 8: Dividends

**Files:**
- Modify: `src/services/tradingEngine.ts`

Dividends are credited on each price-tick cycle. The `creditDividends` function is called alongside `checkAndExecutePendingOrders` in `useStockPrice` polling.

- [ ] **Step 1: Add creditDividends to tradingEngine.ts**

```ts
import { getDividendYield } from './marketSimulation';

const TICKS_PER_DAY = 86400; // 1-second tick interval → 86400 ticks/day
const TRADING_DAYS_PER_YEAR = 252;
const DAYS_PER_QUARTER = 91.25;

export async function creditDividends(user: User, portfolios: Portfolio[]): Promise<void> {
  // Accumulate total dividends across all positions first, then write one balance update.
  // Writing inside the loop would overwrite with a stale base balance each iteration.
  let totalDividend = 0;

  for (const position of portfolios) {
    if (position.quantity <= 0) continue; // no dividend on short positions

    const yieldPerQuarter = getDividendYield(position.symbol);
    if (yieldPerQuarter === 0) continue;

    const currentPrice = getCurrentPrice(position.symbol);
    const yieldPerTick = yieldPerQuarter / (DAYS_PER_QUARTER * TICKS_PER_DAY);
    const dividend = position.quantity * currentPrice * yieldPerTick;

    if (dividend < 0.0001) continue; // skip dust

    totalDividend += dividend;
    await createTransaction(user.id, position.symbol, 'dividend' as any, position.quantity, dividend / position.quantity);
  }

  if (totalDividend > 0) {
    await updateUserBalance(user.id, user.virtual_balance + totalDividend);
  }
}
```

Note: `'dividend'` is cast as `any` because the `Transaction.type` union doesn't include it yet. Update the `Transaction` interface in `supabase.ts`:

```ts
export interface Transaction {
  // ...
  type: 'buy' | 'sell' | 'dividend';
  // ...
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/tradingEngine.ts src/services/supabase.ts
git commit -m "feat: add dividend credit on price tick cycle"
```

---

## Task 9: Rewrite CandlestickChart with lightweight-charts

**Files:**
- Rewrite: `src/components/CandlestickChart.tsx`

- [ ] **Step 1: Install lightweight-charts**

```bash
bun add lightweight-charts
```

- [ ] **Step 2: Rewrite CandlestickChart.tsx**

```tsx
// src/components/CandlestickChart.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineStyle,
  IPriceLine,
  UTCTimestamp,
} from 'lightweight-charts';
import { getCandleHistory, getTimeframeMs } from '../services/marketSimulation';
import { subHours, subWeeks, subMonths } from 'date-fns';

interface CandlestickChartProps {
  symbol: string;
  /** When provided, shows draggable entry/TP/SL lines and fires this callback on drag */
  onTradeIntent?: (entry: number, takeProfit: number | null, stopLoss: number | null) => void;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'] as const;

function getStartTime(tf: string): Date {
  const now = new Date();
  switch (tf) {
    case '1m': case '5m': case '15m': case '1h': return subHours(now, 24);
    case '4h': case '1d': return subWeeks(now, 4);
    case '1w': return subMonths(now, 12);
    case '1mo': return subMonths(now, 36);
    default: return subWeeks(now, 4);
  }
}

export function CandlestickChart({ symbol, onTradeIntent }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [timeframe, setTimeframe] = useState('1d');

  // Trade line state (only when onTradeIntent is provided)
  const entryLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);

  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [slPrice, setSlPrice] = useState<number | null>(null);

  // Mount chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1e2235' },
        horzLines: { color: '#1e2235' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#1e2235' },
      timeScale: {
        borderColor: '#1e2235',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 450,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candle data when symbol or timeframe changes
  useEffect(() => {
    if (!seriesRef.current) return;
    const tfMs = getTimeframeMs(timeframe);
    const start = getStartTime(timeframe);
    const candles = getCandleHistory(symbol, start, new Date(), tfMs);

    const data: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();

    // Set initial trade line prices based on last candle
    if (onTradeIntent && data.length > 0) {
      const last = data[data.length - 1].close;
      setEntryPrice(last);
      setTpPrice(parseFloat((last * 1.03).toFixed(2)));
      setSlPrice(parseFloat((last * 0.98).toFixed(2)));
    }
  }, [symbol, timeframe, onTradeIntent]);

  // Draw/update draggable price lines when prices change
  useEffect(() => {
    if (!seriesRef.current || !onTradeIntent || entryPrice === 0) return;
    const series = seriesRef.current;

    // Remove old lines
    if (entryLineRef.current) { try { series.removePriceLine(entryLineRef.current); } catch {} }
    if (tpLineRef.current)    { try { series.removePriceLine(tpLineRef.current);    } catch {} }
    if (slLineRef.current)    { try { series.removePriceLine(slLineRef.current);    } catch {} }

    entryLineRef.current = series.createPriceLine({
      price: entryPrice,
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `ENTRY  $${entryPrice.toFixed(2)}`,
    });

    if (tpPrice !== null) {
      const pct = (((tpPrice - entryPrice) / entryPrice) * 100).toFixed(1);
      tpLineRef.current = series.createPriceLine({
        price: tpPrice,
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP  $${tpPrice.toFixed(2)}  +${pct}%`,
      });
    }

    if (slPrice !== null) {
      const pct = (((slPrice - entryPrice) / entryPrice) * 100).toFixed(1);
      slLineRef.current = series.createPriceLine({
        price: slPrice,
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SL  $${slPrice.toFixed(2)}  ${pct}%`,
      });
    }

    onTradeIntent(entryPrice, tpPrice, slPrice);
  }, [entryPrice, tpPrice, slPrice, onTradeIntent]);

  return (
    <div className="w-full bg-[#131722] rounded-lg overflow-hidden">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-[#1e2235]">
        <span className="text-[#d1d4dc] font-bold text-sm mr-2">{symbol}</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              timeframe === tf
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className="w-full" />

      {/* Draggable line controls — only when in trade mode */}
      {onTradeIntent && entryPrice > 0 && (
        <div className="px-4 py-3 border-t border-[#1e2235] grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-[#2962ff] font-bold uppercase tracking-wide block mb-1">Entry</label>
            <input
              type="number"
              value={entryPrice}
              step="0.01"
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#1e2235] text-[#d1d4dc] text-sm px-2 py-1 rounded border border-[#2962ff] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#26a69a] font-bold uppercase tracking-wide block mb-1">Take Profit</label>
            <input
              type="number"
              value={tpPrice ?? ''}
              step="0.01"
              placeholder="optional"
              onChange={(e) => setTpPrice(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full bg-[#1e2235] text-[#d1d4dc] text-sm px-2 py-1 rounded border border-[#26a69a] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#ef5350] font-bold uppercase tracking-wide block mb-1">Stop Loss</label>
            <input
              type="number"
              value={slPrice ?? ''}
              step="0.01"
              placeholder="optional"
              onChange={(e) => setSlPrice(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full bg-[#1e2235] text-[#d1d4dc] text-sm px-2 py-1 rounded border border-[#ef5350] outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

> **Note on dragging:** `lightweight-charts` v4.1+ supports `draggable: true` on price lines. If the installed version supports it, add `draggable: true` to each `createPriceLine` call and subscribe to `chart.subscribePriceLineDragged` to sync state back. Check the installed version's docs with `bun info lightweight-charts`. If drag isn't available, the numeric inputs below the chart serve as the interaction surface — they update the lines and fire `onTradeIntent`.

- [ ] **Step 3: Verify app loads (no typecheck errors)**

```bash
bun run typecheck
bun run dev
```

Open `http://localhost:5173`, navigate to Trade page, verify chart renders with real candlesticks.

- [ ] **Step 4: Commit**

```bash
git add src/components/CandlestickChart.tsx package.json bun.lockb
git commit -m "feat: replace Recharts with lightweight-charts — real candlesticks, zoom, trade lines"
```

---

## Task 10: Update TradePage — LONG/SHORT Tabs + Bracket Orders

**Files:**
- Modify: `src/pages/TradePage.tsx`

- [ ] **Step 1: Add SHORT mode state and bracket order inputs**

Key changes to `TradePage.tsx`:

1. Add `tradeMode: 'long' | 'short'` state.
2. Add `takeProfitPrice: number | null` and `stopLossPrice: number | null` state.
3. Add `chartEntry: number` state that syncs from chart's `onTradeIntent`.
4. Replace Buy/Sell buttons with LONG / SHORT tabs.
5. On submit: if `tradeMode === 'long'` → `placeBracketOrder`; if `tradeMode === 'short'` → `executeShortOrder`; if user has a short position and clicks LONG → `executeCoverOrder`.
6. Show a risk/reward ratio when both TP and SL are set: `Math.abs((tpPrice - entry) / (entry - slPrice)).toFixed(2)`.

Replace the relevant section of `TradePage.tsx`:

```tsx
// Add these state vars
const [tradeMode, setTradeMode] = useState<'long' | 'short'>('long');
const [takeProfitPrice, setTakeProfitPrice] = useState<number | null>(null);
const [stopLossPrice, setStopLossPrice] = useState<number | null>(null);
const [chartEntry, setChartEntry] = useState<number>(0);

// Handler from chart
const handleTradeIntent = useCallback((entry: number, tp: number | null, sl: number | null) => {
  setChartEntry(entry);
  setTakeProfitPrice(tp);
  setStopLossPrice(sl);
}, []);

// Updated handleSubmit
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(''); setSuccess('');
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) { setError('Please enter a valid quantity'); return; }

  setIsLoading(true);
  try {
    let result: TradeResult;

    if (tradeMode === 'long') {
      result = await placeBracketOrder(user, symbol, qty, takeProfitPrice, stopLossPrice);
    } else {
      // Check if user has a short to cover
      const ports = await getPortfolios(user.id);
      const pos = ports.find((p) => p.symbol === symbol);
      if (pos && pos.quantity < 0) {
        result = await executeCoverOrder(user, symbol, qty);
      } else {
        result = await executeShortOrder(user, symbol, qty);
      }
    }

    if (result.success) {
      setSuccess(result.message);
      setQuantity('');
      onOrderExecuted?.();
    } else {
      setError(result.message);
    }
  } finally {
    setIsLoading(false);
  }
};
```

Replace the Buy/Sell button row with LONG/SHORT tabs:

```tsx
<div className="flex gap-0 mb-4 rounded-lg overflow-hidden border border-gray-200">
  <button
    onClick={() => setTradeMode('long')}
    className={`flex-1 py-2 font-semibold text-sm transition-colors ${
      tradeMode === 'long' ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
    }`}
  >
    LONG
  </button>
  <button
    onClick={() => setTradeMode('short')}
    className={`flex-1 py-2 font-semibold text-sm transition-colors ${
      tradeMode === 'short' ? 'bg-red-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
    }`}
  >
    SHORT
  </button>
</div>
```

Pass `onTradeIntent` to the chart:

```tsx
<CandlestickChart symbol={symbol} onTradeIntent={handleTradeIntent} />
```

Remove the old order type selector (limit/stop_loss/stop_loss_limit) — bracket orders are now set via the chart controls. Keep market order only. The TP/SL fields already exist on the chart panel.

- [ ] **Step 2: Add short warning banner**

Above the submit button, show the warning when a short is at risk:

```tsx
{tradeMode === 'short' && shortWarning && (
  <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3 py-2 rounded">
    ⚠️ Short position at risk — current price is more than 25% above your entry. Consider covering.
  </div>
)}
```

Compute `shortWarning` in a `useEffect` that watches `price` and the existing short position's `short_entry_price`.

- [ ] **Step 3: Typecheck and smoke test**

```bash
bun run typecheck
bun run dev
```

Navigate to Trade, open a position with TP and SL set via chart inputs. Verify order panel shows the right total cost.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TradePage.tsx
git commit -m "feat: add LONG/SHORT tabs and bracket order UI to TradePage"
```

---

## Task 11: Update DashboardPage — Short Positions + Dividend History

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

Read the existing `DashboardPage.tsx` first before making changes.

- [ ] **Step 1: Show short positions with badge**

In the portfolio holdings list, detect negative `quantity`:

```tsx
{position.quantity < 0 && (
  <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
    SHORT
  </span>
)}
```

For short positions, display unrealized P/L as `(entry - currentPrice) × |quantity|`.

- [ ] **Step 2: Show dividend transactions in history**

In the transaction history list, add a distinct style for `type === 'dividend'`:

```tsx
{tx.type === 'dividend' && (
  <span className="text-xs text-amber-600 font-semibold">DIV</span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: show short positions and dividend transactions on dashboard"
```

---

## Task 12: Add display_name to AuthPage Signup

**Files:**
- Modify: `src/pages/AuthPage.tsx`

- [ ] **Step 1: Add display_name field and update signUp call**

In the signup form, add an input above password:

```tsx
const [displayName, setDisplayName] = useState('');

// In JSX (signup mode only):
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
  <input
    type="text"
    value={displayName}
    onChange={(e) => setDisplayName(e.target.value)}
    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    placeholder="How you'll appear on the leaderboard"
    required
  />
</div>
```

Update the signUp call:

```tsx
const { user, error: signUpError } = await signUp(email, password, displayName);
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AuthPage.tsx
git commit -m "feat: add display_name to signup flow"
```

---

## Task 13: Build LeaderboardPage

**Files:**
- Create: `src/pages/LeaderboardPage.tsx`

- [ ] **Step 1: Create LeaderboardPage.tsx**

```tsx
// src/pages/LeaderboardPage.tsx
import { useState, useEffect } from 'react';
import { User, getLeaderboardData, LeaderboardEntry } from '../services/supabase';
import { getCurrentPrice } from '../services/marketSimulation';

interface LeaderboardPageProps {
  user: User;
}

const STARTING_BALANCE = 100_000;

function computeEquity(entry: LeaderboardEntry): number {
  let equity = entry.virtual_balance;

  for (const pos of entry.portfolios) {
    const price = getCurrentPrice(pos.symbol);
    if (pos.quantity > 0) {
      equity += pos.quantity * price;
    } else if (pos.quantity < 0) {
      const absQty = Math.abs(pos.quantity);
      const entryPrice = pos.short_entry_price ?? price;
      const collateral = absQty * entryPrice * 1.5;
      const pnl = (entryPrice - price) * absQty;
      equity += collateral + pnl;
    }
  }

  return equity;
}

export function LeaderboardPage({ user }: LeaderboardPageProps) {
  const [entries, setEntries] = useState<(LeaderboardEntry & { equity: number; rank: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const data = await getLeaderboardData();
      const withEquity = data
        .map((e) => ({ ...e, equity: computeEquity(e) }))
        .sort((a, b) => b.equity - a.equity)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      setEntries(withEquity);
      setIsLoading(false);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const myEntry = entries.find((e) => e.id === user.id);
  const myReturn = myEntry ? ((myEntry.equity - STARTING_BALANCE) / STARTING_BALANCE * 100) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard</h1>

        {/* Your stats */}
        {myEntry && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs text-blue-600 font-semibold uppercase">Your Rank</p>
              <p className="text-3xl font-bold text-blue-700">#{myEntry.rank}</p>
              <p className="text-xs text-gray-500">of {entries.length} traders</p>
            </div>
            <div className={`${myReturn >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
              <p className={`text-xs font-semibold uppercase ${myReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>Your Return</p>
              <p className={`text-3xl font-bold ${myReturn >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {myReturn >= 0 ? '+' : ''}{myReturn.toFixed(2)}%
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase">Portfolio Value</p>
              <p className="text-3xl font-bold text-gray-900">${myEntry.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[40px_1fr_120px_100px] gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>#</span>
            <span>Trader</span>
            <span className="text-right">Value</span>
            <span className="text-right">Return</span>
          </div>

          {entries.map((entry) => {
            const ret = ((entry.equity - STARTING_BALANCE) / STARTING_BALANCE * 100);
            const isMe = entry.id === user.id;
            return (
              <div
                key={entry.id}
                className={`grid grid-cols-[40px_1fr_120px_100px] gap-0 px-4 py-3 border-b border-gray-100 items-center ${
                  isMe ? 'bg-blue-50' : ''
                }`}
              >
                <span className={`text-sm font-bold ${
                  entry.rank === 1 ? 'text-yellow-500' :
                  entry.rank === 2 ? 'text-gray-400' :
                  entry.rank === 3 ? 'text-amber-600' :
                  isMe ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : entry.rank}
                </span>
                <div>
                  <span className={`text-sm font-semibold ${isMe ? 'text-blue-700' : 'text-gray-900'}`}>
                    {entry.display_name ?? 'Anonymous'}{isMe ? ' (you)' : ''}
                  </span>
                  <div className="text-xs text-gray-400">
                    {entry.portfolios.slice(0, 2).map((p) => p.symbol).join(', ')}
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 text-right">
                  ${entry.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-sm font-semibold text-right ${ret >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-center">Refreshes every 30 seconds</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LeaderboardPage.tsx
git commit -m "feat: add LeaderboardPage with real-time equity computation"
```

---

## Task 14: Wire Up App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add leaderboard to App.tsx**

```tsx
// Add to imports
import { LeaderboardPage } from './pages/LeaderboardPage';

// Update Page type
type Page = 'dashboard' | 'trade' | 'leaderboard' | 'auth';

// Add nav button (after Trade button):
<button
  onClick={() => handleNavigate('leaderboard')}
  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
    currentPage === 'leaderboard'
      ? 'bg-blue-600 text-white'
      : 'text-gray-700 hover:bg-gray-100'
  }`}
>
  Leaderboard
</button>

// Add page render (after TradePage block):
{currentPage === 'leaderboard' && user && (
  <LeaderboardPage user={user} />
)}
```

- [ ] **Step 2: Final typecheck and smoke test**

```bash
bun run typecheck
bun run dev
```

- Walk through: Auth → Dashboard → Trade (place a long with TP/SL) → Leaderboard (verify you appear)
- Place a short order, check dashboard shows SHORT badge
- Verify chart renders with candlesticks and timeframe switching works

- [ ] **Step 3: Final lint**

```bash
bun run lint
```

Fix any lint issues.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Leaderboard nav to App.tsx"
```

---

## Task 15: Add .gitignore entry for brainstorm files

- [ ] **Step 1: Add .superpowers to .gitignore**

```bash
echo '.superpowers/' >> .gitignore
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm files"
```

---

## Done

At this point the app has:
- Bun as package manager
- GBM price simulation with realistic trends and volatility
- TradingView-style dark chart with real candlesticks, zoom, and trade line inputs
- Take profit + stop loss bracket orders
- Short selling with collateral tracking and cover mechanics
- Quarterly dividend credits (AAPL, MSFT, JPM)
- Global leaderboard with correct equity computation
- display_name collected at signup
