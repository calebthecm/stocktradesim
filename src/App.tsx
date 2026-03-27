import { useState, useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSimClock } from './hooks/useSimClock';
import { DashboardPage } from './pages/DashboardPage';
import { TradePage } from './pages/TradePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginDropdown } from './components/LoginDropdown';
import { NewsTicker } from './components/NewsTicker';
import { OnboardingModal } from './components/OnboardingModal';
import { StockCard } from './components/StockCard';
import { signOut } from './services/supabase';
import { formatCountdown } from './services/simClock';
import { getAllStocks } from './services/marketSimulation';

type Page = 'dashboard' | 'trade' | 'leaderboard';

function App() {
  const { user, isLoading } = useAuth();
  const market = useSimClock();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<Record<string, unknown>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Track previous user ID so we show onboarding exactly once per login session
  const lastSeenUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && lastSeenUserIdRef.current !== user.id) {
      lastSeenUserIdRef.current = user.id;
      setShowOnboarding(true);
      setCurrentPage('dashboard');
    } else if (!user) {
      lastSeenUserIdRef.current = null;
    }
  }, [user]);

  const handleNavigate = (page: string, params?: Record<string, unknown>) => {
    setCurrentPage(page as Page);
    if (params) setPageParams(params);
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('dashboard');
  };

  const stocks = getAllStocks();

  return (
    <div className="min-h-screen bg-sim-bg text-sim-text flex flex-col">
      {/* ── Nav ── */}
      <nav className="bg-sim-bg border-b border-sim-border h-[44px] flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-[26px] h-[26px] bg-sim-blue rounded-[5px] flex items-center justify-center">
              <span className="text-white font-black text-[11px]">S</span>
            </div>
            <span className="font-black text-[14px] text-sim-text tracking-tight">
              stocksimulator<span className="text-sim-blue">.win</span>
            </span>
            <span className="bg-sim-badge text-white text-[8px] font-black px-1.5 py-0.5 rounded tracking-[1.5px]">
              SIM
            </span>
          </div>

          {/* Tabs — authenticated only */}
          {user && (
            <div className="flex gap-0.5">
              {(['dashboard', 'trade', 'leaderboard'] as Page[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleNavigate(p)}
                  className={`px-2.5 py-1 rounded text-[12px] font-medium capitalize transition-colors ${
                    currentPage === p
                      ? 'bg-sim-blue text-white font-semibold'
                      : 'text-sim-muted hover:text-sim-text'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Market pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-bold tracking-[0.5px] ${
              market.isOpen
                ? 'border-sim-green text-sim-green bg-sim-green/5'
                : 'border-sim-red text-sim-red bg-sim-red/5'
            }`}
          >
            <span
              className={`w-[6px] h-[6px] rounded-full ${
                market.isOpen ? 'bg-sim-green animate-pulse' : 'bg-sim-red'
              }`}
            />
            {market.isOpen
              ? `OPEN · closes ${formatCountdown(market.secondsRemaining)}`
              : `CLOSED · opens ${formatCountdown(market.secondsRemaining)}`}
          </div>

          {isLoading ? (
            <div className="w-6 h-6 rounded-full border-2 border-sim-border border-t-sim-blue animate-spin" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-sim-muted font-medium">
                {user.display_name ?? user.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-[11px] text-sim-muted border border-sim-border px-2 py-1 rounded hover:text-sim-text transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <LoginDropdown />
          )}
        </div>
      </nav>

      {/* ── News Ticker ── */}
      <NewsTicker />

      {/* ── Onboarding modal (shown once per login session) ── */}
      {showOnboarding && user && (
        <OnboardingModal user={user} onEnter={() => setShowOnboarding(false)} />
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {user ? (
          <>
            {currentPage === 'dashboard' && (
              <DashboardPage user={user} onNavigate={handleNavigate} />
            )}
            {currentPage === 'trade' && (
              <TradePage
                user={user}
                initialSymbol={(pageParams.symbol as string) || 'AAPL'}
                onBack={() => handleNavigate('dashboard')}
                onOrderExecuted={() => handleNavigate('dashboard')}
                marketOpen={market.isOpen}
              />
            )}
            {currentPage === 'leaderboard' && (
              <LeaderboardPage user={user} />
            )}
          </>
        ) : (
          /* ── Guest Page ── */
          <div className="max-w-7xl mx-auto px-4 py-10">
            <div className="mb-10 text-center">
              <p className="text-sim-muted text-[11px] font-bold tracking-[2px] uppercase mb-3">
                Paper Trading Simulator
              </p>
              <h2 className="text-4xl font-black text-sim-text mb-3 leading-tight">
                A day in the life.<br />
                <span className="text-sim-blue">Can you handle the pressure?</span>
              </h2>
              <p className="text-sim-muted max-w-lg mx-auto leading-relaxed">
                Markets move. Positions go red. The clock ticks. This is what it feels like
                to sit at that desk. Start with $100,000 virtual cash.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {stocks.map((stock) => (
                <StockCard
                  key={stock.symbol}
                  symbol={stock.symbol}
                  name={stock.name}
                  onSelect={() => {}}
                />
              ))}
            </div>

            <div className="mt-10 text-center">
              <p className="text-sim-muted text-sm">
                Sign in to trade, track your portfolio, and compete on the leaderboard.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
