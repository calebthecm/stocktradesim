# TradeVault Redesign — Design Spec
**Date:** 2026-03-25
**Status:** Approved — ready for implementation planning

---

## Vision

TradeVault is **not a stock market simulator**. It is an immersive game that puts the player inside the life of a solo day trader — the pressure of positions going red, the clock ticking on market hours, life events hitting at the worst moments, bills due, a leaderboard showing your rivals pulling ahead. The stress is the product. Players leave understanding what it feels like to sit at that desk.

---

## Design Direction

**Aesthetic:** TradingView dark palette + terminal density + clean sparkline charts on the main page.

| Token | Value |
|-------|-------|
| Background | `#0d1117` |
| Surface | `#161b22` |
| Border | `#21262d` |
| Text primary | `#e6edf3` |
| Text secondary | `#8b949e` |
| Green (up/long) | `#26a69a` |
| Red (down/short) | `#ef5350` |
| Accent blue | `#2962ff` |
| Event amber | `#f59e0b` |
| SIM badge | `#ff6b35` |

Typography: system-sans for UI, monospace for prices and data.

---

## Pages & Components

### Nav (all pages)
- Logo + `SIM` badge in orange
- Dashboard / Trade / Leaderboard tabs (authenticated only)
- Market status pill: `OPEN · 6m 42s` or `CLOSED · opens in 1m 30s` (pulsing dot)
- User display name + Logout

### News Ticker (below nav, all pages)
- 24px strip, scrolling continuously left
- Two feed types interleaved:
  - `⚡ SIM EVENT` (amber badge): generated events from the sim engine, affect stock prices, show affected ticker + direction
  - `SOURCE` (blue): real headlines from NewsData.io (`pub_279fe9a4584f47b9ae21084b806e5b10`), flavor only, no price impact
- Fetch real news on mount, refresh every 5 minutes. Fall back to cached headlines on error.

### Guest Page (unauthenticated)
- Tagline: "A day in the life. Can you handle the pressure?"
- Grid of sparkline stock tiles (live-updating line charts, not candle) with symbol, price, % change
- CTA to login/signup

### Dashboard
- Stats row: Cash · Positions Value · Total P/L · Net Worth + rank
- Holdings table with SHORT badge, P/L per position, click-to-trade
- Market overview: sparkline tiles (6–8 stocks)
- Recent trades panel

### Trade Page — Terminal Layout
Full-height layout, no scrolling:

```
[Nav]
[News ticker]
[Symbol bar: AAPL dropdown | $182.45 +1.21% | 1m 5m 15m 1h 1D 1W 1mo | Entry TP SL R/R display]
[Toolbox | Chart (flex-1)]
[Order bar]
```

**Left toolbox (36px):**
Cursor, Trend Line, Horizontal Line, Ray, Risk Box, SL/TP Bracket, Fibonacci, Text Annotation, Eraser

**Chart:**
- lightweight-charts v5 candlestick (existing)
- Drawing tools layer on top (SVG canvas overlay)
- SL/TP bracket drawn as shaded zones with price labels on right axis
- Draggable entry/TP/SL lines: mousedown on label, mousemove updates price, mouseup commits
- News event popup (amber, bottom-left of chart): fires when sim event affects this symbol

**Bottom order bar (44px, single strip):**
`[LONG|SHORT] [AAPL ▾] | [Qty: 10] [MKT|LMT|STOP] [Price] | [TP] [SL] | $cost · R/R | [BUY AAPL]`
- LONG button green when selected, SHORT red
- Submit button label updates: "BUY AAPL" / "SHORT AAPL" / "COVER AAPL"
- Disabled + dim when market closed

### Leaderboard
Dark table — rank, trader name, equity, return %, sparkline mini-chart of equity curve

---

## News & Events System

### Simulated Event Engine (`src/services/newsEngine.ts`)
Fires on a timer (~every 2–4 sim-minutes, randomized):
- Picks a random stock from the active list
- Picks an event type: earnings beat/miss, product launch, recall, analyst upgrade/downgrade, regulatory action, CEO statement, acquisition rumour
- Generates a short headline string
- Applies a price drift multiplier to `marketSimulation.ts` for that symbol (e.g. +3% over next 30 real seconds)
- Emits the event to a shared `EventEmitter` / pub-sub that the UI subscribes to

Event structure:
```ts
interface SimEvent {
  id: string;
  symbol: string;
  headline: string;
  impact: number;       // signed %, e.g. +0.032
  durationMs: number;   // how long the drift lasts
  timestamp: number;
}
```

**Life pressure events** (future milestone — not in v1):
Separate event type that fires non-market events: "Rent due in 3 days — $1,400", "Car repair: $800". These appear as system notifications overlaid on the UI to create off-market psychological pressure.

### Real News Feed (`src/services/newsService.ts`)
- `GET https://newsdata.io/api/1/latest?apikey=pub_279fe9a4584f47b9ae21084b806e5b10&q=stock+market&language=en&category=business`
- Returns `results[].title` + `results[].source_id`
- Cache in memory, refresh every 5 min
- Headlines shown in ticker with source badge, no price effect

### `useNewsFeed` hook
Returns `{ headlines: TickerItem[] }` — merged and shuffled sim events + real headlines — consumed by the ticker component.

---

## Draggable Price Lines

lightweight-charts doesn't natively support drag. Implementation:

1. Render price lines for Entry, TP, SL using `series.createPriceLine()`
2. Overlay an absolutely-positioned transparent `<div>` over the chart
3. On `mousemove` on the chart, check if cursor Y is within ±8px of any price line's Y coordinate (converted via `chart.priceToCoordinate()`)
4. If hovering: set `cursor: ns-resize`, set active drag target
5. On `mousedown`: start drag; on `mousemove`: `coordToPrice()` → update price state → update price line + input box
6. On `mouseup`: commit. Fires `onTradeIntent(entry, tp, sl)` callback.

---

## Files Changed

| File | Change |
|------|--------|
| `src/App.tsx` | Dark theme shell, news ticker integrated |
| `src/components/NewsTicker.tsx` | **New** — scrolling ticker, merged feeds |
| `src/components/StockCard.tsx` | Replace with sparkline tile (SVG line chart) |
| `src/pages/DashboardPage.tsx` | Dark redesign, sparkline grid, stats row |
| `src/pages/TradePage.tsx` | Terminal layout: symbol bar + toolbox + chart + order bar |
| `src/pages/LeaderboardPage.tsx` | Dark redesign |
| `src/components/CandlestickChart.tsx` | Drawing tools overlay, draggable price lines |
| `src/components/DrawingToolbox.tsx` | **New** — left-side tool palette |
| `src/services/newsEngine.ts` | **New** — sim event generator, price impact |
| `src/services/newsService.ts` | **New** — NewsData.io fetch + cache |
| `src/hooks/useNewsFeed.ts` | **New** — merged ticker feed |
| `src/services/marketSimulation.ts` | Add drift hook for sim events |

---

## Out of Scope (this iteration)

- Life pressure events (rent/car/family — future milestone)
- Real candlestick data from market APIs
- Multiplayer real-time sync
- Mobile layout
