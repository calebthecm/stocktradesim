import { useState, useEffect } from 'react';
import { useRealtimePrice } from '../hooks/useRealtimePrice';
import { getDayIntradayPrices } from '../services/marketSimulation';

interface StockCardProps {
  symbol: string;
  name: string;
  onSelect?: (symbol: string) => void;
}

export function StockCard({ symbol, name, onSelect }: StockCardProps) {
  const { price, changePercent, isUp, dayOpen, dayHigh, dayLow } = useRealtimePrice(symbol);
  const [intradayPrices, setIntradayPrices] = useState<number[]>([]);

  useEffect(() => {
    const tick = () => setIntradayPrices(getDayIntradayPrices(symbol));
    tick();
    const id = setInterval(tick, 60_000); // update sparkline once per minute
    return () => clearInterval(id);
  }, [symbol]);

  // Replace last minute sample with live DB price so sparkline tip stays current
  const samples = intradayPrices.length >= 2
    ? [...intradayPrices.slice(0, -1), price]
    : [dayOpen || price, price];

  const high = dayHigh || Math.max(...samples);
  const low  = dayLow  || Math.min(...samples);
  const changeDollar = price - (dayOpen || price);
  const color = isUp ? '#26a69a' : '#ef5350';

  const w = 100, h = 26;
  const range = high - low || 1;
  const points = samples
    .map((p, i) => {
      const x = (i / Math.max(samples.length - 1, 1)) * w;
      const y = h - ((p - low) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');
  const gradId = `grad-${symbol}`;

  return (
    <div
      onClick={() => onSelect?.(symbol)}
      className={`bg-sim-bg border border-sim-border rounded-md p-2.5 transition-colors hover:border-sim-blue ${
        onSelect ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-0.5">
        <div>
          <div className="text-[12px] font-black text-sim-text">{symbol}</div>
          <div className="text-[9px] text-sim-muted truncate max-w-[85px]">{name}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold" style={{ color }}>
            {isUp ? '+' : ''}{changePercent.toFixed(2)}%
          </div>
          <div className="text-[9px] font-mono" style={{ color }}>
            {changeDollar >= 0 ? '+' : ''}{changeDollar.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="text-[16px] font-bold font-mono text-sim-text leading-none mb-1">
        ${price.toFixed(2)}
      </div>

      <div className="flex justify-between text-[8px] font-mono text-sim-muted mb-1">
        <span>L {low.toFixed(2)}</span>
        <span>O {(dayOpen || price).toFixed(2)}</span>
        <span>H {high.toFixed(2)}</span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: 22 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`${points} ${w},${h} 0,${h}`}
          fill={`url(#${gradId})`}
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
