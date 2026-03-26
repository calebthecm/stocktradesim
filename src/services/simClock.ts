// Global synchronized market simulation clock.
// All users compute identical state from wall-clock time — no server needed.
//
// Cycle: 10 real minutes total
//   - 8 min OPEN  at 60× speed → ~8 sim-hours per cycle (≈ one trading day)
//   - 2 min CLOSED (cooldown)
//
// Prices are frozen during CLOSED; trading is disabled.

const CYCLE_MS = 10 * 60 * 1000;  // 10 minutes
const OPEN_MS  =  8 * 60 * 1000;  // 8 minutes open
const SPEED    = 60;               // sim seconds per real second during open

export interface MarketStatus {
  isOpen: boolean;
  phase: 'open' | 'closed';
  secondsRemaining: number;  // until next state change
  simDay: number;            // how many full sim-trading-days have elapsed
}

/**
 * Returns the current simulation timestamp in milliseconds.
 * Advances at 60× during open phases, frozen during closed phases.
 * Deterministic: same wall time → same result for every client.
 */
export function getSimTimeMs(wallMs: number = Date.now()): number {
  const completedCycles = Math.floor(wallMs / CYCLE_MS);
  const cyclePos = wallMs % CYCLE_MS;
  // Time actually spent open in this cycle (capped at OPEN_MS during closed phase)
  const openedSoFar = Math.min(cyclePos, OPEN_MS);
  return (completedCycles * OPEN_MS + openedSoFar) * SPEED;
}

export function isMarketOpen(wallMs: number = Date.now()): boolean {
  return (wallMs % CYCLE_MS) < OPEN_MS;
}

export function getMarketStatus(wallMs: number = Date.now()): MarketStatus {
  const cyclePos = wallMs % CYCLE_MS;
  const isOpen = cyclePos < OPEN_MS;

  const secondsRemaining = isOpen
    ? Math.ceil((OPEN_MS - cyclePos) / 1000)
    : Math.ceil((CYCLE_MS - cyclePos) / 1000);

  // One sim-day = 8 sim-hours = 8 * 3600 * 1000 ms of sim time
  const SIM_DAY_MS = 8 * 3_600_000;
  const simDay = Math.floor(getSimTimeMs(wallMs) / SIM_DAY_MS);

  return { isOpen, phase: isOpen ? 'open' : 'closed', secondsRemaining, simDay };
}

/** Format seconds as mm:ss */
export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
