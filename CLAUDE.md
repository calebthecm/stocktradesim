# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start Vite dev server
bun run build        # Production build (tsc + vite build)
bun run lint         # ESLint with flat config
bun run preview      # Preview production build
bun run typecheck    # Type-check without emitting (tsconfig.app.json)
bun test             # Run unit tests (vitest)
bun test --watch     # Watch mode
```

No test framework is configured — Vitest and Playwright are not installed.

## Environment

Requires a `.env` file with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Architecture

Single-page React app (Vite + TypeScript). No router library — `App.tsx` renders one of three pages based on auth state and a `currentPage` string in local state.

**Page flow:** `AuthPage` → login/signup → `DashboardPage` (portfolio overview) or `TradePage` (order entry + chart).

### Service layer (`src/services/`)

| File | Responsibility |
|------|---------------|
| `supabase.ts` | Supabase client singleton + all DB queries (users, portfolios, transactions, orders, watchlist) + auth helpers |
| `marketSimulation.ts` | Deterministic seeded RNG for price generation — no live market API. Produces OHLCV candlestick history and current prices for 12 hardcoded symbols (AAPL, MSFT, etc.) |
| `tradingEngine.ts` | Order execution: validates balance/holdings, writes transactions, updates portfolio cost-basis, processes pending limit/stop orders |

### Database (Supabase + PostgreSQL)

5 tables with RLS enforcing `user_id = auth.uid()` on all operations:

- **users** — auth credentials + `virtual_balance` (default $100k)
- **portfolios** — holdings with `average_cost_basis`, unique on `(user_id, symbol)`
- **transactions** — immutable trade history
- **orders** — pending/filled/cancelled orders; types: `market | limit | stop_loss | stop_loss_limit`
- **watchlist** — user's tracked symbols

Migrations live in `supabase/migrations/`.

### State management

No global state library. Auth state lives in `useAuth.ts` (Supabase auth listener). Real-time prices come from `useStockPrice.ts` polling at 1s intervals. All persistent state flows through Supabase queries.

## Key conventions

- Prices are simulated — `marketSimulation.ts` uses a seeded deterministic function; the same seed always produces the same price history.
- `bcryptjs` is imported in `supabase.ts` for password hashing, but Supabase Auth handles actual authentication — the `users` table is supplemental (balance, profile).
- ESLint uses the flat config format (`eslint.config.js`), not `.eslintrc`.
