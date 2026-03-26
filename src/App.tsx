import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSimClock } from './hooks/useSimClock';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { TradePage } from './pages/TradePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { signOut } from './services/supabase';
import { formatCountdown } from './services/simClock';

type Page = 'dashboard' | 'trade' | 'auth' | 'leaderboard';

function App() {
  const { user, isLoading } = useAuth();
  const market = useSimClock();
  const [currentPage, setCurrentPage] = useState<Page>('auth');
  const [pageParams, setPageParams] = useState<Record<string, any>>({});

  // Auth redirect — only move TO auth when signed out, or TO dashboard on first load.
  // Guard prevents this from overriding user-initiated navigation.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setCurrentPage('auth');
    } else if (currentPage === 'auth') {
      setCurrentPage('dashboard');
    }
  }, [user, isLoading]); // intentionally omit currentPage to avoid loop

  const handleNavigate = (page: string, params?: Record<string, any>) => {
    setCurrentPage(page as Page);
    if (params) setPageParams(params);
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('auth');
  };

  const handleAuthSuccess = () => {
    setCurrentPage('dashboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen">
      {currentPage !== 'auth' && (
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">TradeVault</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Market status pill */}
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  market.isOpen
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    market.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-400'
                  }`}
                />
                {market.isOpen
                  ? `OPEN · closes ${formatCountdown(market.secondsRemaining)}`
                  : `CLOSED · opens ${formatCountdown(market.secondsRemaining)}`}
              </div>

              <button
                onClick={() => handleNavigate('dashboard')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => handleNavigate('trade')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'trade'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Trade
              </button>
              <button
                onClick={() => handleNavigate('leaderboard')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'leaderboard'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Leaderboard
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>
      )}

      {currentPage === 'dashboard' && user && (
        <DashboardPage user={user} onNavigate={handleNavigate} />
      )}

      {currentPage === 'trade' && user && (
        <TradePage
          user={user}
          initialSymbol={pageParams.symbol || 'AAPL'}
          onBack={() => handleNavigate('dashboard')}
          onOrderExecuted={() => handleNavigate('dashboard')}
          marketOpen={market.isOpen}
        />
      )}

      {currentPage === 'leaderboard' && user && (
        <LeaderboardPage user={user} />
      )}
    </div>
  );
}

export default App;
