import { useState, useEffect } from 'react';
import { User, getPortfolios, getTransactions, Transaction } from '../services/supabase';
import { getCurrentPrice, getAllStocks } from '../services/marketSimulation';
import { StockCard } from '../components/StockCard';
import { BarChart3, TrendingUp, Wallet, Activity } from 'lucide-react';

interface DashboardPageProps {
  user: User;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

export function DashboardPage({ user, onNavigate }: DashboardPageProps) {
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      const portfolioData = await getPortfolios(user.id);
      const transactionData = await getTransactions(user.id);

      let value = 0;
      let costBasis = 0;

      for (const position of portfolioData) {
        const currentPrice = getCurrentPrice(position.symbol);
        value += currentPrice * position.quantity;
        costBasis += position.average_cost_basis * position.quantity;
      }

      setPortfolios(portfolioData);
      setTransactions(transactionData);
      setPortfolioValue(value);
      setTotalProfit(value + user.virtual_balance - 100000);
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const stocks = getAllStocks();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Trading Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user.email}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Available Cash</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${user.virtual_balance.toFixed(2)}
                </p>
              </div>
              <Wallet className="text-blue-600" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Portfolio Value</p>
                <p className="text-3xl font-bold text-green-600">
                  ${portfolioValue.toFixed(2)}
                </p>
              </div>
              <BarChart3 className="text-green-600" size={32} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Profit/Loss</p>
                <p
                  className={`text-3xl font-bold ${
                    totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  ${totalProfit.toFixed(2)}
                </p>
              </div>
              <TrendingUp
                className={totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}
                size={32}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Net Worth</p>
                <p className="text-3xl font-bold text-purple-600">
                  ${(user.virtual_balance + portfolioValue).toFixed(2)}
                </p>
              </div>
              <Activity className="text-purple-600" size={32} />
            </div>
          </div>
        </div>

        {portfolios.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Your Holdings</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-4 font-semibold">Symbol</th>
                    <th className="text-right py-2 px-4 font-semibold">Quantity</th>
                    <th className="text-right py-2 px-4 font-semibold">Avg Cost</th>
                    <th className="text-right py-2 px-4 font-semibold">Current Price</th>
                    <th className="text-right py-2 px-4 font-semibold">Value</th>
                    <th className="text-right py-2 px-4 font-semibold">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolios.map((position) => {
                    const currentPrice = getCurrentPrice(position.symbol);
                    const pnl = position.quantity < 0 && position.short_entry_price
                      ? (position.short_entry_price - currentPrice) * Math.abs(position.quantity)
                      : (currentPrice - position.average_cost_basis) * position.quantity;
                    const value = currentPrice * Math.abs(position.quantity);
                    const costBasis = position.average_cost_basis * Math.abs(position.quantity);
                    const plPercent = costBasis !== 0 ? (pnl / costBasis) * 100 : 0;

                    return (
                      <tr
                        key={position.id}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => onNavigate('trade', { symbol: position.symbol })}
                      >
                        <td className="py-3 px-4 font-semibold">
                          {position.symbol}
                          {position.quantity < 0 && (
                            <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded ml-1">
                              SHORT
                            </span>
                          )}
                        </td>
                        <td className="text-right py-3 px-4">{position.quantity}</td>
                        <td className="text-right py-3 px-4">
                          ${position.average_cost_basis.toFixed(2)}
                        </td>
                        <td className="text-right py-3 px-4">${currentPrice.toFixed(2)}</td>
                        <td className="text-right py-3 px-4 font-semibold">
                          ${value.toFixed(2)}
                        </td>
                        <td
                          className={`text-right py-3 px-4 font-semibold ${
                            pnl >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          ${pnl.toFixed(2)} ({plPercent.toFixed(2)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Market Overview</h2>
            <div className="grid grid-cols-2 gap-3">
              {stocks.slice(0, 8).map((stock) => (
                <StockCard
                  key={stock.symbol}
                  symbol={stock.symbol}
                  name={stock.name}
                  onSelect={(symbol) => onNavigate('trade', { symbol })}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">Recent Trades</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.slice(0, 10).map((transaction) => {
                const date = new Date(transaction.created_at);
                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100"
                  >
                    <div>
                      <p className="font-semibold">{transaction.symbol}</p>
                      <p className="text-sm text-gray-600">
                        {transaction.type === 'dividend' && (
                          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mr-1">
                            DIV
                          </span>
                        )}
                        {transaction.type === 'buy' ? 'Buy' : transaction.type === 'sell' ? 'Sell' : 'Dividend'} {transaction.quantity} @
                        ${transaction.price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          transaction.type === 'buy' ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {transaction.type === 'buy' ? '-' : '+'}$
                        {transaction.total_cost.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {date.toLocaleDateString()} {date.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
