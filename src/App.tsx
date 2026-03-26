import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { TradePage } from './pages/TradePage';
import { signOut } from './services/supabase';

type Page = 'dashboard' | 'trade' | 'auth' | 'leaderboard';

function App() {
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('auth');
  const [pageParams, setPageParams] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!isLoading) {
      setCurrentPage(user ? 'dashboard' : 'auth');
    }
  }, [user, isLoading]);

  const handleNavigate = (page: string, params?: Record<string, any>) => {
    setCurrentPage(page as Page);
    if (params) {
      setPageParams(params);
    }
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
        <DashboardPage
          user={user}
          onNavigate={handleNavigate}
        />
      )}

      {currentPage === 'trade' && user && (
        <TradePage
          user={user}
          initialSymbol={pageParams.symbol || 'AAPL'}
          onBack={() => handleNavigate('dashboard')}
          onOrderExecuted={() => handleNavigate('dashboard')}
        />
      )}
    </div>
  );
}

export default App;
