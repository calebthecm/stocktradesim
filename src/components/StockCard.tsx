import { useState, useEffect, useRef } from 'react';
import { getCurrentPrice } from '../services/marketSimulation';

interface StockCardProps {
  symbol: string;
  name: string;
  onSelect?: (symbol: string) => void;
}

const SAMPLE_COUNT = 30;

export function StockCard({ symbol, name, onSelect }: StockCardProps) {
  const [price, setPrice] = useState(0);
  const [openPrice, setOpenPrice] = useState(0);
  const samplesRef = useRef<number[]>([]);

  useEffect(() => {
    const tick = () => {
      const p = getCurrentPrice(symbol);
      setPrice(p);
      samplesRef.current = [...samplesRef.current, p].slice(-SAMPLE_COUNT);
      if (samplesRef.current.length === 1) setOpenPrice(p);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [symbol]);

  useEffect(() => {
    const p = getCurrentPrice(symbol);
    setOpenPrice(p);
  }, [symbol]);

  const samples = samplesRef.current.length >= 2 ? samplesRef.current : [price, price];
  const minP = Math.min(...samples);
  const maxP = Math.max(...samples);
  const range = maxP - minP || 1;
  const isUp = price >= openPrice;

  const changePct = openPrice > 0 ? ((price - openPrice) / openPrice) * 100 : 0;

  // Build SVG polyline points
  const w = 100;
  const h = 32;
  const points = samples
    .map((p, i) => {
      const x = (i / (samples.length - 1)) * w;
      const y = h - ((p - minP) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');

  const color = isUp ? '#26a69a' : '#ef5350';
  const gradId = `grad-${symbol}`;

  return (
    <div
      onClick={() => onSelect?.(symbol)}
      className={`bg-sim-bg border border-sim-border rounded-md p-2.5 transition-colors hover:border-sim-blue ${
        onSelect ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[12px] font-black text-sim-text">{symbol}</div>
          <div className="text-[9px] text-sim-muted truncate max-w-[80px]">{name}</div>
        </div>
        <span
          className="text-[10px] font-bold"
          style={{ color }}
        >
          {isUp ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>

      <div className="text-[15px] font-bold font-mono" style={{ color }}>
        ${price.toFixed(2)}
      </div>

      {/* Sparkline */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full mt-1.5"
        style={{ height: 28 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
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
