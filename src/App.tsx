import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSimClock } from './hooks/useSimClock';
import { DashboardPage } from './pages/DashboardPage';
import { TradePage } from './pages/TradePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginDropdown } from './components/LoginDropdown';
import { StockCard } from './components/StockCard';
import { signOut } from './services/supabase';
import { formatCountdown } from './services/simClock';
import { getAllStocks } from './services/marketSimulation';

type Page = 'dashboard' | 'trade' | 'leaderboard';

function App() {
  const { user, isLoading } = useAuth();
  const market = useSimClock();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<Record<string, any>>({});

  // When user signs in, go to dashboard
  useEffect(() => {
    if (user) setCurrentPage('dashboard');
  }, [user]);

  const handleNavigate = (page: string, params?: Record<string, any>) => {
    setCurrentPage(page as Page);
    if (params) setPageParams(params);
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('dashboard');
  };

  const stocks = getAllStocks();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav — always visible */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                stocksimulator<span className="text-blue-600">.win</span>
              </h1>
            </div>

            {user && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleNavigate('dashboard')}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => handleNavigate('trade')}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    currentPage === 'trade' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Trade
                </button>
                <button
                  onClick={() => handleNavigate('leaderboard')}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    currentPage === 'leaderboard' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Leaderboard
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Market status pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                market.isOpen
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${market.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
              {market.isOpen
                ? `OPEN · closes ${formatCountdown(market.secondsRemaining)}`
                : `CLOSED · opens ${formatCountdown(market.secondsRemaining)}`}
            </div>

            {isLoading ? (
              <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 font-medium">
                  {user.display_name ?? user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <LoginDropdown />
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      {user ? (
        <>
          {currentPage === 'dashboard' && (
            <DashboardPage user={user} onNavigate={handleNavigate} />
          )}
          {currentPage === 'trade' && (
            <TradePage
              user={user}
              initialSymbol={pageParams.symbol || 'AAPL'}
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
        /* Guest view — live market prices, no auth required */
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Live Market Simulation</h2>
            <p className="text-gray-500">
              Watch prices move in real time.{' '}
              <span className="text-blue-600 font-medium">Login to start trading with $100,000 virtual cash.</span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {stocks.map((stock) => (
              <StockCard
                key={stock.symbol}
                symbol={stock.symbol}
                name={stock.name}
                onSelect={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
