// useRealtimePrice — DB-backed price with Supabase Realtime updates.
// Calls the tick-market Edge Function every 10s to keep the DB fresh,
// then subscribes to Realtime so all clients see the same price simultaneously.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { getCurrentPrice, getDayOpen } from '../services/marketSimulation';

interface MarketPriceRow {
  symbol: string;
  price: number;
  day_open: number;
  day_high: number;
  day_low: number;
  updated_at: string;
}

// Module-level tick state — shared across all hook instances so we
// don't send duplicate requests when 12 StockCards mount simultaneously.
let tickTimeout: ReturnType<typeof setTimeout> | null = null;
let lastTickAt = 0;
const TICK_INTERVAL_MS = 10_000;

function scheduleTick() {
  if (tickTimeout !== null) return;
  const since = Date.now() - lastTickAt;
  const delay = since >= TICK_INTERVAL_MS ? 0 : TICK_INTERVAL_MS - since;
  tickTimeout = setTimeout(async () => {
    tickTimeout = null;
    lastTickAt = Date.now();
    try {
      await supabase.functions.invoke('tick-market');
    } catch {
      // non-fatal — clients still have local fallback
    }
    scheduleTick();
  }, delay);
}

export function useRealtimePrice(symbol: string) {
  // Seed with local computation so UI is non-zero on first render
  const [price, setPrice] = useState(() => getCurrentPrice(symbol));
  const [dayOpen, setDayOpen] = useState(() => getDayOpen(symbol));
  const [dayHigh, setDayHigh] = useState(0);
  const [dayLow, setDayLow] = useState(0);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    // Load current row from DB on mount
    supabase
      .from('market_prices')
      .select('*')
      .eq('symbol', symbol)
      .maybeSingle()
      .then(({ data }: { data: MarketPriceRow | null }) => {
        if (!data) return;
        setPrice(Number(data.price));
        setDayOpen(Number(data.day_open));
        setDayHigh(Number(data.day_high));
        setDayLow(Number(data.day_low));
      });

    // Subscribe to Realtime row-level updates for this symbol.
    const channel = supabase
      .channel(`market_prices:${symbol}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'market_prices',
          filter: `symbol=eq.${symbol}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as unknown as MarketPriceRow;
          if (!row?.price) return;
          setPrice(Number(row.price));
          setDayOpen(Number(row.day_open));
          setDayHigh(Number(row.day_high));
          setDayLow(Number(row.day_low));
        },
      )
      .subscribe();

    // Kick off the shared tick loop
    scheduleTick();

    return () => { supabase.removeChannel(channel); };
  }, [symbol]);

  const changePercent = dayOpen > 0 ? ((price - dayOpen) / dayOpen) * 100 : 0;
  const isUp = price >= dayOpen;

  return { price, changePercent, isUp, dayOpen, dayHigh, dayLow };
}
