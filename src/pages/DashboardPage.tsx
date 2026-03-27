import { useState, useEffect } from 'react';
import { getPortfolios, getTransactions } from '../services/supabase';
import type { User, Transaction, Portfolio } from '../services/supabase';
import { getCurrentPrice, getAllStocks } from '../services/marketSimulation';
import { creditDividends } from '../services/tradingEngine';
import { StockCard } from '../components/StockCard';

interface DashboardPageProps {
  user: User;
  onNavigate: (page: string, params?: Record<string, unknown>) => void;
}

const STARTING_BALANCE = 100_000;

export function DashboardPage({ user, onNavigate }: DashboardPageProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [portData, txData] = await Promise.all([
        getPortfolios(user.id),
        getTransactions(user.id),
      ]);

      // Credit any due dividends
      if (portData.length > 0) {
        await creditDividends(user, portData);
      }

      let value = 0;
      for (const pos of portData) {
        value += getCurrentPrice(pos.symbol) * Math.abs(pos.quantity);
      }
      setPortfolios(portData);
      setTransactions(txData);
      setPortfolioValue(value);
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [user]);

  const totalPL = user.virtual_balance + portfolioValue - STARTING_BALANCE;
  const netWorth = user.virtual_balance + portfolioValue;
  const stocks = getAllStocks();

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Available Cash', value: `$${user.virtual_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-sim-blue' },
          { label: 'Positions Value', value: `$${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-sim-green' },
          { label: 'Total P/L', value: `${totalPL >= 0 ? '+' : ''}$${totalPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: totalPL >= 0 ? 'text-sim-green' : 'text-sim-red' },
          { label: 'Net Worth', value: `$${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-sim-text' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-sim-surface border border-sim-border rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1.5">{label}</p>
            <p className={`text-2xl font-black font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* ── Holdings ── */}
        {portfolios.length > 0 && (
          <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-sim-border flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-sim-muted">Your Holdings</span>
              <button
                onClick={() => onNavigate('trade')}
                className="text-[10px] text-sim-blue font-semibold hover:underline"
              >
                Trade →
              </button>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-sim-border">
                  {['Symbol', 'Qty', 'Avg', 'Price', 'P/L'].map((h) => (
                    <th
                      key={h}
                      className={`py-2 px-3 text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted ${h === 'Symbol' ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolios.map((pos) => {
                  const cur = getCurrentPrice(pos.symbol);
                  const pnl = pos.quantity < 0 && pos.short_entry_price
                    ? (pos.short_entry_price - cur) * Math.abs(pos.quantity)
                    : (cur - pos.average_cost_basis) * pos.quantity;
                  const basis = pos.average_cost_basis * Math.abs(pos.quantity);
                  const pct = basis !== 0 ? (pnl / basis) * 100 : 0;

                  return (
                    <tr
                      key={pos.id}
                      className="border-b border-sim-border hover:bg-sim-hover cursor-pointer"
                      onClick={() => onNavigate('trade', { symbol: pos.symbol })}
                    >
                      <td className="py-2.5 px-3 font-black text-sim-text">
                        {pos.symbol}
                        {pos.quantity < 0 && (
                          <span className="ml-1 text-[8px] font-black text-sim-red bg-sim-red/10 px-1 py-0.5 rounded">
                            SHORT
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sim-text">{pos.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-sim-muted">${pos.average_cost_basis.toFixed(2)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${cur >= pos.average_cost_basis ? 'text-sim-green' : 'text-sim-red'}`}>
                        ${cur.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${pnl >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}<br />
                        <span className="text-[9px]">{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Recent Trades ── */}
        <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sim-border">
            <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-sim-muted">Recent Trades</span>
          </div>
          <div className="divide-y divide-sim-border max-h-64 overflow-y-auto">
            {transactions.slice(0, 12).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="font-black text-sim-text text-[12px]">{tx.symbol}</span>
                  <div className="text-[10px] text-sim-muted mt-0.5">
                    {tx.type === 'dividend' && (
                      <span className="text-sim-amber bg-sim-amber/10 px-1 py-0.5 rounded text-[8px] font-black mr-1">DIV</span>
                    )}
                    {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} {tx.quantity} @ ${tx.price.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-[12px] ${tx.type === 'buy' ? 'text-sim-red' : 'text-sim-green'}`}>
                    {tx.type === 'buy' ? '-' : '+'}${tx.total_cost.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-sim-muted">
                    {new Date(tx.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="px-4 py-8 text-center text-sim-muted text-[12px]">No trades yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Market Overview ── */}
      <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-sim-border flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-sim-muted">Market Overview</span>
          <span className="text-[9px] text-sim-muted">SIMULATED · updates every second</span>
        </div>
        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {stocks.map((s) => (
            <StockCard
              key={s.symbol}
              symbol={s.symbol}
              name={s.name}
              onSelect={(sym) => onNavigate('trade', { symbol: sym })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
