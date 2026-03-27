// src/components/NewsTicker.tsx
// A 24px tall strip that scrolls headlines left continuously.
// Sim events are shown with an amber ⚡ badge; real news with a blue source tag.

import { useNewsFeed } from '../hooks/useNewsFeed';
import type { TickerItem } from '../hooks/useNewsFeed';

function TickerItemView({ item }: { item: TickerItem }) {
  if (item.kind === 'sim') {
    const dir = (item.impact ?? 0) >= 0 ? '▲' : '▼';
    const color = (item.impact ?? 0) >= 0 ? 'text-sim-green' : 'text-sim-red';
    const pct = Math.abs((item.impact ?? 0) * 100).toFixed(1);
    return (
      <span className="flex items-center gap-1.5 text-[11px]">
        <span className="bg-sim-amber/10 text-sim-amber font-black text-[8px] px-1.5 py-0.5 rounded tracking-widest">
          ⚡ {item.symbol}
        </span>
        <span className="text-sim-text">{item.text}</span>
        <span className={`font-bold ${color}`}>{dir}{pct}%</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className="text-sim-blue font-bold text-[8px] tracking-wide">{item.source}</span>
      <span className="text-sim-muted">{item.text}</span>
    </span>
  );
}

export function NewsTicker() {
  const items = useNewsFeed();

  if (items.length === 0) return null;

  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="h-[26px] bg-sim-surface border-b border-sim-border flex items-center overflow-hidden flex-shrink-0">
      {/* Label */}
      <div className="flex-shrink-0 px-3 h-full flex items-center border-r border-sim-border">
        <span className="text-[8px] font-black tracking-[1.5px] text-sim-muted">
          📡 <span className="text-sim-amber">LIVE</span>
        </span>
      </div>

      {/* Scrolling track */}
      <div className="overflow-hidden flex-1 relative">
        <div
          className="flex items-center gap-8 whitespace-nowrap"
          style={{
            animation: `ticker-scroll ${items.length * 4}s linear infinite`,
          }}
        >
          {doubled.map((item, i) => (
            <span key={`${item.id}-${i}`} className="flex items-center gap-8">
              <TickerItemView item={item} />
              <span className="text-sim-border">·</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
