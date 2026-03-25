import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getCandleHistory, getTimeframeMs, getTimeframeLabel, Candle } from '../services/marketSimulation';
import { format, subDays, subHours, subWeeks, subMonths } from 'date-fns';

interface CandlestickChartProps {
  symbol: string;
  timeframe?: string;
}

export function CandlestickChart({ symbol, timeframe = '1d' }: CandlestickChartProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);

  useEffect(() => {
    const loadCandles = async () => {
      setIsLoading(true);
      const timeframeMs = getTimeframeMs(selectedTimeframe);
      const now = new Date();
      let startTime: Date;

      switch (selectedTimeframe) {
        case '1m':
        case '5m':
        case '15m':
        case '1h':
          startTime = subHours(now, 24);
          break;
        case '4h':
        case '1d':
          startTime = subWeeks(now, 4);
          break;
        case '1w':
          startTime = subMonths(now, 12);
          break;
        case '1mo':
          startTime = subMonths(now, 36);
          break;
        default:
          startTime = subDays(now, 30);
      }

      const history = getCandleHistory(symbol, startTime, now, timeframeMs);
      setCandles(history);
      setIsLoading(false);
    };

    loadCandles();
  }, [symbol, selectedTimeframe]);

  if (isLoading) {
    return <div className="w-full h-96 flex items-center justify-center">Loading chart...</div>;
  }

  const data = candles.map((candle) => ({
    timestamp: candle.timestamp,
    timeStr: format(new Date(candle.timestamp), 'MMM dd, HH:mm'),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1mo'];

  return (
    <div className="w-full bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">{symbol}</h2>
        <div className="flex gap-2 flex-wrap">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-1 rounded font-medium text-sm transition-colors ${
                selectedTimeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="timeStr"
            tick={{ fontSize: 12 }}
            interval={Math.floor(data.length / 10)}
          />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}
            formatter={(value: number) => value.toFixed(2)}
            labelFormatter={(label) => `Time: ${label}`}
          />
          <Bar yAxisId="right" dataKey="volume" fill="#d1d5db" opacity={0.3} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="open"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={1}
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="high"
            stroke="#10b981"
            dot={false}
            strokeWidth={1}
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="low"
            stroke="#ef4444"
            dot={false}
            strokeWidth={1}
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="close"
            stroke="#8b5cf6"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600">Open</p>
          <p className="text-lg font-semibold text-blue-600">
            ${data[data.length - 1]?.open.toFixed(2) || '-'}
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600">High</p>
          <p className="text-lg font-semibold text-green-600">
            ${data[data.length - 1]?.high.toFixed(2) || '-'}
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600">Low</p>
          <p className="text-lg font-semibold text-red-600">
            ${data[data.length - 1]?.low.toFixed(2) || '-'}
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600">Close</p>
          <p className="text-lg font-semibold text-purple-600">
            ${data[data.length - 1]?.close.toFixed(2) || '-'}
          </p>
        </div>
      </div>
    </div>
  );
}
