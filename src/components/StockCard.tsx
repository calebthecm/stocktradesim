import React from 'react';
import { useStockPrice } from '../hooks/useStockPrice';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StockCardProps {
  symbol: string;
  name: string;
  onSelect?: (symbol: string) => void;
}

export function StockCard({ symbol, name, onSelect }: StockCardProps) {
  const { price, changePercent, isUp } = useStockPrice(symbol, 1000);

  return (
    <div
      onClick={() => onSelect?.(symbol)}
      className="bg-white p-4 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-bold text-lg">{symbol}</h3>
          <p className="text-sm text-gray-600">{name}</p>
        </div>
        {isUp ? (
          <TrendingUp className="text-green-600" size={20} />
        ) : (
          <TrendingDown className="text-red-600" size={20} />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">${price.toFixed(2)}</span>
        <span
          className={`text-sm font-medium ${
            isUp ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
