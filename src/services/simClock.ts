// Global synchronized market simulation clock.
// All users compute identical state from wall-clock time — no server needed.
//
// The sim runs a 10-minute cycle on real wall-clock time, always:
//   - 8 min OPEN  (trading enabled)
//   - 2 min CLOSED (brief pause — circuit breaker feel)

const CYCLE_MS = 10 * 60 * 1000;  // 10 minutes
const OPEN_MS  =  8 * 60 * 1000;  // 8 minutes open per cycle

export interface MarketStatus {
  isOpen: boolean;
  phase: 'open' | 'closed';
  secondsRemaining: number;  // until next state change
  simDay: number;            // wall-clock day index (for seeding)
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isMarketOpen(wallMs: number = Date.now()): boolean {
  return (wallMs % CYCLE_MS) < OPEN_MS;
}

export function getMarketStatus(wallMs: number = Date.now()): MarketStatus {
  const cyclePos = wallMs % CYCLE_MS;
  const open = cyclePos < OPEN_MS;

  const secondsRemaining = open
    ? Math.ceil((OPEN_MS - cyclePos) / 1000)
    : Math.ceil((CYCLE_MS - cyclePos) / 1000);

  return {
    isOpen: open,
    phase: open ? 'open' : 'closed',
    secondsRemaining: Math.max(0, secondsRemaining),
    simDay: Math.floor(wallMs / 86_400_000),
  };
}

/**
 * Returns the current simulation timestamp in milliseconds (= wall time).
 */
export function getSimTimeMs(wallMs: number = Date.now()): number {
  return wallMs;
}

/** Format seconds as mm:ss or h:mm:ss if ≥ 1 hour. */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds >= 3600) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
