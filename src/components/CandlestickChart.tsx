import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  CandlestickSeries,
  LineStyle,
  IPriceLine,
  UTCTimestamp,
  Time,
} from 'lightweight-charts';
import { getCandleHistory, getTimeframeMs } from '../services/marketSimulation';
import { subHours, subWeeks, subMonths } from 'date-fns';

interface CandlestickChartProps {
  symbol: string;
  /** When provided, shows entry/TP/SL lines and fires this callback on change */
  onTradeIntent?: (entry: number, takeProfit: number | null, stopLoss: number | null) => void;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'] as const;

function getStartTime(tf: string): Date {
  const now = new Date();
  switch (tf) {
    case '1m': case '5m': case '15m': case '1h': return subHours(now, 24);
    case '4h': case '1d': return subWeeks(now, 4);
    case '1w': return subMonths(now, 12);
    case '1mo': return subMonths(now, 36);
    default: return subWeeks(now, 4);
  }
}

export function CandlestickChart({ symbol, onTradeIntent }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const [timeframe, setTimeframe] = useState('1d');

  const entryLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);

  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [slPrice, setSlPrice] = useState<number | null>(null);

  // Mount chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1e2235' },
        horzLines: { color: '#1e2235' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#1e2235' },
      timeScale: {
        borderColor: '#1e2235',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 450,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candles when symbol or timeframe changes
  useEffect(() => {
    if (!seriesRef.current) return;
    const tfMs = getTimeframeMs(timeframe);
    const start = getStartTime(timeframe);
    const candles = getCandleHistory(symbol, start, new Date(), tfMs);

    const data: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();

    if (onTradeIntent && data.length > 0) {
      const last = data[data.length - 1].close as number;
      setEntryPrice(last);
      setTpPrice(parseFloat((last * 1.03).toFixed(2)));
      setSlPrice(parseFloat((last * 0.98).toFixed(2)));
    }
  }, [symbol, timeframe, onTradeIntent]);

  // Draw/update price lines when prices change
  useEffect(() => {
    if (!seriesRef.current || !onTradeIntent || entryPrice === 0) return;
    const series = seriesRef.current;

    if (entryLineRef.current) { try { series.removePriceLine(entryLineRef.current); } catch { /* ignore */ } }
    if (tpLineRef.current)    { try { series.removePriceLine(tpLineRef.current);    } catch { /* ignore */ } }
    if (slLineRef.current)    { try { series.removePriceLine(slLineRef.current);    } catch { /* ignore */ } }

    entryLineRef.current = series.createPriceLine({
      price: entryPrice,
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `ENTRY  $${entryPrice.toFixed(2)}`,
    });

    if (tpPrice !== null) {
      const pct = (((tpPrice - entryPrice) / entryPrice) * 100).toFixed(1);
      tpLineRef.current = series.createPriceLine({
        price: tpPrice,
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP  $${tpPrice.toFixed(2)}  +${pct}%`,
      });
    }

    if (slPrice !== null) {
      const pct = (((slPrice - entryPrice) / entryPrice) * 100).toFixed(1);
      slLineRef.current = series.createPriceLine({
        price: slPrice,
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SL  $${slPrice.toFixed(2)}  ${pct}%`,
      });
    }

    onTradeIntent(entryPrice, tpPrice, slPrice);
  }, [entryPrice, tpPrice, slPrice, onTradeIntent]);

  return (
    <div className="w-full bg-[#131722] rounded-lg overflow-hidden">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-[#1e2235]">
        <span className="text-[#d1d4dc] font-bold text-sm mr-2">{symbol}</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              timeframe === tf
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className="w-full" />

      {/* Trade line controls — only in trade mode */}
      {onTradeIntent && entryPrice > 0 && (
        <div className="px-4 py-3 border-t border-[#1e2235] grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-[#2962ff] font-bold uppercase tracking-wide block mb-1">Entry</label>
            <input
              type="number"
              value={entryPrice}
              step="0.01"
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#1e2235] text-[#d1d4dc] text-sm px-2 py-1 rounded border border-[#2962ff] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#26a69a] font-bold uppercase tracking-wide block mb-1">Take Profit</label>
            <input
              type="number"
              value={tpPrice ?? ''}
              step="0.01"
              placeholder="optional"
              onChange={(e) => setTpPrice(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full bg-[#1e2235] text-[#d1d4dc] text-sm px-2 py-1 rounded border border-[#26a69a] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#ef5350] font-bold uppercase tracking-wide block mb-1">Stop Loss</label>
            <input
              type="number"
              value={slPrice ?? ''}
              step="0.01"
              placeholder="optional"
              onChange={(e) => setSlPrice(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full bg-[#1e2235] text-[#d1d4dc] text-sm px-2 py-1 rounded border border-[#ef5350] outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
