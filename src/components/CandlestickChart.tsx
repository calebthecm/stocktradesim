import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, IPriceLine, UTCTimestamp, Time } from 'lightweight-charts';
import { getCandleHistory, getTimeframeMs, getCurrentPrice } from '../services/marketSimulation';
import { onSimEvent } from '../services/newsEngine';
import type { SimEvent } from '../services/newsEngine';
import { subHours, subWeeks, subMonths } from 'date-fns';
import type { DrawingTool } from './DrawingToolbox';

interface CandlestickChartProps {
  symbol: string;
  activeTool?: DrawingTool;
  onTradeIntent?: (entry: number, takeProfit: number | null, stopLoss: number | null) => void;
}

interface DrawnLine {
  id: string;
  kind: 'trendline' | 'hline' | 'ray' | 'riskbox' | 'fibonacci' | 'text';
  x1Pct: number; y1: number;
  x2Pct: number; y2: number;
  color: string;
  label?: string;
}

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'] as const;

function getStartTime(tf: string): Date {
  const now = new Date();
  switch (tf) {
    case '1m':  return subHours(now, 6);      // ~360 candles
    case '5m':  return subHours(now, 24);     // ~288 candles
    case '15m': return subHours(now, 72);     // ~288 candles
    case '1h':  return subWeeks(now, 12);     // ~504 candles (12 wks × 5d × 8.4h)
    case '4h':  return subMonths(now, 6);     // ~195 candles
    case '1d':  return subMonths(now, 24);    // ~504 candles
    case '1w':  return subMonths(now, 48);    // ~192 candles
    case '1mo': return subMonths(now, 120);   // 120 candles
    default:    return subMonths(now, 24);
  }
}

const DRAG_HIT_PX = 8;

export function CandlestickChart({ symbol, activeTool = 'cursor', onTradeIntent }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const [timeframe, setTimeframe] = useState('1d');

  const entryLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);

  const [entryPrice, setEntryPrice] = useState(0);
  const [tpPrice, setTpPrice] = useState<number | null>(null);
  const [slPrice, setSlPrice] = useState<number | null>(null);

  const dragTarget = useRef<'entry' | 'tp' | 'sl' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingText, setPendingText] = useState<{ xPct: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState('');

  const [activeEvent, setActiveEvent] = useState<SimEvent | null>(null);

  useEffect(() => {
    return onSimEvent((evt) => {
      if (evt.symbol === symbol) {
        setActiveEvent(evt);
        setTimeout(() => setActiveEvent(null), 8000);
      }
    });
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#21262d' },
      timeScale: { borderColor: '#21262d', timeVisible: true },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 600 });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const tfMs = getTimeframeMs(timeframe);
    const start = getStartTime(timeframe);
    const end = new Date();
    const candles = getCandleHistory(symbol, start, end, tfMs);
    const data: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    seriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();

    if (data.length > 0) {
      const last = data[data.length - 1].close as number;
      setEntryPrice(last);
    }
  }, [symbol, timeframe]);

  // Live update every 5 seconds: refresh candles and patch last close with news-adjusted price
  useEffect(() => {
    const id = setInterval(() => {
      if (!seriesRef.current) return;
      const tfMs = getTimeframeMs(timeframe);
      const now = new Date();
      const start = getStartTime(timeframe);
      const candles = getCandleHistory(symbol, start, now, tfMs);
      if (candles.length === 0) return;
      const data: CandlestickData[] = candles.map((c) => ({
        time: Math.floor(c.timestamp / 1000) as UTCTimestamp,
        open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      seriesRef.current.setData(data);
      // Patch the last candle to match the news-drift-adjusted live price
      const livePrice = getCurrentPrice(symbol);
      if (livePrice > 0) {
        const last = data[data.length - 1];
        seriesRef.current.update({
          time: last.time,
          open: last.open,
          high: Math.max(last.high as number, livePrice),
          low: Math.min(last.low as number, livePrice),
          close: livePrice,
        });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [symbol, timeframe]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || entryPrice === 0) return;
    if (entryLineRef.current) {
      try { series.removePriceLine(entryLineRef.current); } catch { /* ignore */ }
    }
    entryLineRef.current = series.createPriceLine({
      price: entryPrice,
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'ENTRY',
    });
  }, [entryPrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (tpLineRef.current) {
      try { series.removePriceLine(tpLineRef.current); } catch { /* ignore */ }
      tpLineRef.current = null;
    }
    if (tpPrice !== null) {
      tpLineRef.current = series.createPriceLine({
        price: tpPrice,
        color: '#26a69a',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP',
      });
    }
  }, [tpPrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (slLineRef.current) {
      try { series.removePriceLine(slLineRef.current); } catch { /* ignore */ }
      slLineRef.current = null;
    }
    if (slPrice !== null) {
      slLineRef.current = series.createPriceLine({
        price: slPrice,
        color: '#ef5350',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'SL',
      });
    }
  }, [slPrice]);

  // coordinateToPrice and priceToCoordinate live on ISeriesApi, not on the price scale
  const yToPrice = useCallback((clientY: number): number => {
    if (!seriesRef.current || !overlayRef.current) return 0;
    const rect = overlayRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    return seriesRef.current.coordinateToPrice(y) ?? 0;
  }, []);

  const priceToY = useCallback((price: number): number => {
    if (!seriesRef.current) return -1000;
    const coord = seriesRef.current.priceToCoordinate(price);
    return coord !== null ? coord : -1000;
  }, []);

  const getDragTarget = useCallback((clientY: number): typeof dragTarget.current => {
    const entryY = priceToY(entryPrice);
    const tpY = tpPrice !== null ? priceToY(tpPrice) : -1000;
    const slY = slPrice !== null ? priceToY(slPrice) : -1000;
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    if (Math.abs(y - tpY) <= DRAG_HIT_PX) return 'tp';
    if (Math.abs(y - slY) <= DRAG_HIT_PX) return 'sl';
    if (Math.abs(y - entryY) <= DRAG_HIT_PX) return 'entry';
    return null;
  }, [entryPrice, tpPrice, slPrice, priceToY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'cursor' || activeTool === 'bracket') {
      if (dragTarget.current) {
        const p = yToPrice(e.clientY);
        if (dragTarget.current === 'entry') setEntryPrice(Math.round(p * 100) / 100);
        if (dragTarget.current === 'tp') setTpPrice(Math.round(p * 100) / 100);
        if (dragTarget.current === 'sl') setSlPrice(Math.round(p * 100) / 100);
        return;
      }
      const hit = getDragTarget(e.clientY);
      if (overlayRef.current) {
        overlayRef.current.style.cursor = hit ? 'ns-resize' : 'default';
      }
    } else if ((activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'riskbox' || activeTool === 'fibonacci') && drawStartRef.current) {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      setDrawingPreview({
        x1: drawStartRef.current.x,
        y1: drawStartRef.current.y,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top,
      });
    } else if (activeTool === 'hline') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      setDrawingPreview({ x1: 0, y1: y, x2: rect.width, y2: y });
    }
  }, [activeTool, getDragTarget, yToPrice]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'cursor' || activeTool === 'bracket') {
      dragTarget.current = getDragTarget(e.clientY);
      if (dragTarget.current !== null) setIsDragging(true);
    } else if (activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'riskbox' || activeTool === 'fibonacci') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      drawStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    } else if (activeTool === 'hline') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const newLine: DrawnLine = {
        id: `hline-${Date.now()}`,
        kind: 'hline',
        x1Pct: 0, y1: y, x2Pct: 100, y2: y,
        color: '#f59e0b',
      };
      setDrawnLines((prev) => [...prev, newLine]);
      setDrawingPreview(null);
    } else if (activeTool === 'text') {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      setPendingText({ xPct: ((e.clientX - rect.left) / rect.width) * 100, y: e.clientY - rect.top });
      setTextInput('');
    } else if (activeTool === 'eraser') {
      setDrawnLines([]);
    }
  }, [activeTool, getDragTarget]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragTarget.current) {
      onTradeIntent?.(entryPrice, tpPrice, slPrice);
      dragTarget.current = null;
      setIsDragging(false);
    } else if ((activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'riskbox' || activeTool === 'fibonacci') && drawStartRef.current) {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;

      let newLine: DrawnLine;
      if (activeTool === 'trendline') {
        newLine = {
          id: `tl-${Date.now()}`,
          kind: 'trendline',
          x1Pct: (drawStartRef.current.x / rect.width) * 100,
          y1: drawStartRef.current.y,
          x2Pct: (x2 / rect.width) * 100,
          y2,
          color: '#f59e0b',
        };
      } else if (activeTool === 'ray') {
        // Extend the line's direction all the way to the right edge
        const dx = x2 - drawStartRef.current.x;
        const dy = y2 - drawStartRef.current.y;
        const y2Ray = dx === 0 ? drawStartRef.current.y : drawStartRef.current.y + (dy / dx) * (rect.width - drawStartRef.current.x);
        newLine = {
          id: `ray-${Date.now()}`,
          kind: 'ray',
          x1Pct: (drawStartRef.current.x / rect.width) * 100,
          y1: drawStartRef.current.y,
          x2Pct: 100,
          y2: y2Ray,
          color: '#f59e0b',
        };
      } else if (activeTool === 'riskbox') {
        newLine = {
          id: `riskbox-${Date.now()}`,
          kind: 'riskbox',
          x1Pct: (drawStartRef.current.x / rect.width) * 100,
          y1: drawStartRef.current.y,
          x2Pct: (x2 / rect.width) * 100,
          y2,
          color: '#ef5350',
        };
      } else {
        // fibonacci
        newLine = {
          id: `fib-${Date.now()}`,
          kind: 'fibonacci',
          x1Pct: 0,
          y1: drawStartRef.current.y,
          x2Pct: 100,
          y2,
          color: '#26a69a',
        };
      }

      setDrawnLines((prev) => [...prev, newLine]);
      drawStartRef.current = null;
      setDrawingPreview(null);
    }
  }, [activeTool, entryPrice, tpPrice, slPrice, onTradeIntent]);

  useEffect(() => {
    onTradeIntent?.(entryPrice, tpPrice, slPrice);
  }, [entryPrice, tpPrice, slPrice, onTradeIntent]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Timeframe buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-sim-border bg-sim-surface flex-shrink-0">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
              timeframe === tf
                ? 'bg-sim-blue text-white'
                : 'text-sim-muted hover:text-sim-text'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart + overlay */}
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Transparent mouse overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ zIndex: 10, pointerEvents: (activeTool !== 'cursor' || isDragging) ? 'auto' : 'none' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { dragTarget.current = null; setIsDragging(false); setDrawingPreview(null); }}
        >
          {/* SVG drawing layer */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 11 }}>
            {drawnLines.map((line) => {
              if (line.kind === 'trendline' || line.kind === 'ray') {
                return (
                  <line
                    key={line.id}
                    x1={`${line.x1Pct}%`} y1={line.y1}
                    x2={`${line.x2Pct}%`} y2={line.y2}
                    stroke={line.color} strokeWidth="1.5"
                    strokeDasharray={line.kind === 'trendline' ? '4 3' : undefined}
                    opacity="0.85"
                  />
                );
              }
              if (line.kind === 'hline') {
                return (
                  <line
                    key={line.id}
                    x1="0%" y1={line.y1} x2="100%" y2={line.y2}
                    stroke={line.color} strokeWidth="1" strokeDasharray="6 4" opacity="0.7"
                  />
                );
              }
              if (line.kind === 'riskbox') {
                return (
                  <rect
                    key={line.id}
                    x={`${Math.min(line.x1Pct, line.x2Pct)}%`}
                    y={Math.min(line.y1, line.y2)}
                    width={`${Math.abs(line.x1Pct - line.x2Pct)}%`}
                    height={Math.abs(line.y1 - line.y2)}
                    fill="rgba(239, 83, 80, 0.06)"
                    stroke={line.color}
                    strokeWidth="1"
                    opacity="0.8"
                  />
                );
              }
              if (line.kind === 'fibonacci') {
                const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 1.0];
                const FIB_COLORS = ['#ef5350', '#f59e0b', '#26a69a', '#26a69a', '#f59e0b', '#ef5350'];
                return (
                  <g key={line.id}>
                    {FIB_LEVELS.map((ratio, i) => {
                      const y = line.y1 + ratio * (line.y2 - line.y1);
                      return (
                        <g key={i}>
                          <line x1="0%" y1={y} x2="100%" y2={y} stroke={FIB_COLORS[i]} strokeWidth="0.8" opacity="0.55" />
                          <text x="4" y={y - 2} fill={FIB_COLORS[i]} fontSize="8" fontFamily="monospace" opacity="0.75">
                            {(ratio * 100).toFixed(1)}%
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              }
              if (line.kind === 'text') {
                return (
                  <text
                    key={line.id}
                    x={`${line.x1Pct}%`}
                    y={line.y1}
                    fill={line.color}
                    fontSize="12"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    opacity="0.9"
                  >
                    {line.label ?? ''}
                  </text>
                );
              }
              return null;
            })}
            {drawingPreview && (
              <line
                x1={drawingPreview.x1} y1={drawingPreview.y1}
                x2={drawingPreview.x2} y2={drawingPreview.y2}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"
              />
            )}
          </svg>
          {/* Floating text input for text tool */}
          {pendingText && (
            <input
              autoFocus
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textInput.trim()) {
                  setDrawnLines((prev) => [...prev, {
                    id: `text-${Date.now()}`,
                    kind: 'text',
                    x1Pct: pendingText.xPct,
                    y1: pendingText.y,
                    x2Pct: pendingText.xPct,
                    y2: pendingText.y,
                    color: '#f59e0b',
                    label: textInput.trim(),
                  }]);
                  setPendingText(null);
                  setTextInput('');
                } else if (e.key === 'Escape') {
                  setPendingText(null);
                  setTextInput('');
                }
              }}
              onBlur={() => { setPendingText(null); setTextInput(''); }}
              style={{ position: 'absolute', left: `${pendingText.xPct}%`, top: pendingText.y, zIndex: 50 }}
              className="bg-sim-surface border border-sim-amber text-sim-text font-mono text-xs px-2 py-0.5 outline-none rounded min-w-[80px]"
            />
          )}
        </div>

        {/* News event popup */}
        {activeEvent && (
          <div
            className="absolute bottom-4 left-4 bg-sim-surface border border-sim-amber border-l-[3px] rounded-r-md px-3 py-2 max-w-xs z-20"
            style={{ borderLeftColor: '#f59e0b' }}
          >
            <div className="text-[8px] font-black text-sim-amber uppercase tracking-[1px] mb-1">
              Sim Event · {activeEvent.symbol}
            </div>
            <div className="text-[11px] text-sim-text leading-snug">{activeEvent.headline}</div>
            <div className={`text-[9px] font-bold mt-1 ${activeEvent.impact >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
              {activeEvent.impact >= 0 ? '▲' : '▼'} {Math.abs(activeEvent.impact * 100).toFixed(1)}% price impact
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="absolute top-2 right-2 bg-sim-bg/80 border border-sim-border rounded px-2 py-1 text-[9px] text-sim-muted z-20">
          ↕ Drag TP / SL lines · {activeTool !== 'cursor' ? activeTool : 'click to draw'}
        </div>
      </div>
    </div>
  );
}
