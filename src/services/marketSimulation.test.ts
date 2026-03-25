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
