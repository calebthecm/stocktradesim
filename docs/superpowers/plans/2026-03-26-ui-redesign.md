# stocksimulator.win UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the entire UI to a dark TradingView-style terminal aesthetic with a scrolling news ticker (real + sim events), sparkline stock tiles, a fully immersive trade page with a left drawing toolbox and draggable SL/TP lines, and a compact bottom order bar — all communicating "you are a day trader, this is real."

**Architecture:** Dark design tokens added to Tailwind config. A sim event engine injects drift overrides into `marketSimulation.ts`. A merged news feed powers a CSS-animated ticker. The trade page is a full-height flex layout: symbol bar → [toolbox | chart with SVG drawing overlay] → order bar. Draggable price lines use lightweight-charts' `priceToCoordinate` + a transparent mousedown overlay.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (arbitrary values + config tokens), lightweight-charts v5, SVG for drawing overlays, NewsData.io REST API.

> **Note:** No test framework is configured in this project. Each task ends with `bun run typecheck` instead of running tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tailwind.config.js` | Modify | Add dark design tokens as named colors |
| `src/services/newsService.ts` | **Create** | NewsData.io fetch + in-memory cache |
| `src/services/newsEngine.ts` | **Create** | Sim event generator + active drift store |
| `src/services/marketSimulation.ts` | Modify | Read drift overrides from newsEngine in `getCurrentPrice` |
| `src/hooks/useNewsFeed.ts` | **Create** | Merges real headlines + sim events into ticker items |
| `src/components/NewsTicker.tsx` | **Create** | CSS-animated scrolling ticker strip |
| `src/App.tsx` | Modify | Dark shell, news ticker below nav, dark guest page |
| `src/components/StockCard.tsx` | Modify | Replace with dark sparkline SVG tile |
| `src/pages/DashboardPage.tsx` | Modify | Dark redesign: stats row, holdings table, sparkline grid |
| `src/pages/LeaderboardPage.tsx` | Modify | Dark redesign |
| `src/components/DrawingToolbox.tsx` | **Create** | Left-side icon tool palette |
| `src/components/CandlestickChart.tsx` | Modify | SVG drawing overlay + draggable TP/SL price lines |
| `src/pages/TradePage.tsx` | Modify | Full-height terminal layout: symbol bar + toolbox + order bar |

---

## Task 1: Design Tokens

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Add dark palette to Tailwind config**

Replace `tailwind.config.js` entirely:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sim: {
          bg:        '#0d1117',
          surface:   '#161b22',
          border:    '#21262d',
          hover:     '#1c2128',
          text:      '#e6edf3',
          muted:     '#8b949e',
          green:     '#26a69a',
          red:       '#ef5350',
          blue:      '#2962ff',
          amber:     '#f59e0b',
          badge:     '#ff6b35',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: add sim dark design tokens to tailwind config"
```

---

## Task 2: News Service

**Files:**
- Create: `src/services/newsService.ts`

- [ ] **Step 1: Create newsService.ts**

```ts
// src/services/newsService.ts
// Fetches real financial headlines from NewsData.io.
// Results are cached in memory and refreshed every 5 minutes.

export interface RealHeadline {
  id: string;
  title: string;
  source: string;
}

const NEWSDATA_URL =
  'https://newsdata.io/api/1/latest?apikey=pub_279fe9a4584f47b9ae21084b806e5b10&q=stock+market&language=en&category=business';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: RealHeadline[] = [];
let cacheTimestamp = 0;

export async function fetchRealHeadlines(): Promise<RealHeadline[]> {
  if (cache.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const res = await fetch(NEWSDATA_URL);
    if (!res.ok) throw new Error(`newsdata ${res.status}`);
    const json = await res.json();
    const results: Array<{ title?: string; source_id?: string }> = json.results ?? [];
    cache = results
      .filter((r) => r.title)
      .slice(0, 20)
      .map((r, i) => ({
        id: `real-${i}-${Date.now()}`,
        title: r.title!,
        source: (r.source_id ?? 'NEWS').toUpperCase().slice(0, 12),
      }));
    cacheTimestamp = Date.now();
    return cache;
  } catch {
    // Return stale cache on error rather than crashing
    return cache;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/newsService.ts
git commit -m "feat: newsService — NewsData.io fetch with 5-min cache"
```

---

## Task 3: Sim Event Engine + Market Drift Hook

**Files:**
- Create: `src/services/newsEngine.ts`
- Modify: `src/services/marketSimulation.ts`

- [ ] **Step 1: Create newsEngine.ts**

```ts
// src/services/newsEngine.ts
// Generates simulated market-moving news events on a randomised timer.
// Active events inject a drift multiplier into marketSimulation.getCurrentPrice().

export interface SimEvent {
  id: string;
  symbol: string;
  headline: string;
  impact: number;      // signed fraction, e.g. +0.032 means +3.2%
  durationMs: number;  // how long the drift boost lasts in wall ms
  timestamp: number;   // wall clock ms when the event fired
}

type SimEventListener = (event: SimEvent) => void;

// Map of symbol → active drift multiplier (expires after durationMs)
const activeDrifts = new Map<string, { multiplier: number; expiresAt: number }>();

const listeners = new Set<SimEventListener>();

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'NFLX', 'AMD', 'BABA', 'JPM', 'COIN'];

const EVENT_TEMPLATES: Array<{ type: string; impact: [number, number]; template: (sym: string) => string }> = [
  {
    type: 'earnings_beat',
    impact: [0.02, 0.05],
    template: (s) => `${s} beats Q4 earnings estimates — analysts raise 12-month price target`,
  },
  {
    type: 'earnings_miss',
    impact: [-0.05, -0.02],
    template: (s) => `${s} misses quarterly revenue forecast — guidance cut for next quarter`,
  },
  {
    type: 'upgrade',
    impact: [0.01, 0.03],
    template: (s) => `Goldman Sachs upgrades ${s} to Buy with raised price target`,
  },
  {
    type: 'downgrade',
    impact: [-0.03, -0.01],
    template: (s) => `Morgan Stanley downgrades ${s} to Underweight amid margin concerns`,
  },
  {
    type: 'product_launch',
    impact: [0.01, 0.04],
    template: (s) => `${s} announces new product line — street reaction positive`,
  },
  {
    type: 'recall',
    impact: [-0.04, -0.015],
    template: (s) => `${s} issues product recall affecting 40,000 units — regulatory probe opened`,
  },
  {
    type: 'ceo_statement',
    impact: [-0.025, 0.025],
    template: (s) => `${s} CEO makes surprise statement on company strategy — market reacts`,
  },
  {
    type: 'acquisition_rumour',
    impact: [0.02, 0.06],
    template: (s) => `Report: ${s} in advanced talks for major acquisition — deal could close Q3`,
  },
  {
    type: 'regulatory',
    impact: [-0.04, -0.01],
    template: (s) => `DOJ opens antitrust investigation into ${s} business practices`,
  },
];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function fireNextEvent(): void {
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const tpl = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
  const impact = rand(tpl.impact[0], tpl.impact[1]);
  const durationMs = rand(20_000, 45_000); // 20–45 real seconds

  const event: SimEvent = {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    symbol: sym,
    headline: tpl.template(sym),
    impact,
    durationMs,
    timestamp: Date.now(),
  };

  // Register drift override for this symbol
  activeDrifts.set(sym, {
    multiplier: 1 + impact,
    expiresAt: Date.now() + durationMs,
  });

  // Notify all UI listeners
  listeners.forEach((fn) => fn(event));

  // Schedule next event: 2–4 sim-minutes ≈ 8–16 real seconds (at 60× speed, 1 sim-min = 1 real sec / 60 * 60 = wait, let me recalculate)
  // The sim runs at 60× during open. 2 sim-minutes = 2 real seconds at 60× speed.
  // Using real wall time: fire every 15–40 real seconds for a fast-paced feel.
  const nextMs = rand(15_000, 40_000);
  setTimeout(fireNextEvent, nextMs);
}

// Start the engine (call once at app init — idempotent guard below)
let started = false;
export function startNewsEngine(): void {
  if (started) return;
  started = true;
  setTimeout(fireNextEvent, rand(5_000, 15_000)); // initial delay
}

/** Returns the active price multiplier for a symbol (1.0 if none). */
export function getActiveDriftMultiplier(symbol: string): number {
  const drift = activeDrifts.get(symbol);
  if (!drift) return 1;
  if (Date.now() > drift.expiresAt) {
    activeDrifts.delete(symbol);
    return 1;
  }
  return drift.multiplier;
}

export function onSimEvent(fn: SimEventListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

- [ ] **Step 2: Hook drift into getCurrentPrice in marketSimulation.ts**

In `src/services/marketSimulation.ts`, add this import at the top (after existing imports):

```ts
import { getActiveDriftMultiplier } from './newsEngine';
```

Then modify `getCurrentPrice` — find this section:

```ts
export function getCurrentPrice(symbol: string, now: Date = new Date(getSimTimeMs())): number {
  const config = getStockInfo(symbol);
  if (!config) return 0;

  const timeframeMs = getTimeframeMs('1d');
  const idx = candleIndexAt(now.getTime(), timeframeMs);
  const history = buildPriceHistory(config, Math.min(idx + 1, 1000), dtForTimeframe(timeframeMs));
  const price = history[history.length - 1];
  return Math.round(price * 100) / 100;
}
```

Replace with:

```ts
export function getCurrentPrice(symbol: string, now: Date = new Date(getSimTimeMs())): number {
  const config = getStockInfo(symbol);
  if (!config) return 0;

  const timeframeMs = getTimeframeMs('1d');
  const idx = candleIndexAt(now.getTime(), timeframeMs);
  const history = buildPriceHistory(config, Math.min(idx + 1, 1000), dtForTimeframe(timeframeMs));
  const base = history[history.length - 1];
  const drifted = base * getActiveDriftMultiplier(symbol.toUpperCase());
  return Math.round(drifted * 100) / 100;
}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/newsEngine.ts src/services/marketSimulation.ts
git commit -m "feat: sim event engine with price drift hook into getCurrentPrice"
```

---

## Task 4: useNewsFeed Hook

**Files:**
- Create: `src/hooks/useNewsFeed.ts`

- [ ] **Step 1: Create useNewsFeed.ts**

```ts
// src/hooks/useNewsFeed.ts
// Merges real NewsData.io headlines with sim events into a single
// stream consumed by NewsTicker. Starts the news engine on mount.

import { useState, useEffect } from 'react';
import { fetchRealHeadlines, RealHeadline } from '../services/newsService';
import { onSimEvent, startNewsEngine, SimEvent } from '../services/newsEngine';

export interface TickerItem {
  id: string;
  kind: 'real' | 'sim';
  text: string;
  source?: string;   // real only: e.g. "REUTERS"
  symbol?: string;   // sim only: e.g. "AAPL"
  impact?: number;   // sim only: signed fraction
}

export function useNewsFeed(): TickerItem[] {
  const [realItems, setRealItems] = useState<TickerItem[]>([]);
  const [simItems, setSimItems] = useState<TickerItem[]>([]);

  // Fetch real headlines on mount and refresh every 5 min
  useEffect(() => {
    startNewsEngine();

    let mounted = true;
    const load = async () => {
      const headlines: RealHeadline[] = await fetchRealHeadlines();
      if (!mounted) return;
      setRealItems(
        headlines.map((h) => ({
          id: h.id,
          kind: 'real',
          text: h.title,
          source: h.source,
        }))
      );
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Listen for sim events — prepend to simItems (keep latest 10)
  useEffect(() => {
    return onSimEvent((event: SimEvent) => {
      const item: TickerItem = {
        id: event.id,
        kind: 'sim',
        text: event.headline,
        symbol: event.symbol,
        impact: event.impact,
      };
      setSimItems((prev) => [item, ...prev].slice(0, 10));
    });
  }, []);

  // Interleave: one sim event between every two real headlines
  const merged: TickerItem[] = [];
  let ri = 0;
  let si = 0;
  while (ri < realItems.length || si < simItems.length) {
    if (ri < realItems.length) merged.push(realItems[ri++]);
    if (ri < realItems.length) merged.push(realItems[ri++]);
    if (si < simItems.length) merged.push(simItems[si++]);
  }

  return merged;
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNewsFeed.ts
git commit -m "feat: useNewsFeed hook — merges NewsData.io + sim events"
```

---

## Task 5: NewsTicker Component

**Files:**
- Create: `src/components/NewsTicker.tsx`

- [ ] **Step 1: Create NewsTicker.tsx**

```tsx
// src/components/NewsTicker.tsx
// A 24px tall strip that scrolls headlines left continuously.
// Sim events are shown with an amber ⚡ badge; real news with a blue source tag.

import { useNewsFeed, TickerItem } from '../hooks/useNewsFeed';

function TickerItemView({ item }: { item: TickerItem }) {
  if (item.kind === 'sim') {
    const dir = (item.impact ?? 0) >= 0 ? '▲' : '▼';
    const color = (item.impact ?? 0) >= 0 ? 'text-sim-green' : 'text-sim-red';
    const pct = Math.abs((item.impact ?? 0) * 100).toFixed(1);
    return (
      <span className="flex items-center gap-1.5 text-[11px]">
        <span className="bg-sim-amber/10 text-sim-amber font-black text-[8px] px-1.5 py-0.5 rounded tracking-widest">
          ⚡ {item.symbol}
        </span>
        <span className="text-sim-text">{item.text}</span>
        <span className={`font-bold ${color}`}>{dir}{pct}%</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className="text-sim-blue font-bold text-[8px] tracking-wide">{item.source}</span>
      <span className="text-sim-muted">{item.text}</span>
    </span>
  );
}

export function NewsTicker() {
  const items = useNewsFeed();

  if (items.length === 0) return null;

  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="h-[26px] bg-sim-surface border-b border-sim-border flex items-center overflow-hidden flex-shrink-0">
      {/* Label */}
      <div className="flex-shrink-0 px-3 h-full flex items-center border-r border-sim-border">
        <span className="text-[8px] font-black tracking-[1.5px] text-sim-muted">
          📡 <span className="text-sim-amber">LIVE</span>
        </span>
      </div>

      {/* Scrolling track */}
      <div className="overflow-hidden flex-1 relative">
        <div
          className="flex items-center gap-8 whitespace-nowrap"
          style={{
            animation: `ticker-scroll ${items.length * 4}s linear infinite`,
          }}
        >
          {doubled.map((item, i) => (
            <span key={`${item.id}-${i}`} className="flex items-center gap-8">
              <TickerItemView item={item} />
              <span className="text-sim-border">·</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/NewsTicker.tsx
git commit -m "feat: NewsTicker component — scrolling live + sim headlines"
```

---

## Task 6: App.tsx Dark Shell

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx with dark shell and news ticker**

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSimClock } from './hooks/useSimClock';
import { DashboardPage } from './pages/DashboardPage';
import { TradePage } from './pages/TradePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginDropdown } from './components/LoginDropdown';
import { NewsTicker } from './components/NewsTicker';
import { StockCard } from './components/StockCard';
import { signOut } from './services/supabase';
import { formatCountdown } from './services/simClock';
import { getAllStocks } from './services/marketSimulation';

type Page = 'dashboard' | 'trade' | 'leaderboard';

function App() {
  const { user, isLoading } = useAuth();
  const market = useSimClock();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (user) setCurrentPage('dashboard');
  }, [user]);

  const handleNavigate = (page: string, params?: Record<string, unknown>) => {
    setCurrentPage(page as Page);
    if (params) setPageParams(params);
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('dashboard');
  };

  const stocks = getAllStocks();

  return (
    <div className="min-h-screen bg-sim-bg text-sim-text flex flex-col">
      {/* ── Nav ── */}
      <nav className="bg-sim-bg border-b border-sim-border h-[44px] flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-[26px] h-[26px] bg-sim-blue rounded-[5px] flex items-center justify-center">
              <span className="text-white font-black text-[11px]">S</span>
            </div>
            <span className="font-black text-[14px] text-sim-text tracking-tight">
              stocksimulator<span className="text-sim-blue">.win</span>
            </span>
            <span className="bg-sim-badge text-white text-[8px] font-black px-1.5 py-0.5 rounded tracking-[1.5px]">
              SIM
            </span>
          </div>

          {/* Tabs — authenticated only */}
          {user && (
            <div className="flex gap-0.5">
              {(['dashboard', 'trade', 'leaderboard'] as Page[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleNavigate(p)}
                  className={`px-2.5 py-1 rounded text-[12px] font-medium capitalize transition-colors ${
                    currentPage === p
                      ? 'bg-sim-blue text-white font-semibold'
                      : 'text-sim-muted hover:text-sim-text'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Market pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-bold tracking-[0.5px] ${
              market.isOpen
                ? 'border-sim-green text-sim-green bg-sim-green/5'
                : 'border-sim-red text-sim-red bg-sim-red/5'
            }`}
          >
            <span
              className={`w-[6px] h-[6px] rounded-full ${
                market.isOpen ? 'bg-sim-green animate-pulse' : 'bg-sim-red'
              }`}
            />
            {market.isOpen
              ? `OPEN · closes ${formatCountdown(market.secondsRemaining)}`
              : `CLOSED · opens ${formatCountdown(market.secondsRemaining)}`}
          </div>

          {isLoading ? (
            <div className="w-6 h-6 rounded-full border-2 border-sim-border border-t-sim-blue animate-spin" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-sim-muted font-medium">
                {user.display_name ?? user.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-[11px] text-sim-muted border border-sim-border px-2 py-1 rounded hover:text-sim-text transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <LoginDropdown />
          )}
        </div>
      </nav>

      {/* ── News Ticker ── */}
      <NewsTicker />

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {user ? (
          <>
            {currentPage === 'dashboard' && (
              <DashboardPage user={user} onNavigate={handleNavigate} />
            )}
            {currentPage === 'trade' && (
              <TradePage
                user={user}
                initialSymbol={(pageParams.symbol as string) || 'AAPL'}
                onBack={() => handleNavigate('dashboard')}
                onOrderExecuted={() => handleNavigate('dashboard')}
                marketOpen={market.isOpen}
              />
            )}
            {currentPage === 'leaderboard' && (
              <LeaderboardPage user={user} />
            )}
          </>
        ) : (
          /* ── Guest Page ── */
          <div className="max-w-7xl mx-auto px-4 py-10">
            <div className="mb-10 text-center">
              <p className="text-sim-muted text-[11px] font-bold tracking-[2px] uppercase mb-3">
                Paper Trading Simulator
              </p>
              <h2 className="text-4xl font-black text-sim-text mb-3 leading-tight">
                A day in the life.<br />
                <span className="text-sim-blue">Can you handle the pressure?</span>
              </h2>
              <p className="text-sim-muted max-w-lg mx-auto leading-relaxed">
                Markets move. Positions go red. The clock ticks. This is what it feels like
                to sit at that desk. Start with $100,000 virtual cash.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {stocks.map((stock) => (
                <StockCard
                  key={stock.symbol}
                  symbol={stock.symbol}
                  name={stock.name}
                  onSelect={() => {}}
                />
              ))}
            </div>

            <div className="mt-10 text-center">
              <p className="text-sim-muted text-sm">
                Sign in to trade, track your portfolio, and compete on the leaderboard.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: dark shell nav + news ticker + immersive guest page"
```

---

## Task 7: StockCard Sparkline Tile

**Files:**
- Modify: `src/components/StockCard.tsx`

The sparkline is built from the last 20 price samples stored in a rolling ref — no extra imports needed.

- [ ] **Step 1: Rewrite StockCard.tsx**

```tsx
import { useState, useEffect, useRef } from 'react';
import { getCurrentPrice } from '../services/marketSimulation';

interface StockCardProps {
  symbol: string;
  name: string;
  onSelect?: (symbol: string) => void;
}

const SAMPLE_COUNT = 30;

export function StockCard({ symbol, name, onSelect }: StockCardProps) {
  const [price, setPrice] = useState(0);
  const [openPrice, setOpenPrice] = useState(0);
  const samplesRef = useRef<number[]>([]);

  useEffect(() => {
    const tick = () => {
      const p = getCurrentPrice(symbol);
      setPrice(p);
      samplesRef.current = [...samplesRef.current, p].slice(-SAMPLE_COUNT);
      if (samplesRef.current.length === 1) setOpenPrice(p);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [symbol]);

  useEffect(() => {
    const p = getCurrentPrice(symbol);
    setOpenPrice(p);
  }, [symbol]);

  const samples = samplesRef.current.length >= 2 ? samplesRef.current : [price, price];
  const minP = Math.min(...samples);
  const maxP = Math.max(...samples);
  const range = maxP - minP || 1;
  const isUp = price >= openPrice;
  const changePct = openPrice > 0 ? ((price - openPrice) / openPrice) * 100 : 0;

  // Build SVG polyline points
  const w = 100;
  const h = 32;
  const points = samples
    .map((p, i) => {
      const x = (i / (samples.length - 1)) * w;
      const y = h - ((p - minP) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');

  const color = isUp ? '#26a69a' : '#ef5350';
  const gradId = `grad-${symbol}`;

  return (
    <div
      onClick={() => onSelect?.(symbol)}
      className={`bg-sim-bg border border-sim-border rounded-md p-2.5 cursor-pointer transition-colors hover:border-sim-blue ${
        onSelect ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[12px] font-black text-sim-text">{symbol}</div>
          <div className="text-[9px] text-sim-muted truncate max-w-[80px]">{name}</div>
        </div>
        <span
          className="text-[10px] font-bold"
          style={{ color }}
        >
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>

      <div className="text-[15px] font-bold font-mono" style={{ color }}>
        ${price.toFixed(2)}
      </div>

      {/* Sparkline */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full mt-1.5"
        style={{ height: 28 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`${points} ${w},${h} 0,${h}`}
          fill={`url(#${gradId})`}
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StockCard.tsx
git commit -m "feat: StockCard — dark sparkline tile with live SVG line chart"
```

---

## Task 8: DashboardPage Dark Redesign

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Rewrite DashboardPage.tsx**

```tsx
import { useState, useEffect } from 'react';
import { User, getPortfolios, getTransactions, Transaction, Portfolio } from '../services/supabase';
import { getCurrentPrice, getAllStocks } from '../services/marketSimulation';
import { StockCard } from '../components/StockCard';

interface DashboardPageProps {
  user: User;
  onNavigate: (page: string, params?: Record<string, unknown>) => void;
}

const STARTING_BALANCE = 100_000;

export function DashboardPage({ user, onNavigate }: DashboardPageProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [portData, txData] = await Promise.all([
        getPortfolios(user.id),
        getTransactions(user.id),
      ]);

      let value = 0;
      for (const pos of portData) {
        value += getCurrentPrice(pos.symbol) * Math.abs(pos.quantity);
      }
      setPortfolios(portData);
      setTransactions(txData);
      setPortfolioValue(value);
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [user]);

  const totalPL = user.virtual_balance + portfolioValue - STARTING_BALANCE;
  const netWorth = user.virtual_balance + portfolioValue;
  const stocks = getAllStocks();

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Available Cash', value: `$${user.virtual_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-sim-blue' },
          { label: 'Positions Value', value: `$${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-sim-green' },
          { label: 'Total P/L', value: `${totalPL >= 0 ? '+' : ''}$${totalPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: totalPL >= 0 ? 'text-sim-green' : 'text-sim-red' },
          { label: 'Net Worth', value: `$${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-sim-text' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-sim-surface border border-sim-border rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1.5">{label}</p>
            <p className={`text-2xl font-black font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* ── Holdings ── */}
        {portfolios.length > 0 && (
          <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-sim-border flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-sim-muted">Your Holdings</span>
              <button
                onClick={() => onNavigate('trade')}
                className="text-[10px] text-sim-blue font-semibold hover:underline"
              >
                Trade →
              </button>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-sim-border">
                  {['Symbol', 'Qty', 'Avg', 'Price', 'P/L'].map((h) => (
                    <th
                      key={h}
                      className={`py-2 px-3 text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted ${h === 'Symbol' ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolios.map((pos) => {
                  const cur = getCurrentPrice(pos.symbol);
                  const pnl = pos.quantity < 0 && pos.short_entry_price
                    ? (pos.short_entry_price - cur) * Math.abs(pos.quantity)
                    : (cur - pos.average_cost_basis) * pos.quantity;
                  const basis = pos.average_cost_basis * Math.abs(pos.quantity);
                  const pct = basis !== 0 ? (pnl / basis) * 100 : 0;

                  return (
                    <tr
                      key={pos.id}
                      className="border-b border-sim-border hover:bg-sim-hover cursor-pointer"
                      onClick={() => onNavigate('trade', { symbol: pos.symbol })}
                    >
                      <td className="py-2.5 px-3 font-black text-sim-text">
                        {pos.symbol}
                        {pos.quantity < 0 && (
                          <span className="ml-1 text-[8px] font-black text-sim-red bg-sim-red/10 px-1 py-0.5 rounded">
                            SHORT
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sim-text">{pos.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-sim-muted">${pos.average_cost_basis.toFixed(2)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${cur >= pos.average_cost_basis ? 'text-sim-green' : 'text-sim-red'}`}>
                        ${cur.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${pnl >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}<br />
                        <span className="text-[9px]">{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Recent Trades ── */}
        <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sim-border">
            <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-sim-muted">Recent Trades</span>
          </div>
          <div className="divide-y divide-sim-border max-h-64 overflow-y-auto">
            {transactions.slice(0, 12).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="font-black text-sim-text text-[12px]">{tx.symbol}</span>
                  <div className="text-[10px] text-sim-muted mt-0.5">
                    {tx.type === 'dividend' && (
                      <span className="text-sim-amber bg-sim-amber/10 px-1 py-0.5 rounded text-[8px] font-black mr-1">DIV</span>
                    )}
                    {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} {tx.quantity} @ ${tx.price.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-[12px] ${tx.type === 'buy' ? 'text-sim-red' : 'text-sim-green'}`}>
                    {tx.type === 'buy' ? '-' : '+'}${tx.total_cost.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-sim-muted">
                    {new Date(tx.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="px-4 py-8 text-center text-sim-muted text-[12px]">No trades yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Market Overview ── */}
      <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-sim-border flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-sim-muted">Market Overview</span>
          <span className="text-[9px] text-sim-muted">SIMULATED · updates every second</span>
        </div>
        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {stocks.map((s) => (
            <StockCard
              key={s.symbol}
              symbol={s.symbol}
              name={s.name}
              onSelect={(sym) => onNavigate('trade', { symbol: sym })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: DashboardPage dark redesign — stats row, holdings, sparkline grid"
```

---

## Task 9: LeaderboardPage Dark Redesign

**Files:**
- Modify: `src/pages/LeaderboardPage.tsx`

- [ ] **Step 1: Rewrite LeaderboardPage.tsx**

```tsx
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
      const abs = Math.abs(pos.quantity);
      const entry_ = pos.short_entry_price ?? price;
      equity += abs * entry_ * 1.5 + (entry_ - price) * abs;
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
      const ranked = data
        .map((e) => ({ ...e, equity: computeEquity(e) }))
        .sort((a, b) => b.equity - a.equity)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      setEntries(ranked);
      setIsLoading(false);
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const me = entries.find((e) => e.id === user.id);
  const myRet = me ? ((me.equity - STARTING_BALANCE) / STARTING_BALANCE) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <p className="text-[10px] font-black uppercase tracking-[1.5px] text-sim-muted mb-4">Leaderboard</p>

      {/* My stats */}
      {me && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-sim-surface border border-sim-border rounded-lg p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1">Your Rank</p>
            <p className="text-3xl font-black text-sim-blue">#{me.rank}</p>
            <p className="text-[10px] text-sim-muted">of {entries.length} traders</p>
          </div>
          <div className={`bg-sim-surface border rounded-lg p-4 ${myRet >= 0 ? 'border-sim-green' : 'border-sim-red'}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1">Your Return</p>
            <p className={`text-3xl font-black ${myRet >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
              {myRet >= 0 ? '+' : ''}{myRet.toFixed(2)}%
            </p>
          </div>
          <div className="bg-sim-surface border border-sim-border rounded-lg p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1">Portfolio Value</p>
            <p className="text-3xl font-black text-sim-text">
              ${me.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-sim-border border-t-sim-blue animate-spin" />
        </div>
      ) : (
        <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[40px_1fr_130px_90px] px-4 py-2 border-b border-sim-border bg-sim-bg">
            {['#', 'Trader', 'Value', 'Return'].map((h, i) => (
              <span
                key={h}
                className={`text-[9px] font-black uppercase tracking-[0.8px] text-sim-muted ${i > 1 ? 'text-right' : ''}`}
              >
                {h}
              </span>
            ))}
          </div>

          {entries.map((entry) => {
            const ret = ((entry.equity - STARTING_BALANCE) / STARTING_BALANCE) * 100;
            const isMe = entry.id === user.id;
            const rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
            return (
              <div
                key={entry.id}
                className={`grid grid-cols-[40px_1fr_130px_90px] px-4 py-3 border-b border-sim-border items-center ${
                  isMe ? 'bg-sim-blue/5' : 'hover:bg-sim-hover'
                }`}
              >
                <span className={`text-[12px] font-black ${
                  entry.rank === 1 ? 'text-yellow-400'
                  : entry.rank === 2 ? 'text-sim-muted'
                  : entry.rank === 3 ? 'text-sim-amber'
                  : isMe ? 'text-sim-blue' : 'text-sim-muted'
                }`}>
                  {rankIcon ?? entry.rank}
                </span>
                <div>
                  <span className={`text-[12px] font-bold ${isMe ? 'text-sim-blue' : 'text-sim-text'}`}>
                    {entry.display_name ?? 'Anonymous'}{isMe ? ' (you)' : ''}
                  </span>
                  <div className="text-[9px] text-sim-muted">
                    {entry.portfolios.slice(0, 3).map((p) => p.symbol).join(' · ')}
                  </div>
                </div>
                <span className="text-right font-mono font-bold text-[12px] text-sim-text">
                  ${entry.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-right font-mono font-bold text-[12px] ${ret >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
                  {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-sim-muted mt-3 text-center">Refreshes every 30 seconds</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LeaderboardPage.tsx
git commit -m "feat: LeaderboardPage dark redesign"
```

---

## Task 10: DrawingToolbox Component

**Files:**
- Create: `src/components/DrawingToolbox.tsx`

- [ ] **Step 1: Create DrawingToolbox.tsx**

```tsx
// src/components/DrawingToolbox.tsx
// Left-side 36px icon palette for the trade page chart.
// Emits the active tool via onToolChange.

export type DrawingTool =
  | 'cursor'
  | 'trendline'
  | 'hline'
  | 'ray'
  | 'riskbox'
  | 'bracket'
  | 'fibonacci'
  | 'text'
  | 'eraser';

interface DrawingToolboxProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
}

interface ToolDef {
  id: DrawingTool;
  label: string;
  icon: React.ReactNode;
}

function CursorIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M3 2l10 5.5-4.5 1L6 13 3 2z" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="2" y1="13" x2="14" y2="3" />
      <circle cx="2" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="3" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function HLineIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="1" y1="8" x2="15" y2="8" />
      <circle cx="1" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function RayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="2" y1="12" x2="15" y2="4" />
      <circle cx="2" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <polyline points="13,3 15,4 13,6" fill="none" />
    </svg>
  );
}
function RiskBoxIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="2" y="4" width="12" height="8" rx="1" />
    </svg>
  );
}
function BracketIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="2" y1="5" x2="14" y2="5" stroke="#26a69a" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="#2962ff" strokeWidth="2" />
      <line x1="2" y1="11" x2="14" y2="11" stroke="#ef5350" />
      <line x1="2" y1="5" x2="2" y2="11" stroke="currentColor" />
      <line x1="14" y1="5" x2="14" y2="11" stroke="currentColor" />
    </svg>
  );
}
function FibIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-3.5 h-3.5">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="2" y1="6" x2="14" y2="6" opacity="0.7" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="11" x2="14" y2="11" opacity="0.7" />
      <line x1="2" y1="13" x2="14" y2="13" />
      <line x1="3" y1="3" x2="3" y2="13" strokeDasharray="1 1" />
    </svg>
  );
}
function TextIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <text x="3" y="13" fontSize="11" fontWeight="900" fontFamily="serif">T</text>
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M3 13l3-3 6-6 3 3-6 6H3z" />
      <line x1="3" y1="13" x2="14" y2="13" />
    </svg>
  );
}

const TOOL_GROUPS: ToolDef[][] = [
  [{ id: 'cursor', label: 'Select', icon: <CursorIcon /> }],
  [
    { id: 'trendline', label: 'Trend Line', icon: <TrendIcon /> },
    { id: 'hline', label: 'Horizontal Line', icon: <HLineIcon /> },
    { id: 'ray', label: 'Ray', icon: <RayIcon /> },
  ],
  [
    { id: 'riskbox', label: 'Risk Box', icon: <RiskBoxIcon /> },
    { id: 'bracket', label: 'SL/TP Bracket', icon: <BracketIcon /> },
  ],
  [
    { id: 'fibonacci', label: 'Fibonacci', icon: <FibIcon /> },
    { id: 'text', label: 'Text', icon: <TextIcon /> },
  ],
  [{ id: 'eraser', label: 'Erase Drawing', icon: <EraserIcon /> }],
];

export function DrawingToolbox({ activeTool, onToolChange }: DrawingToolboxProps) {
  return (
    <div className="w-9 bg-sim-surface border-r border-sim-border flex flex-col items-center py-2 gap-0.5 flex-shrink-0">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-0.5 w-full">
          {gi > 0 && <div className="w-5 h-px bg-sim-border my-1" />}
          {group.map((tool) => (
            <button
              key={tool.id}
              title={tool.label}
              onClick={() => onToolChange(tool.id)}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors border ${
                activeTool === tool.id
                  ? 'bg-sim-blue/20 text-sim-blue border-sim-blue/40'
                  : 'text-sim-muted hover:bg-sim-hover hover:text-sim-text border-transparent'
              }`}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DrawingToolbox.tsx
git commit -m "feat: DrawingToolbox — left-side SVG icon tool palette"
```

---

## Task 11: CandlestickChart — Drawing Overlay + Draggable Lines

**Files:**
- Modify: `src/components/CandlestickChart.tsx`

This task adds:
1. A transparent `<div>` overlay on the chart that intercepts mouse events
2. Draggable Entry / TP / SL price lines (hover within ±8px → ns-resize cursor → drag → update)
3. SVG drawing layer for trendlines and horizontal lines drawn by the toolbox tools
4. News event popup (listens to `onSimEvent`)

- [ ] **Step 1: Read current CandlestickChart.tsx fully**

```bash
# Just read the file before editing — required by the project rules
```

Read `src/components/CandlestickChart.tsx` completely before editing.

- [ ] **Step 2: Rewrite CandlestickChart.tsx**

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  CandlestickSeries,
  LineStyle,
  IPriceLine,
  UTCTimestamp,
  Time,
} from 'lightweight-charts';
import { getCandleHistory, getTimeframeMs } from '../services/marketSimulation';
import { getSimTimeMs } from '../services/simClock';
import { onSimEvent, SimEvent } from '../services/newsEngine';
import { subHours, subWeeks, subMonths } from 'date-fns';
import { DrawingTool } from './DrawingToolbox';

interface CandlestickChartProps {
  symbol: string;
  activeTool: DrawingTool;
  onTradeIntent?: (entry: number, takeProfit: number | null, stopLoss: number | null) => void;
}

interface DrawnLine {
  id: string;
  kind: 'trendline' | 'hline';
  // trendline: two chart-pixel points (x in %, y in px from top)
  x1Pct: number; y1: number;
  x2Pct: number; y2: number;
  // hline: single y
  color: string;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'] as const;

function getStartTime(tf: string): Date {
  const now = new Date(getSimTimeMs());
  switch (tf) {
    case '1m': case '5m': case '15m': case '1h': return subHours(now, 24);
    case '4h': case '1d': return subWeeks(now, 4);
    case '1w': return subMonths(now, 12);
    case '1mo': return subMonths(now, 36);
    default: return subWeeks(now, 4);
  }
}

const DRAG_HIT_PX = 8; // px tolerance for grabbing a price line

export function CandlestickChart({ symbol, activeTool, onTradeIntent }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const [timeframe, setTimeframe] = useState('1d');

  const entryLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);

  const [entryPrice, setEntryPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [slPrice, setSlPrice] = useState<number | null>(null);

  // Drag state
  const dragTarget = useRef<'entry' | 'tp' | 'sl' | null>(null);

  // SVG drawing state
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // News event popup
  const [activeEvent, setActiveEvent] = useState<SimEvent | null>(null);

  // Listen for sim events on this symbol
  useEffect(() => {
    return onSimEvent((evt) => {
      if (evt.symbol === symbol) {
        setActiveEvent(evt);
        setTimeout(() => setActiveEvent(null), 8000);
      }
    });
  }, [symbol]);

  // Mount chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#21262d' },
      timeScale: { borderColor: '#21262d', timeVisible: true },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 600 });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candle data
  useEffect(() => {
    if (!seriesRef.current) return;
    const tfMs = getTimeframeMs(timeframe);
    const start = getStartTime(timeframe);
    const end = new Date(getSimTimeMs());
    const candles = getCandleHistory(symbol, start, end, tfMs);
    const data: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    seriesRef.current.setData(data);

    // Set initial entry price
    if (data.length > 0) {
      const last = data[data.length - 1].close;
      setEntryPrice(last);
    }
  }, [symbol, timeframe]);

  // Manage entry/TP/SL price lines
  useEffect(() => {
    if (!seriesRef.current || entryPrice === 0) return;
    entryLineRef.current?.remove?.();
    entryLineRef.current = seriesRef.current.createPriceLine({
      price: entryPrice,
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'ENTRY',
    });
  }, [entryPrice]);

  useEffect(() => {
    if (!seriesRef.current) return;
    tpLineRef.current?.remove?.();
    if (tpPrice !== null) {
      tpLineRef.current = seriesRef.current.createPriceLine({
        price: tpPrice,
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP',
      });
    }
  }, [tpPrice]);

  useEffect(() => {
    if (!seriesRef.current) return;
    slLineRef.current?.remove?.();
    if (slPrice !== null) {
      slLineRef.current = seriesRef.current.createPriceLine({
        price: slPrice,
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'SL',
      });
    }
  }, [slPrice]);

  // Helper: convert Y pixel → price
  const yToPrice = useCallback((clientY: number): number => {
    if (!chartRef.current || !overlayRef.current) return 0;
    const rect = overlayRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    return chartRef.current.priceScale('right').coordinateToPrice(y) ?? 0;
  }, []);

  // Helper: price → Y pixel (relative to overlay)
  const priceToY = useCallback((price: number): number => {
    if (!chartRef.current || !overlayRef.current) return -1000;
    const rect = overlayRef.current.getBoundingClientRect();
    const coord = chartRef.current.priceScale('right').priceToCoordinate(price);
    return coord !== null ? coord : -1000;
  }, []);

  // Detect which drag target is near cursor
  const getDragTarget = useCallback((clientY: number): typeof dragTarget.current => {
    const entryY = priceToY(entryPrice);
    const tpY = tpPrice !== null ? priceToY(tpPrice) : -1000;
    const slY = slPrice !== null ? priceToY(slPrice) : -1000;
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    if (Math.abs(y - tpY) <= DRAG_HIT_PX) return 'tp';
    if (Math.abs(y - slY) <= DRAG_HIT_PX) return 'sl';
    if (Math.abs(y - entryY) <= DRAG_HIT_PX) return 'entry';
    return null;
  }, [entryPrice, tpPrice, slPrice, priceToY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'cursor' || activeTool === 'bracket') {
      // Drag logic
      if (dragTarget.current) {
        const p = yToPrice(e.clientY);
        if (dragTarget.current === 'entry') setEntryPrice(Math.round(p * 100) / 100);
        if (dragTarget.current === 'tp') setTpPrice(Math.round(p * 100) / 100);
        if (dragTarget.current === 'sl') setSlPrice(Math.round(p * 100) / 100);
        return;
      }
      // Hover cursor
      const hit = getDragTarget(e.clientY);
      if (overlayRef.current) {
        overlayRef.current.style.cursor = hit ? 'ns-resize' : 'default';
      }
    } else if (activeTool === 'trendline' && drawStartRef.current) {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      setDrawingPreview({
        x1: drawStartRef.current.x,
        y1: drawStartRef.current.y,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top,
      });
    } else if (activeTool === 'hline') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      setDrawingPreview({ x1: 0, y1: y, x2: rect.width, y2: y });
    }
  }, [activeTool, getDragTarget, yToPrice]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'cursor' || activeTool === 'bracket') {
      dragTarget.current = getDragTarget(e.clientY);
    } else if (activeTool === 'trendline') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      drawStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    } else if (activeTool === 'hline') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = yToPrice(e.clientY);
      const newLine: DrawnLine = {
        id: `hline-${Date.now()}`,
        kind: 'hline',
        x1Pct: 0, y1: y, x2Pct: 100, y2: y,
        color: '#f59e0b',
      };
      setDrawnLines((prev) => [...prev, newLine]);
      setDrawingPreview(null);
      _ = price; // used for future label display
    } else if (activeTool === 'eraser') {
      setDrawnLines([]);
    }
  }, [activeTool, getDragTarget, yToPrice]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragTarget.current) {
      // Commit — fire onTradeIntent
      onTradeIntent?.(entryPrice, tpPrice, slPrice);
      dragTarget.current = null;
    } else if (activeTool === 'trendline' && drawStartRef.current) {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;
      const newLine: DrawnLine = {
        id: `tl-${Date.now()}`,
        kind: 'trendline',
        x1Pct: (drawStartRef.current.x / rect.width) * 100,
        y1: drawStartRef.current.y,
        x2Pct: (x2 / rect.width) * 100,
        y2,
        color: '#f59e0b',
      };
      setDrawnLines((prev) => [...prev, newLine]);
      drawStartRef.current = null;
      setDrawingPreview(null);
    }
  }, [activeTool, entryPrice, tpPrice, slPrice, onTradeIntent]);

  // Propagate price changes up
  useEffect(() => {
    onTradeIntent?.(entryPrice, tpPrice, slPrice);
  }, [entryPrice, tpPrice, slPrice, onTradeIntent]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Timeframe buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-sim-border bg-sim-surface flex-shrink-0">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
              timeframe === tf
                ? 'bg-sim-blue text-white'
                : 'text-sim-muted hover:text-sim-text'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart + overlay */}
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Transparent mouse overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ zIndex: 10 }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { dragTarget.current = null; setDrawingPreview(null); }}
        >
          {/* SVG drawing layer */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 11 }}>
            {drawnLines.map((line) => (
              line.kind === 'trendline' ? (
                <line
                  key={line.id}
                  x1={`${line.x1Pct}%`} y1={line.y1}
                  x2={`${line.x2Pct}%`} y2={line.y2}
                  stroke={line.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85"
                />
              ) : (
                <line
                  key={line.id}
                  x1="0%" y1={line.y1} x2="100%" y2={line.y2}
                  stroke={line.color} strokeWidth="1" strokeDasharray="6 4" opacity="0.7"
                />
              )
            ))}
            {/* Drawing preview */}
            {drawingPreview && (
              <line
                x1={drawingPreview.x1} y1={drawingPreview.y1}
                x2={drawingPreview.x2} y2={drawingPreview.y2}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"
              />
            )}
          </svg>
        </div>

        {/* News event popup */}
        {activeEvent && (
          <div
            className="absolute bottom-4 left-4 bg-sim-surface border border-sim-amber border-l-[3px] rounded-r-md px-3 py-2 max-w-xs z-20"
            style={{ borderLeftColor: '#f59e0b' }}
          >
            <div className="text-[8px] font-black text-sim-amber uppercase tracking-[1px] mb-1">
              ⚡ Sim Event · {activeEvent.symbol}
            </div>
            <div className="text-[11px] text-sim-text leading-snug">{activeEvent.headline}</div>
            <div className={`text-[9px] font-bold mt-1 ${activeEvent.impact >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
              {activeEvent.impact >= 0 ? '▲' : '▼'} {Math.abs(activeEvent.impact * 100).toFixed(1)}% price impact
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="absolute top-2 right-2 bg-sim-bg/80 border border-sim-border rounded px-2 py-1 text-[9px] text-sim-muted z-20">
          ↕ Drag TP / SL lines · {activeTool !== 'cursor' ? activeTool : 'click to draw'}
        </div>
      </div>
    </div>
  );
}
```

> **Note:** The line `_ = price;` in the hline handler is a lint placeholder. Remove it and handle the price label in a follow-up if needed — or just remove the line entirely.

- [ ] **Step 3: Fix the `_ = price` placeholder**

In the `handleMouseDown` callback, remove the `_ = price;` line entirely (it was a note placeholder in this plan). The price is not needed for the basic hline drawing.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```
Expected: no errors. If `_ = price` causes an error, remove that line.

- [ ] **Step 5: Commit**

```bash
git add src/components/CandlestickChart.tsx
git commit -m "feat: CandlestickChart — SVG drawing overlay, draggable TP/SL, news event popup"
```

---

## Task 12: TradePage Terminal Layout

**Files:**
- Modify: `src/pages/TradePage.tsx`

Full-height flex layout: symbol bar → [toolbox | chart] → order bar. No scrolling.

- [ ] **Step 1: Read current TradePage.tsx fully before editing**

Read `src/pages/TradePage.tsx` completely before editing.

- [ ] **Step 2: Rewrite TradePage.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { User, getOrders, getPortfolios, Order } from '../services/supabase';
import { getCurrentPrice, getAllStocks } from '../services/marketSimulation';
import { placeBracketOrder, executeShortOrder, executeCoverOrder, TradeResult } from '../services/tradingEngine';
import { CandlestickChart } from '../components/CandlestickChart';
import { DrawingToolbox, DrawingTool } from '../components/DrawingToolbox';
import { useStockPrice } from '../hooks/useStockPrice';

interface TradePageProps {
  user: User;
  initialSymbol?: string;
  onBack: () => void;
  onOrderExecuted?: () => void;
  marketOpen?: boolean;
}

type OrderType = 'MKT' | 'LMT' | 'STOP';

export function TradePage({
  user,
  initialSymbol = 'AAPL',
  onBack,
  onOrderExecuted,
  marketOpen = true,
}: TradePageProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [tradeMode, setTradeMode] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<OrderType>('MKT');
  const [quantity, setQuantity] = useState('10');
  const [limitPrice, setLimitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [slPrice, setSlPrice] = useState<number | null>(null);
  const [entryPrice, setEntryPrice] = useState(0);
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shortWarning, setShortWarning] = useState(false);

  const { price } = useStockPrice(symbol, 1000);
  const stocks = getAllStocks();

  // Sync entry price with live price when not using limit order
  useEffect(() => {
    if (orderType === 'MKT') setEntryPrice(price);
  }, [price, orderType]);

  useEffect(() => {
    const load = async () => {
      const all = await getOrders(user.id);
      setOrders(all.filter((o) => o.status === 'pending'));
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    const check = async () => {
      if (tradeMode !== 'short') return;
      const ports = await getPortfolios(user.id);
      const pos = ports.find((p) => p.symbol === symbol);
      if (pos && pos.quantity < 0 && pos.short_entry_price) {
        setShortWarning(getCurrentPrice(symbol) > pos.short_entry_price * 1.25);
      } else {
        setShortWarning(false);
      }
    };
    check();
  }, [tradeMode, symbol, user]);

  const handleTradeIntent = useCallback((entry: number, tp: number | null, sl: number | null) => {
    setEntryPrice(entry);
    setTpPrice(tp);
    setSlPrice(sl);
    if (orderType === 'LMT' || orderType === 'STOP') setLimitPrice(String(entry));
  }, [orderType]);

  const rrRatio = tpPrice && slPrice && entryPrice
    ? Math.abs(tpPrice - entryPrice) / Math.abs(slPrice - entryPrice)
    : null;

  const qty = parseInt(quantity, 10) || 0;
  const execPrice = orderType === 'MKT' ? price : (parseFloat(limitPrice) || price);
  const totalCost = qty * execPrice;

  const submitLabel = () => {
    const ports_exist = orders.some((o) => o.symbol === symbol);
    if (tradeMode === 'short') return `SHORT ${symbol}`;
    if (ports_exist && tradeMode === 'long') return `BUY ${symbol}`;
    return `BUY ${symbol}`;
  };

  const handleSubmit = async () => {
    if (!marketOpen || isSubmitting || qty <= 0) return;
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    let result: TradeResult;
    if (tradeMode === 'short') {
      const ports = await getPortfolios(user.id);
      const pos = ports.find((p) => p.symbol === symbol);
      if (pos && pos.quantity < 0) {
        result = await executeCoverOrder(user, symbol, qty, price);
      } else {
        result = await executeShortOrder(user, symbol, qty, price);
      }
    } else {
      result = await placeBracketOrder(
        user, symbol, tradeMode, qty, execPrice,
        tpPrice ?? undefined, slPrice ?? undefined
      );
    }

    if (result.success) {
      setSuccess(`Order executed: ${result.message ?? 'done'}`);
      setTimeout(() => { setSuccess(''); onOrderExecuted?.(); }, 1500);
    } else {
      setError(result.error ?? 'Order failed');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-70px)]"> {/* 44px nav + 26px ticker */}

      {/* ── Symbol / Timeframe Bar ── */}
      <div className="bg-sim-surface border-b border-sim-border h-10 flex items-center px-3 gap-3 flex-shrink-0">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-sim-bg border border-sim-border text-sim-text font-black text-[13px] rounded px-2 py-1 outline-none"
        >
          {stocks.map((s) => (
            <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
          ))}
        </select>

        <div className="w-px h-5 bg-sim-border" />

        <span className="text-[18px] font-black font-mono text-sim-green">${price.toFixed(2)}</span>
        <span className="text-[11px] text-sim-muted">{symbol}</span>

        <div className="w-px h-5 bg-sim-border" />

        {/* R/R display */}
        <div className="ml-auto flex items-center gap-4 text-[10px]">
          {entryPrice > 0 && (
            <span className="text-sim-muted">
              Entry <span className="font-mono font-bold text-sim-blue">${entryPrice.toFixed(2)}</span>
            </span>
          )}
          {tpPrice && (
            <span className="text-sim-muted">
              TP <span className="font-mono font-bold text-sim-green">${tpPrice.toFixed(2)}</span>
            </span>
          )}
          {slPrice && (
            <span className="text-sim-muted">
              SL <span className="font-mono font-bold text-sim-red">${slPrice.toFixed(2)}</span>
            </span>
          )}
          {rrRatio && (
            <span className="text-sim-muted">
              R/R <span className="font-mono font-bold text-sim-amber">1:{rrRatio.toFixed(1)}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Toolbox + Chart ── */}
      <div className="flex flex-1 overflow-hidden">
        <DrawingToolbox activeTool={activeTool} onToolChange={setActiveTool} />
        <div className="flex-1 overflow-hidden">
          <CandlestickChart
            symbol={symbol}
            activeTool={activeTool}
            onTradeIntent={handleTradeIntent}
          />
        </div>
      </div>

      {/* ── Order Bar ── */}
      <div className={`border-t border-sim-border h-11 flex items-center px-3 gap-3 flex-shrink-0 ${
        marketOpen ? 'bg-sim-surface' : 'bg-sim-surface/60'
      }`}>

        {!marketOpen && (
          <span className="text-[9px] font-black text-sim-red border border-sim-red/30 bg-sim-red/5 px-2 py-1 rounded tracking-[0.5px]">
            MARKET CLOSED
          </span>
        )}

        {/* Long / Short */}
        <div className="flex rounded overflow-hidden border border-sim-border">
          <button
            onClick={() => setTradeMode('long')}
            className={`px-3 py-1 text-[11px] font-black transition-colors ${
              tradeMode === 'long' ? 'bg-sim-green text-sim-bg' : 'text-sim-muted hover:text-sim-text'
            }`}
          >
            LONG
          </button>
          <button
            onClick={() => setTradeMode('short')}
            className={`px-3 py-1 text-[11px] font-black transition-colors ${
              tradeMode === 'short' ? 'bg-sim-red text-white' : 'text-sim-muted hover:text-sim-text'
            }`}
          >
            SHORT
          </button>
        </div>

        <div className="w-px h-5 bg-sim-border" />

        {/* Qty */}
        <div className="flex flex-col">
          <span className="text-[8px] text-sim-muted uppercase tracking-[0.5px]">Qty</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-16 bg-sim-bg border border-sim-border text-sim-text font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-blue"
          />
        </div>

        {/* Order type */}
        <div className="flex rounded overflow-hidden border border-sim-border">
          {(['MKT', 'LMT', 'STOP'] as OrderType[]).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                orderType === t ? 'bg-sim-hover text-sim-text' : 'text-sim-muted hover:text-sim-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Price (LMT/STOP only) */}
        {orderType !== 'MKT' && (
          <div className="flex flex-col">
            <span className="text-[8px] text-sim-muted uppercase tracking-[0.5px]">Price</span>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="w-24 bg-sim-bg border border-sim-border text-sim-text font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-blue"
            />
          </div>
        )}

        <div className="w-px h-5 bg-sim-border" />

        {/* TP */}
        <div className="flex flex-col">
          <span className="text-[8px] text-sim-green uppercase tracking-[0.5px]">Take Profit</span>
          <input
            type="number"
            value={tpPrice ?? ''}
            onChange={(e) => setTpPrice(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="—"
            className="w-24 bg-sim-bg border border-sim-green/20 text-sim-green font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-green"
          />
        </div>

        {/* SL */}
        <div className="flex flex-col">
          <span className="text-[8px] text-sim-red uppercase tracking-[0.5px]">Stop Loss</span>
          <input
            type="number"
            value={slPrice ?? ''}
            onChange={(e) => setSlPrice(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="—"
            className="w-24 bg-sim-bg border border-sim-red/20 text-sim-red font-mono font-bold text-[12px] rounded px-2 py-0.5 outline-none focus:border-sim-red"
          />
        </div>

        <div className="w-px h-5 bg-sim-border" />

        {/* Cost + R/R preview */}
        <div className="flex flex-col text-[10px]">
          <span className="font-mono font-bold text-sim-text">${totalCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          {rrRatio && <span className="text-sim-amber font-bold">R/R 1:{rrRatio.toFixed(1)}</span>}
        </div>

        {/* Error / success */}
        {error && <span className="text-sim-red text-[10px] max-w-[160px] truncate">{error}</span>}
        {success && <span className="text-sim-green text-[10px] max-w-[160px] truncate">{success}</span>}
        {shortWarning && !error && (
          <span className="text-sim-amber text-[10px]">⚠ Short up 25%+</span>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!marketOpen || isSubmitting || qty <= 0}
          className={`ml-auto px-4 py-1.5 rounded font-black text-[12px] tracking-[0.5px] transition-colors ${
            marketOpen && qty > 0 && !isSubmitting
              ? tradeMode === 'long'
                ? 'bg-sim-green text-sim-bg hover:opacity-90'
                : 'bg-sim-red text-white hover:opacity-90'
              : 'bg-sim-hover text-sim-muted cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '...' : submitLabel()}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```
Expected: no errors. Common issue: `onTradeIntent` prop name change in `CandlestickChart` — it now accepts `activeTool` as well. If errors, check prop interface alignment.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TradePage.tsx
git commit -m "feat: TradePage terminal layout — symbol bar, drawing toolbox, compact order bar"
```

---

## Self-Review

**Spec coverage:**
- ✅ Dark TradingView palette via Tailwind tokens
- ✅ News ticker — real (NewsData.io) + sim events interleaved
- ✅ Sim event engine with price drift via `getActiveDriftMultiplier`
- ✅ Guest page — dark, immersive tagline
- ✅ Sparkline StockCard (SVG line chart)
- ✅ Dashboard — stats row, holdings, sparkline grid, recent trades
- ✅ Leaderboard — dark redesign
- ✅ Left drawing toolbox — cursor/trendline/hline/ray/riskbox/bracket/fibonacci/text/eraser
- ✅ CandlestickChart — draggable TP/SL via overlay, SVG drawing layer, news popup
- ✅ TradePage — full-height terminal layout, compact order bar
- ✅ `SIM` badge everywhere
- ✅ Market closed → order bar disabled

**Type consistency check:**
- `DrawingTool` exported from `DrawingToolbox.tsx`, imported in both `CandlestickChart.tsx` and `TradePage.tsx` ✅
- `SimEvent` exported from `newsEngine.ts`, imported in `CandlestickChart.tsx` and `useNewsFeed.ts` ✅
- `TickerItem` exported from `useNewsFeed.ts`, used in `NewsTicker.tsx` ✅
- `CandlestickChart` props: `symbol`, `activeTool`, `onTradeIntent` — matches usage in `TradePage.tsx` ✅

**Placeholder scan:** None found.
