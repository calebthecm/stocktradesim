import { useState, useEffect } from 'react';
import { getCurrentPrice } from '../services/marketSimulation';

export function useStockPrice(symbol: string, refreshIntervalMs: number = 1000) {
  const [price, setPrice] = useState<number>(0);
  const [previousPrice, setPreviousPrice] = useState<number>(0);

  useEffect(() => {
    const updatePrice = () => {
      const newPrice = getCurrentPrice(symbol);
      setPreviousPrice(price);
      setPrice(newPrice);
    };

    updatePrice();

    const interval = setInterval(updatePrice, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [symbol, refreshIntervalMs, price]);

  const changePercent = price > 0 && previousPrice > 0 ? ((price - previousPrice) / previousPrice) * 100 : 0;
  const isUp = price > previousPrice;

  return { price, changePercent, isUp };
}
