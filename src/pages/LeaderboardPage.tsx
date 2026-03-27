import { useState, useEffect } from 'react';
import { getLeaderboardData } from '../services/supabase';
import type { User, LeaderboardEntry } from '../services/supabase';
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
      const abs = Math.abs(pos.quantity);
      const entryPrice = pos.short_entry_price ?? price;
      equity += abs * entryPrice * 1.5 + (entryPrice - price) * abs;
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
      const ranked = data
        .map((e) => ({ ...e, equity: computeEquity(e) }))
        .sort((a, b) => b.equity - a.equity)
        .map((e, i) => ({ ...e, rank: i + 1 }));
      setEntries(ranked);
      setIsLoading(false);
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const me = entries.find((e) => e.id === user.id);
  const myRet = me ? ((me.equity - STARTING_BALANCE) / STARTING_BALANCE) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <p className="text-[10px] font-black uppercase tracking-[1.5px] text-sim-muted mb-4">Leaderboard</p>

      {/* My stats */}
      {me && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-sim-surface border border-sim-border rounded-lg p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1">Your Rank</p>
            <p className="text-3xl font-black text-sim-blue">#{me.rank}</p>
            <p className="text-[10px] text-sim-muted">of {entries.length} traders</p>
          </div>
          <div className={`bg-sim-surface border rounded-lg p-4 ${myRet >= 0 ? 'border-sim-green' : 'border-sim-red'}`}>
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1">Your Return</p>
            <p className={`text-3xl font-black ${myRet >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
              {myRet >= 0 ? '+' : ''}{myRet.toFixed(2)}%
            </p>
          </div>
          <div className="bg-sim-surface border border-sim-border rounded-lg p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.8px] text-sim-muted mb-1">Portfolio Value</p>
            <p className="text-3xl font-black text-sim-text">
              ${me.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-sim-border border-t-sim-blue animate-spin" />
        </div>
      ) : (
        <div className="bg-sim-surface border border-sim-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[40px_1fr_130px_90px] px-4 py-2 border-b border-sim-border bg-sim-bg">
            {['#', 'Trader', 'Value', 'Return'].map((h, i) => (
              <span
                key={h}
                className={`text-[9px] font-black uppercase tracking-[0.8px] text-sim-muted ${i > 1 ? 'text-right' : ''}`}
              >
                {h}
              </span>
            ))}
          </div>

          {entries.map((entry) => {
            const ret = ((entry.equity - STARTING_BALANCE) / STARTING_BALANCE) * 100;
            const isMe = entry.id === user.id;
            const rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
            return (
              <div
                key={entry.id}
                className={`grid grid-cols-[40px_1fr_130px_90px] px-4 py-3 border-b border-sim-border items-center ${
                  isMe ? 'bg-sim-blue/5' : 'hover:bg-sim-hover'
                }`}
              >
                <span className={`text-[12px] font-black ${
                  entry.rank === 1 ? 'text-yellow-400'
                  : entry.rank === 2 ? 'text-sim-muted'
                  : entry.rank === 3 ? 'text-sim-amber'
                  : isMe ? 'text-sim-blue' : 'text-sim-muted'
                }`}>
                  {rankIcon ?? entry.rank}
                </span>
                <div>
                  <span className={`text-[12px] font-bold ${isMe ? 'text-sim-blue' : 'text-sim-text'}`}>
                    {entry.display_name ?? 'Anonymous'}{isMe ? ' (you)' : ''}
                  </span>
                  <div className="text-[9px] text-sim-muted">
                    {entry.portfolios.slice(0, 3).map((p) => p.symbol).join(' · ')}
                  </div>
                </div>
                <span className="text-right font-mono font-bold text-[12px] text-sim-text">
                  ${entry.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-right font-mono font-bold text-[12px] ${ret >= 0 ? 'text-sim-green' : 'text-sim-red'}`}>
                  {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-sim-muted mt-3 text-center">Refreshes every 30 seconds</p>
    </div>
  );
}
