import React, { useState, useEffect, useCallback } from 'react';
import { User, getOrders, getPortfolios, Order } from '../services/supabase';
import { getCurrentPrice, getAllStocks } from '../services/marketSimulation';
import { placeBracketOrder, executeShortOrder, executeCoverOrder, TradeResult } from '../services/tradingEngine';
import { CandlestickChart } from '../components/CandlestickChart';
import { useStockPrice } from '../hooks/useStockPrice';
import { X } from 'lucide-react';

interface TradePageProps {
  user: User;
  initialSymbol?: string;
  onBack: () => void;
  onOrderExecuted?: () => void;
  marketOpen?: boolean;
}

export function TradePage({ user, initialSymbol = 'AAPL', onBack, onOrderExecuted, marketOpen = true }: TradePageProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [tradeMode, setTradeMode] = useState<'long' | 'short'>('long');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [takeProfitPrice, setTakeProfitPrice] = useState<number | null>(null);
  const [stopLossPrice, setStopLossPrice] = useState<number | null>(null);
  const [chartEntry, setChartEntry] = useState<number>(0);
  const [shortWarning, setShortWarning] = useState(false);

  const { price } = useStockPrice(symbol, 1000);
  const stocks = getAllStocks();

  useEffect(() => {
    const loadOrders = async () => {
      const pendingOrders = await getOrders(user.id);
      setOrders(pendingOrders.filter((o) => o.status === 'pending'));
    };

    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const checkShortWarning = async () => {
      if (tradeMode !== 'short' || !user) return;
      const ports = await getPortfolios(user.id);
      const pos = ports.find((p) => p.symbol === symbol);
      if (pos && pos.quantity < 0 && pos.short_entry_price) {
        const currentPrice = getCurrentPrice(symbol);
        setShortWarning(currentPrice > pos.short_entry_price * 1.25);
      } else {
        setShortWarning(false);
      }
    };
    checkShortWarning();
  }, [tradeMode, symbol, user]);

  const handleTradeIntent = useCallback((entry: number, tp: number | null, sl: number | null) => {
    setChartEntry(entry);
    setTakeProfitPrice(tp);
    setStopLossPrice(sl);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError('Please enter a valid quantity'); return; }

    setIsLoading(true);
    try {
      let result: TradeResult;

      if (tradeMode === 'long') {
        result = await placeBracketOrder(user, symbol, qty, takeProfitPrice, stopLossPrice);
      } else {
        const ports = await getPortfolios(user.id);
        const pos = ports.find((p) => p.symbol === symbol);
        if (pos && pos.quantity < 0) {
          result = await executeCoverOrder(user, symbol, qty);
        } else {
          result = await executeShortOrder(user, symbol, qty);
        }
      }

      if (result.success) {
        setSuccess(result.message);
        setQuantity('');
        onOrderExecuted?.();
      } else {
        setError(result.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const totalCost = quantity && price ? (parseFloat(quantity) * price).toFixed(2) : '0.00';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
        >
          <X size={20} />
          Back to Dashboard
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <CandlestickChart symbol={symbol} onTradeIntent={handleTradeIntent} />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Place Order</h2>

            {!marketOpen && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
                🔴 Market closed — trading resumes at the next open session.
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Symbol
              </label>
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setError('');
                  setSuccess('');
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {stocks.map((stock) => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.symbol} - {stock.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Current Price</p>
              <p className="text-3xl font-bold text-blue-600">${price.toFixed(2)}</p>
            </div>

            <div className="flex gap-0 mb-4 rounded-lg overflow-hidden border border-gray-200">
              <button
                type="button"
                onClick={() => setTradeMode('long')}
                className={`flex-1 py-2 font-semibold text-sm transition-colors ${
                  tradeMode === 'long' ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setTradeMode('short')}
                className={`flex-1 py-2 font-semibold text-sm transition-colors ${
                  tradeMode === 'short' ? 'bg-red-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                SHORT
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600">Estimated Value</p>
                <p className="text-2xl font-bold text-blue-600">${totalCost}</p>
              </div>

              {takeProfitPrice !== null && stopLossPrice !== null && chartEntry > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                  R/R: 1:{Math.abs((takeProfitPrice - chartEntry) / (chartEntry - stopLossPrice)).toFixed(2)}
                </p>
              )}

              {takeProfitPrice !== null && (
                <p className="text-xs text-green-600">Take Profit: ${takeProfitPrice.toFixed(2)}</p>
              )}
              {stopLossPrice !== null && (
                <p className="text-xs text-red-600">Stop Loss: ${stopLossPrice.toFixed(2)}</p>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">
                  {success}
                </div>
              )}

              {tradeMode === 'short' && shortWarning && (
                <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs px-3 py-2 rounded mb-3">
                  ⚠️ Short position at risk — current price is more than 25% above your entry. Consider covering.
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !marketOpen}
                className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
                  !marketOpen
                    ? 'bg-gray-400 cursor-not-allowed'
                    : tradeMode === 'long'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400'
                }`}
              >
                {isLoading
                  ? 'Processing...'
                  : tradeMode === 'long'
                  ? `Buy ${quantity || '0'} ${symbol}`
                  : `Short ${quantity || '0'} ${symbol}`}
              </button>
            </form>

            {orders.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold mb-3">Pending Orders</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs"
                    >
                      <p className="font-semibold">
                        {order.side === 'buy' ? 'BUY' : 'SELL'} {order.quantity} {order.symbol}
                      </p>
                      <p className="text-gray-600">
                        {order.type} @ ${order.price.toFixed(2)}
                        {order.stop_price && ` (Stop: $${order.stop_price.toFixed(2)})`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
