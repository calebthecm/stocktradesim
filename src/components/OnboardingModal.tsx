import { useState, useEffect } from 'react';
import type { User } from '../services/supabase';
import { useSimClock } from '../hooks/useSimClock';

interface OnboardingModalProps {
  user: User;
  onEnter: () => void;
}

const BRIEFING_ITEMS = [
  { symbol: 'NVDA', headline: 'Earnings beat — analysts raise 12-month PT to $1,100', impact: '+' },
  { symbol: 'TSLA', headline: 'Q4 deliveries miss estimates — pre-market down 4.2%', impact: '-' },
  { symbol: 'AAPL', headline: 'New product cycle begins — supply chain checks positive', impact: '+' },
];

const BILLS = [
  { label: 'Rent',         amount: 2_200, due: 'Due in 3 days' },
  { label: 'Groceries',    amount: 180,   due: 'Weekly' },
  { label: 'Electric',     amount: 95,    due: 'Due today' },
  { label: 'Internet',     amount: 60,    due: 'Due this week' },
];

export function OnboardingModal({ user, onEnter }: OnboardingModalProps) {
  const market = useSimClock();
  const [visible, setVisible] = useState(false);

  // Fade in after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const simDate = new Date();
  const timeStr = simDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = simDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const greeting = simDate.getHours() < 12 ? 'Good morning' : 'Good afternoon';
  const name = user.display_name || 'Trader';
  const balance = user.virtual_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <div
      className="fixed inset-0 bg-sim-bg z-50 flex flex-col items-center justify-center px-6"
      style={{ transition: 'opacity 0.4s', opacity: visible ? 1 : 0 }}
    >
      {/* Terminal header */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-black text-sim-muted tracking-[2px] uppercase">
            stocksimulator<span className="text-sim-blue">.win</span> · market briefing
          </span>
          <span className="text-[9px] font-mono text-sim-muted">{timeStr}</span>
        </div>
        <div className="h-px bg-sim-border" />
      </div>

      {/* Greeting block */}
      <div className="w-full max-w-xl mb-8">
        <p className="text-[11px] font-bold text-sim-muted tracking-[1.5px] uppercase mb-2">{dateStr}</p>
        <h1 className="text-3xl font-black text-sim-text leading-tight mb-1">
          {greeting}, {name}.
        </h1>
        <p className="text-sim-muted text-sm leading-relaxed">
          {market.isOpen
            ? `The NYSE is open. Your starting capital is `
            : `The market opens in ${Math.floor(market.secondsRemaining / 60)}m. Your starting capital is `}
          <span className="text-sim-green font-bold font-mono">{balance}</span>.
          {' '}No excuses. No do-overs.
        </p>
      </div>

      {/* Market status pill */}
      <div className="w-full max-w-xl mb-6">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded border text-[10px] font-bold tracking-[0.5px] ${
            market.isOpen
              ? 'border-sim-green text-sim-green bg-sim-green/5'
              : 'border-sim-red text-sim-red bg-sim-red/5'
          }`}
        >
          <span className={`w-[6px] h-[6px] rounded-full ${market.isOpen ? 'bg-sim-green animate-pulse' : 'bg-sim-red'}`} />
          {market.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
          <span className="text-sim-muted font-normal ml-1">
            · {market.isOpen ? 'closes' : 'opens'} in {Math.floor(market.secondsRemaining / 60)}m {market.secondsRemaining % 60}s
          </span>
        </div>
      </div>

      {/* Two-column: briefing + bills */}
      <div className="w-full max-w-xl mb-8 flex gap-5">
        {/* Today's briefing */}
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-sim-muted tracking-[2px] uppercase mb-3">Today's Briefing</p>
          <div className="flex flex-col gap-1.5">
            {BRIEFING_ITEMS.map((item) => (
              <div key={item.symbol} className="flex items-start gap-2 py-1.5 border-b border-sim-border/50">
                <span className="text-[10px] font-black font-mono text-sim-text w-10 flex-shrink-0 mt-0.5">{item.symbol}</span>
                <span className="text-[10px] text-sim-muted leading-snug flex-1">{item.headline}</span>
                <span className={`text-[10px] font-bold flex-shrink-0 mt-0.5 ${item.impact === '+' ? 'text-sim-green' : 'text-sim-red'}`}>
                  {item.impact === '+' ? '▲' : '▼'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bills & expenses */}
        <div className="w-[160px] flex-shrink-0">
          <p className="text-[9px] font-black text-sim-muted tracking-[2px] uppercase mb-3">Bills &amp; Expenses</p>
          <div className="flex flex-col gap-1.5">
            {BILLS.map((bill) => (
              <div key={bill.label} className="flex items-center justify-between py-1.5 border-b border-sim-border/50">
                <div>
                  <p className="text-[10px] font-semibold text-sim-text leading-none">{bill.label}</p>
                  <p className="text-[9px] text-sim-muted mt-0.5">{bill.due}</p>
                </div>
                <span className="text-[10px] font-mono font-bold text-sim-red">
                  −${bill.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-sim-muted mt-2 leading-snug opacity-60">
            Storyline expenses coming soon
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="w-full max-w-xl">
        <button
          onClick={onEnter}
          className="w-full py-3 bg-sim-blue text-white font-black text-[13px] tracking-[1px] rounded hover:opacity-90 transition-opacity"
        >
          ENTER THE MARKET →
        </button>
        <p className="text-center text-[9px] text-sim-muted mt-3 tracking-[0.5px]">
          Markets move fast. Positions go red. The clock doesn't stop.
        </p>
      </div>
    </div>
  );
}
