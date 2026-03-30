import { useState, useEffect } from 'react';
import { getCurrentPrice, getDayOpen } from '../services/marketSimulation';

export function useStockPrice(symbol: string, refreshIntervalMs: number = 1000) {
  const [price, setPrice] = useState<number>(0);

  useEffect(() => {
    const update = () => setPrice(getCurrentPrice(symbol));
    update();
    const id = setInterval(update, refreshIntervalMs);
    return () => clearInterval(id);
  }, [symbol, refreshIntervalMs]);

  // Day open is deterministic for the calendar day — no state needed
  const dayOpen = getDayOpen(symbol);
  const changePercent = dayOpen > 0 && price > 0 ? ((price - dayOpen) / dayOpen) * 100 : 0;
  const isUp = price >= dayOpen;

  return { price, changePercent, isUp };
}
