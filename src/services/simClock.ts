// Global synchronized market simulation clock.
// All users compute identical state from wall-clock time — no server needed.
//
// Market hours follow US Eastern Time (NYSE schedule):
//   - Mon–Fri, 9:30 AM – 4:00 PM ET → eligible to be open
//   - Outside those hours / weekends → always closed
//
// Within market hours, a 10-minute cycle governs the sim:
//   - 8 min OPEN  (trading enabled)
//   - 2 min CLOSED (brief pause — circuit breaker feel)

const CYCLE_MS = 10 * 60 * 1000;  // 10 minutes
const OPEN_MS  =  8 * 60 * 1000;  // 8 minutes open per cycle

const MARKET_OPEN_MIN  = 9 * 60 + 30;  // 9:30 AM = 570 min into day
const MARKET_CLOSE_MIN = 16 * 60;       // 4:00 PM = 960 min into day

export interface MarketStatus {
  isOpen: boolean;
  phase: 'open' | 'closed';
  secondsRemaining: number;  // until next state change
  simDay: number;            // how many full sim-trading-days have elapsed (wall-time based)
}

// ── Eastern Time helpers ─────────────────────────────────────────────────────

/** Returns the UTC offset for US Eastern Time (EDT = -4h, EST = -5h). */
function easternOffsetMs(wallMs: number): number {
  const year = new Date(wallMs).getUTCFullYear();

  // DST starts: 2nd Sunday of March at 2:00 AM ET (= 7:00 AM UTC in EST)
  const mar1Dow = new Date(Date.UTC(year, 2, 1)).getUTCDay(); // 0=Sun
  const dstStart = Date.UTC(year, 2, 8 + ((7 - mar1Dow) % 7), 7); // 2nd Sun 07:00 UTC

  // DST ends: 1st Sunday of November at 2:00 AM ET (= 6:00 AM UTC in EDT)
  const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const dstEnd = Date.UTC(year, 10, 1 + ((7 - nov1Dow) % 7), 6); // 1st Sun 06:00 UTC

  return wallMs >= dstStart && wallMs < dstEnd
    ? -4 * 3_600_000  // EDT
    : -5 * 3_600_000; // EST
}

/** Returns ET local time components derived from wall clock. */
function easternTime(wallMs: number): { dow: number; minOfDay: number; secOfDay: number } {
  const et = new Date(wallMs + easternOffsetMs(wallMs));
  return {
    dow: et.getUTCDay(),                              // 0=Sun … 6=Sat
    minOfDay: et.getUTCHours() * 60 + et.getUTCMinutes(),
    secOfDay: et.getUTCHours() * 3600 + et.getUTCMinutes() * 60 + et.getUTCSeconds(),
  };
}

/** True if the wall time falls within NYSE trading hours. */
function isNyseHours(wallMs: number): boolean {
  const { dow, minOfDay } = easternTime(wallMs);
  return dow >= 1 && dow <= 5 && minOfDay >= MARKET_OPEN_MIN && minOfDay < MARKET_CLOSE_MIN;
}

/** Milliseconds from wallMs until the next NYSE open (9:30 AM ET Mon–Fri). */
function msUntilNextOpen(wallMs: number): number {
  const offset = easternOffsetMs(wallMs);
  const etMs = wallMs + offset;
  const et = new Date(etMs);

  const curDow = et.getUTCDay();
  const curSec = et.getUTCHours() * 3600 + et.getUTCMinutes() * 60 + et.getUTCSeconds();
  const openSec = MARKET_OPEN_MIN * 60;

  // Days ahead until next eligible weekday at 9:30 AM
  let daysAhead = 0;
  if (curSec >= MARKET_CLOSE_MIN * 60 || curDow === 0 || curDow === 6) {
    daysAhead = 1;
  }
  let nextDow = (curDow + daysAhead) % 7;
  while (nextDow === 0 || nextDow === 6) {
    daysAhead++;
    nextDow = (curDow + daysAhead) % 7;
  }

  const midnightEtMs = etMs - curSec * 1000;
  const nextOpenEtMs = midnightEtMs + daysAhead * 86_400_000 + openSec * 1000;
  return nextOpenEtMs - etMs; // same in wall time (offset cancels)
}

/** Milliseconds from wallMs until NYSE close (4:00 PM ET). */
function msUntilClose(wallMs: number): number {
  const { secOfDay } = easternTime(wallMs);
  return (MARKET_CLOSE_MIN * 60 - secOfDay) * 1000;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isMarketOpen(wallMs: number = Date.now()): boolean {
  return isNyseHours(wallMs) && (wallMs % CYCLE_MS) < OPEN_MS;
}

export function getMarketStatus(wallMs: number = Date.now()): MarketStatus {
  const nyse = isNyseHours(wallMs);
  const cyclePos = wallMs % CYCLE_MS;
  const inOpenPhase = cyclePos < OPEN_MS;
  const open = nyse && inOpenPhase;

  let secondsRemaining: number;

  if (open) {
    // Until end of 8-min open phase OR NYSE close, whichever sooner
    const cycleSecs = Math.ceil((OPEN_MS - cyclePos) / 1000);
    const closeSecs = Math.ceil(msUntilClose(wallMs) / 1000);
    secondsRemaining = Math.min(cycleSecs, closeSecs);
  } else if (nyse) {
    // Inside NYSE hours but in the 2-min pause — until next open phase
    secondsRemaining = Math.ceil((CYCLE_MS - cyclePos) / 1000);
  } else {
    // Outside NYSE hours — until next 9:30 AM ET weekday
    secondsRemaining = Math.ceil(msUntilNextOpen(wallMs) / 1000);
  }

  // simDay: count of complete trading days (each real trading day = 1 sim day)
  const simDay = Math.floor(wallMs / 86_400_000);

  return {
    isOpen: open,
    phase: open ? 'open' : 'closed',
    secondsRemaining: Math.max(0, secondsRemaining),
    simDay,
  };
}

/**
 * Returns the current simulation timestamp in milliseconds.
 * Still used by useSimClock hook for the simDay counter; price/chart code
 * uses real wall time (Date.now()) directly.
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
