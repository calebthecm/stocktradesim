import { useState, useEffect } from 'react';
import { getMarketStatus, MarketStatus } from '../services/simClock';

export function useSimClock(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus());

  useEffect(() => {
    const tick = () => setStatus(getMarketStatus());
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return status;
}
