// src/hooks/useNewsFeed.ts
// Merges real NewsData.io headlines with sim events into a single
// stream consumed by NewsTicker. Starts the news engine on mount.

import { useState, useEffect } from 'react';
import { fetchRealHeadlines } from '../services/newsService';
import type { RealHeadline } from '../services/newsService';
import { onSimEvent, startNewsEngine } from '../services/newsEngine';
import type { SimEvent } from '../services/newsEngine';

export interface TickerItem {
  id: string;
  kind: 'real' | 'sim';
  text: string;
  source?: string;   // real only: e.g. "REUTERS"
  symbol?: string;   // sim only: e.g. "AAPL"
  impact?: number;   // sim only: signed fraction
}

export function useNewsFeed(): TickerItem[] {
  const [realItems, setRealItems] = useState<TickerItem[]>([]);
  const [simItems, setSimItems] = useState<TickerItem[]>([]);

  // Fetch real headlines on mount and refresh every 5 min
  useEffect(() => {
    startNewsEngine();

    let mounted = true;
    const load = async () => {
      const headlines: RealHeadline[] = await fetchRealHeadlines();
      if (!mounted) return;
      setRealItems(
        headlines.map((h) => ({
          id: h.id,
          kind: 'real',
          text: h.title,
          source: h.source,
        }))
      );
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Listen for sim events — prepend to simItems (keep latest 10)
  useEffect(() => {
    return onSimEvent((event: SimEvent) => {
      const item: TickerItem = {
        id: event.id,
        kind: 'sim',
        text: event.headline,
        symbol: event.symbol,
        impact: event.impact,
      };
      setSimItems((prev) => [item, ...prev].slice(0, 10));
    });
  }, []);

  // Interleave: one sim event between every two real headlines
  const merged: TickerItem[] = [];
  let ri = 0;
  let si = 0;
  while (ri < realItems.length || si < simItems.length) {
    if (ri < realItems.length) merged.push(realItems[ri++]);
    if (ri < realItems.length) merged.push(realItems[ri++]);
    if (si < simItems.length) merged.push(simItems[si++]);
  }

  return merged;
}
