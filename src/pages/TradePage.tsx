import React, { useState, useEffect } from 'react';
import { User, getOrders, Order } from '../services/supabase';
import { getCurrentPrice, getAllStocks, getStockInfo } from '../services/marketSimulation';
import { executeBuyOrder, executeSellOrder, validateBuyOrder, validateSellOrder } from '../services/tradingEngine';
import { CandlestickChart } from '../components/CandlestickChart';
import { useStockPrice } from '../hooks/useStockPrice';
import { X } from 'lucide-react';

interface TradePageProps {
  user: User;
  initialSymbol?: string;
  onBack: () => void;
  onOrderExecuted?: () => void;
}

export function TradePage({ user, initialSymbol = 'AAPL', onBack, onOrderExecuted }: TradePageProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_loss' | 'stop_loss_limit'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);

  const { price } = useStockPrice(symbol, 1000);
  const stocks = getAllStocks();
  const stockInfo = getStockInfo(symbol);

  useEffect(() => {
    const loadOrders = async () => {
      const pendingOrders = await getOrders(user.id);
      setOrders(pendingOrders.filter((o) => o.status === 'pending'));
    };

    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!quantity || parseFloat(quantity) <= 0) {
      setError('Please enter a valid quantity');
      return;
    }

    const qty = parseFloat(quantity);
    let actualPrice = price;

    if (orderType === 'limit' && limitPrice) {
      actualPrice = parseFloat(limitPrice);
    } else if (orderType === 'stop_loss_limit' && limitPrice) {
      actualPrice = parseFloat(limitPrice);
    }

    if (side === 'buy') {
      const validation = await validateBuyOrder(user, symbol, qty, actualPrice);
      if (validation) {
        setError(validation);
        return;
      }
    } else {
      const validation = await validateSellOrder(user, symbol, qty);
      if (validation) {
        setError(validation);
        return;
      }
    }

    setIsLoading(true);

    try {
      let result;

      if (orderType === 'market') {
        if (side === 'buy') {
          result = await executeBuyOrder(user, symbol, qty);
        } else {
          result = await executeSellOrder(user, symbol, qty);
        }

        if (result.success) {
          setSuccess(result.message);
          setQuantity('');
          setLimitPrice('');
          setStopPrice('');
          onOrderExecuted?.();
        } else {
          setError(result.message);
        }
      } else {
        setSuccess('Order placed successfully');
        setQuantity('');
        setLimitPrice('');
        setStopPrice('');
        onOrderExecuted?.();
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
            <CandlestickChart symbol={symbol} />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Place Order</h2>

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

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSide('buy')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  side === 'buy'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide('sell')}
                className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                  side === 'sell'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Sell
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Order Type
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="market">Market Order</option>
                  <option value="limit">Limit Order</option>
                  <option value="stop_loss">Stop Loss</option>
                  <option value="stop_loss_limit">Stop Loss Limit</option>
                </select>
              </div>

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

              {orderType !== 'market' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Limit Price
                  </label>
                  <input
                    type="number"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    step="0.01"
                    required
                  />
                </div>
              )}

              {(orderType === 'stop_loss' || orderType === 'stop_loss_limit') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stop Price
                  </label>
                  <input
                    type="number"
                    value={stopPrice}
                    onChange={(e) => setStopPrice(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    step="0.01"
                    required
                  />
                </div>
              )}

              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-blue-600">${totalCost}</p>
              </div>

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

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
                  side === 'buy'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400'
                }`}
              >
                {isLoading
                  ? 'Processing...'
                  : `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity} ${symbol}`}
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
