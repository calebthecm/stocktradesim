# Design Spec: Trading Features v2

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Add five interconnected features to the stock trading simulator: a realistic GBM-based price engine, a TradingView-quality chart with zoom/pan and draggable trade lines, take profit orders, short selling, dividends, and a global leaderboard.

---

## 1. Package Manager Migration

Switch from npm to bun. Remove `package-lock.json`, run `bun install`, confirm dev server and build work. Update `CLAUDE.md` commands.

---

## 2. GBM Price Simulation Engine

**Replace** `src/services/marketSimulation.ts` with a Geometric Brownian Motion engine.

### Math

Each tick computes the next price using discrete GBM:

```
S(t+dt) = S(t) · exp((μ - σ²/2)·dt + σ·√dt·Z)
```

Where:
- `μ` = drift (annualized, per-stock, e.g. AAPL ~0.25, TSLA ~0.40)
- `σ` = volatility (annualized, e.g. AAPL ~0.28, TSLA ~0.55)
- `Z` = standard normal random variable (Box-Muller from seeded RNG)
- `dt` = time step (`1 / (252 × candlesPerDay)` — 252 trading days/year is the US equity standard; daily candles use `dt = 1/252`, hourly use `dt = 1/(252×6.5)`, etc.)

**Volatility clustering (GARCH-lite):** Each stock tracks a rolling `currentVol` that reverts toward `baseVol` each step using a mean-reverting update where coefficients sum to 1:

```
currentVol = α · baseVol + β · currentVol + γ · |Z| · baseVol
// where α = 0.05, β = 0.90, γ = 0.05
// α + β = 0.95 guarantees mean-reversion; γ adds proportional shock
```

`currentVol` is initialised to `baseVol`. The shock term (`γ · |Z| · baseVol`) is bounded: `currentVol` is clamped to `[0.5 × baseVol, 3 × baseVol]` after each step to prevent runaway volatility on extreme Z draws. This produces calm periods punctuated by volatile bursts — realistic without full GARCH implementation.

**Seeding:** Each stock gets a deterministic seed derived from `symbol + timeframe`. Same seed → same price history on reload. Seeds advance deterministically per candle so history is stable but new candles extend naturally.

### Per-stock parameters

| Symbol | μ (drift) | σ (base vol) | Base Price |
|--------|-----------|--------------|------------|
| AAPL   | 0.22      | 0.28         | 182        |
| MSFT   | 0.20      | 0.25         | 415        |
| NVDA   | 0.45      | 0.60         | 875        |
| TSLA   | 0.30      | 0.55         | 245        |
| AMZN   | 0.25      | 0.32         | 195        |
| GOOGL  | 0.18      | 0.28         | 175        |
| META   | 0.35      | 0.40         | 520        |
| NFLX   | 0.20      | 0.38         | 680        |
| AMD    | 0.40      | 0.58         | 165        |
| BABA   | -0.05     | 0.45         | 78         |
| JPM    | 0.14      | 0.22         | 210        |
| COIN   | 0.50      | 0.90         | 225        |

### Dividends

Three stocks pay quarterly dividends: AAPL (0.5% quarterly), MSFT (0.7%), JPM (0.9%). Dividend payouts are computed on each price tick cycle using `holdings × price × (yield / 91.25 / ticksPerDay)` and written as `type: 'dividend'` transactions. No new DB table needed.

---

## 3. Chart: lightweight-charts with Draggable Trade Lines

**Replace** `src/components/CandlestickChart.tsx` entirely.

### Library

Install `lightweight-charts` (TradingView OSS, ~70kb). It provides native:
- OHLC candlestick series with green/red bodies and wicks
- Volume histogram series (separate pane)
- Scroll/wheel zoom, click-drag pan
- `createPriceLine()` API for draggable horizontal lines
- Crosshair with OHLCV tooltip

### Component interface

```tsx
interface ChartProps {
  symbol: string;
  onTradeIntent?: (entry: number, takeProfit: number | null, stopLoss: number | null) => void;
}
```

### Trade line behavior

Three draggable price lines are added to the chart when user is on the Trade page:
- **Entry** (blue, solid) — snaps to current price on mount, user drags to desired entry
- **Take Profit** (green, dashed) — starts 3% above entry
- **Stop Loss** (red, dashed) — starts 2% below entry

Each line has a label pill: `"TP $194.00 +2.8%"`, `"SL $185.80 −1.6%"`, `"ENTRY $188.75"`.

When any line is dragged, `onTradeIntent` fires with updated prices, updating the order panel in real-time. The panel shows P/L per share and risk/reward ratio.

Lines are hidden on the Dashboard and Leaderboard pages — chart there is read-only.

### Zoom

`lightweight-charts` handles zoom natively via scroll wheel and pinch. Time scale controls visible candle count. No custom code needed.

### Dark theme

Match TradingView dark: background `#131722`, grid `#1e2235`, text `#d1d4dc`, up `#26a69a`, down `#ef5350`.

---

## 4. Order Types: Take Profit

### Schema change

Add `take_profit` to the `orders.type` enum:

```sql
ALTER TYPE order_type ADD VALUE 'take_profit';
```

Or if enum mutation is constrained: drop and recreate the column with an updated check constraint.

### Execution logic

In `tradingEngine.ts → checkAndExecutePendingOrders`:

```ts
} else if (order.type === 'take_profit') {
  if (order.side === 'sell' && currentPrice >= order.price) shouldExecute = true;
  if (order.side === 'buy'  && currentPrice <= order.price) shouldExecute = true;  // cover short
}
```

### Bracket orders

**Schema addition:** Add `bracket_id uuid` column to the `orders` table (nullable). This links the two contingent legs of a bracket.

When user submits a buy with both TP and SL set, the flow is:
1. Execute the market buy immediately via `executeBuyOrder`. If this fails, abort — do not place legs 2 or 3.
2. Generate a shared `bracketId = uuid()`.
3. Insert a `take_profit` sell order with `bracket_id = bracketId` (status: pending).
4. Insert a `stop_loss` sell order with `bracket_id = bracketId` (status: pending).

**Cancellation on fill:** In `executeOrder`, after a successful fill, if `order.bracket_id` is set, cancel all other pending orders sharing the same `bracket_id`:

```ts
if (order.bracket_id) {
  await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('bracket_id', order.bracket_id)
    .eq('status', 'pending')
    .neq('id', order.id);
}
```

This ensures the sibling leg is cancelled regardless of which fires first. The `bracket_id` column is also added to the `Order` type in `supabase.ts`.

---

## 5. Short Selling

### How it works

"Short" = sell shares you don't own. Profit if price falls, loss if it rises.

User clicks **SHORT** tab in the order panel, picks a symbol and quantity. The system:
1. Validates the user has sufficient collateral: `balance >= quantity × price × 1.5` (150% margin requirement — protects against unlimited loss)
2. Writes a `sell` transaction at current price
3. Sets `portfolios.quantity` to a negative value (or decrements existing short)
4. Deducts the collateral from `virtual_balance` (held, not spent — returned on cover)

### Cover (close short)

When user buys back a shorted stock, if they own negative quantity, the buy reduces the short. P/L = `(short entry price − cover price) × shares`. Collateral is returned plus/minus P/L.

### Schema change

`portfolios.quantity` is already a numeric type — negative values work without migration. Add `portfolios.short_entry_price numeric` column to track the VWAP entry price of the short position.

**VWAP averaging for incremental shorts:** When adding to an existing short position, compute the new average entry price using:
```
newShortEntryPrice = (existingQty × existingEntryPrice + newQty × currentPrice) / (existingQty + newQty)
```
where quantities are treated as positive magnitudes for this calculation.

**Cover mechanics:** On cover (buy back), P/L = `(short_entry_price − cover_price) × coveredQty`. The collateral returned = `coveredQty × short_entry_price × 1.5`, and the net credit to `virtual_balance` = `returned_collateral + P/L`. If the short is fully covered (`quantity` reaches 0), the portfolio row is deleted. Partial covers reduce `quantity` (less negative), do not change `short_entry_price`, and credit only `coveredQty × short_entry_price × 1.5 + P/L` to `virtual_balance` — the remaining collateral for the still-open short portion stays locked.

### UI

On Dashboard holdings list, short positions display in red with a "SHORT" badge and show unrealized P/L. On TradePage, the order panel has LONG / SHORT tabs. Selecting SHORT on a symbol you don't own opens a short; selecting LONG on a short position covers it.

### Collateral warning

If `current_price > short_entry_price × 1.25` (25% adverse move — 83% of collateral consumed), a warning banner appears: "Short position at risk — consider covering." This fires early enough to give the user time to act. At `1.5×` the position is already insolvent; the warning is intentionally an early alert, not a liquidation trigger. No forced liquidation in this version.

---

## 6. Leaderboard

### New page: `src/pages/LeaderboardPage.tsx`

### Data

The leaderboard data is fetched in two queries and computed client-side (prices are simulated, not stored in DB):

1. `SELECT id, display_name, virtual_balance FROM users LIMIT 100` (ordered by `virtual_balance DESC` as a rough pre-sort before equity computation)
2. `SELECT user_id, symbol, quantity, short_entry_price FROM portfolios WHERE user_id IN (<ids>)`

The client then computes `totalEquity` per user using the formula in the equity section below and re-sorts. The leaderboard renders the final sorted list.

**Total equity formula (per user):**
```
equity = virtual_balance
       + Σ (long positions:  quantity × currentPrice)
       + Σ (short positions: |quantity| × short_entry_price × 1.5   // collateral held
                            + (short_entry_price − currentPrice) × |quantity|)  // unrealized P/L
```

This correctly accounts for the fact that `virtual_balance` for a short-seller has been reduced by collateral — their true equity includes that collateral plus/minus unrealized P/L on the short.

**Privacy:** Only `display_name`, `virtual_balance`, and portfolio holdings (symbol, quantity, short_entry_price — no long cost basis) are fetched. Email is never returned.

### Schema change

Add `display_name text` column to `users` table. Collected at signup (new field on `AuthPage`). Defaults to email prefix if not set.

### Layout

- Top stat bar: Your Rank, Your Return %, Portfolio Value
- Table: Rank, Display Name, Top 2 Holdings (symbols only), Total Value, All-time Return %, Today's Change %
- Your row highlighted in blue
- Paginated: 25 per page, load more button

### Navigation

Add "Leaderboard" tab to the nav bar in `App.tsx`. Available to authenticated users only.

---

## 7. Files Changed / Created

| File | Change |
|------|--------|
| `src/services/marketSimulation.ts` | Full rewrite: GBM engine, volatility clustering, dividend yield data |
| `src/components/CandlestickChart.tsx` | Full rewrite: lightweight-charts, draggable lines, dark theme |
| `src/services/tradingEngine.ts` | Add take_profit order type, short selling logic, bracket order helper, dividend credit |
| `src/services/supabase.ts` | Add leaderboard query, display_name to User type, take_profit to Order type, short_entry_price to Portfolio type |
| `src/pages/TradePage.tsx` | Connect chart onTradeIntent to order panel, add SHORT tab |
| `src/pages/DashboardPage.tsx` | Show short positions with badge, dividend transactions |
| `src/pages/AuthPage.tsx` | Add display_name field to signup form |
| `src/pages/LeaderboardPage.tsx` | New file |
| `src/App.tsx` | Add Leaderboard nav, pass currentPage to chart |
| `supabase/migrations/20260325000000_features_v2.sql` | Add display_name, short_entry_price, bracket_id to orders, take_profit order type. Follow Supabase migration naming: `YYYYMMDDHHmmss_<name>.sql`. |
| `package.json` | Add lightweight-charts |
| `CLAUDE.md` | Update commands for bun |

---

## 8. Out of Scope (this iteration)

- Gamification / XP / achievements
- Market events / news feed
- Forced short liquidation
- Options / margin trading
- Real-time multiplayer (leaderboard is eventually-consistent)
