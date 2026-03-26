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

  // Fire every 15–40 real seconds for a fast-paced feel
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
