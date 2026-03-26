// src/pages/LeaderboardPage.tsx
import { useState, useEffect } from 'react';
import { User, getLeaderboardData, LeaderboardEntry } from '../services/supabase';
import { getCurrentPrice } from '../services/marketSimulation';

interface LeaderboardPageProps {
  user: User;
}

const STARTING_BALANCE = 100_000;

function computeEquity(entry: LeaderboardEntry): number {
  let equity = entry.virtual_balance;

  for (const pos of entry.portfolios) {
    const price = getCurrentPrice(pos.symbol);
    if (pos.quantity > 0) {
      equity += pos.quantity * price;
    } else if (pos.quantity < 0) {
      const absQty = Math.abs(pos.quantity);
      const entryPrice = pos.short_entry_price ?? price;
      const collateral = absQty * entryPrice * 1.5;
      const pnl = (entryPrice - price) * absQty;
      equity += collateral + pnl;
    }
  }

  return equity;
}

export function LeaderboardPage({ user }: LeaderboardPageProps) {
  const [entries, setEntries] = useState<(LeaderboardEntry & { equity: number; rank: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const data = await getLeaderboardData();
      const withEquity = data
        .map((e) => ({ ...e, equity: computeEquity(e) }))
        .sort((a, b) => b.equity - a.equity)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      setEntries(withEquity);
      setIsLoading(false);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const myEntry = entries.find((e) => e.id === user.id);
  const myReturn = myEntry ? ((myEntry.equity - STARTING_BALANCE) / STARTING_BALANCE * 100) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard</h1>

        {myEntry && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs text-blue-600 font-semibold uppercase">Your Rank</p>
              <p className="text-3xl font-bold text-blue-700">#{myEntry.rank}</p>
              <p className="text-xs text-gray-500">of {entries.length} traders</p>
            </div>
            <div className={`${myReturn >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border rounded-lg p-4`}>
              <p className={`text-xs font-semibold uppercase ${myReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>Your Return</p>
              <p className={`text-3xl font-bold ${myReturn >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {myReturn >= 0 ? '+' : ''}{myReturn.toFixed(2)}%
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase">Portfolio Value</p>
              <p className="text-3xl font-bold text-gray-900">${myEntry.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[40px_1fr_120px_100px] gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>#</span>
            <span>Trader</span>
            <span className="text-right">Value</span>
            <span className="text-right">Return</span>
          </div>

          {entries.map((entry) => {
            const ret = ((entry.equity - STARTING_BALANCE) / STARTING_BALANCE * 100);
            const isMe = entry.id === user.id;
            return (
              <div
                key={entry.id}
                className={`grid grid-cols-[40px_1fr_120px_100px] gap-0 px-4 py-3 border-b border-gray-100 items-center ${
                  isMe ? 'bg-blue-50' : ''
                }`}
              >
                <span className={`text-sm font-bold ${
                  entry.rank === 1 ? 'text-yellow-500' :
                  entry.rank === 2 ? 'text-gray-400' :
                  entry.rank === 3 ? 'text-amber-600' :
                  isMe ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : entry.rank}
                </span>
                <div>
                  <span className={`text-sm font-semibold ${isMe ? 'text-blue-700' : 'text-gray-900'}`}>
                    {entry.display_name ?? 'Anonymous'}{isMe ? ' (you)' : ''}
                  </span>
                  <div className="text-xs text-gray-400">
                    {entry.portfolios.slice(0, 2).map((p) => p.symbol).join(', ')}
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 text-right">
                  ${entry.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-sm font-semibold text-right ${ret >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-center">Refreshes every 30 seconds</p>
      </div>
    </div>
  );
}
