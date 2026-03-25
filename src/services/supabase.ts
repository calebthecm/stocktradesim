import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  virtual_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number;           // negative = short position
  average_cost_basis: number;
  short_entry_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  symbol: string;
  type: 'buy' | 'sell' | 'dividend';
  quantity: number;
  price: number;
  total_cost: number;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop_loss' | 'stop_loss_limit' | 'take_profit';
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  stop_price?: number;
  bracket_id?: string;
  status: 'pending' | 'filled' | 'cancelled';
  created_at: string;
  filled_at?: string;
}

export interface LeaderboardEntry {
  id: string;
  display_name: string | null;
  virtual_balance: number;
  portfolios: { symbol: string; quantity: number; short_entry_price: number | null }[];
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  created_at: string;
}

export async function signUp(email: string, password: string, displayName?: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (data.user) {
      const { data: userData, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            id: data.user.id,
            email,
            display_name: displayName ?? email.split('@')[0],
            password_hash: 'handled_by_auth',
            virtual_balance: 100000,
          },
        ])
        .select()
        .maybeSingle();

      if (insertError) {
        return { user: null, error: insertError.message };
      }

      return { user: userData, error: null };
    }

    return { user: null, error: 'Unknown error during signup' };
  } catch (err) {
    return { user: null, error: String(err) };
  }
}

export async function signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (data.user) {
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (fetchError) {
        return { user: null, error: fetchError.message };
      }

      return { user: userData, error: null };
    }

    return { user: null, error: 'Unknown error during signin' };
  } catch (err) {
    return { user: null, error: String(err) };
  }
}

export async function signOut(): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message || null };
  } catch (err) {
    return { error: String(err) };
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (fetchError) {
      return null;
    }

    return userData;
  } catch {
    return null;
  }
}

export async function getPortfolios(userId: string): Promise<Portfolio[]> {
  try {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching portfolios:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching portfolios:', err);
    return [];
  }
}

export async function updatePortfolio(
  userId: string,
  symbol: string,
  quantity: number,
  averageCostBasis: number
): Promise<Portfolio | null> {
  try {
    const { data, error } = await supabase
      .from('portfolios')
      .upsert(
        {
          user_id: userId,
          symbol,
          quantity,
          average_cost_basis: averageCostBasis,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,symbol' }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating portfolio:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error updating portfolio:', err);
    return null;
  }
}

export async function createTransaction(
  userId: string,
  symbol: string,
  type: 'buy' | 'sell',
  quantity: number,
  price: number
): Promise<Transaction | null> {
  try {
    const totalCost = quantity * price;

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: userId,
          symbol,
          type,
          quantity,
          price,
          total_cost: totalCost,
        },
      ])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error creating transaction:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error creating transaction:', err);
    return null;
  }
}

export async function getTransactions(userId: string): Promise<Transaction[]> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return [];
  }
}

export async function createOrder(
  userId: string,
  symbol: string,
  type: Order['type'],
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  stopPrice?: number,
  bracketId?: string
): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        user_id: userId,
        symbol,
        type,
        side,
        quantity,
        price,
        stop_price: stopPrice,
        bracket_id: bracketId,
        status: 'pending',
      }])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error creating order:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Error creating order:', err);
    return null;
  }
}

export async function getOrders(userId: string): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching orders:', err);
    return [];
  }
}

export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (error) {
      console.error('Error canceling order:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error canceling order:', err);
    return false;
  }
}

export async function updateUserBalance(userId: string, balance: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ virtual_balance: balance, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('Error updating balance:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error updating balance:', err);
    return false;
  }
}

export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  try {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching watchlist:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching watchlist:', err);
    return [];
  }
}

export async function addToWatchlist(userId: string, symbol: string): Promise<WatchlistItem | null> {
  try {
    const { data, error } = await supabase
      .from('watchlist')
      .insert([
        {
          user_id: userId,
          symbol,
        },
      ])
      .select()
      .maybeSingle();

    if (error && error.code !== '23505') {
      console.error('Error adding to watchlist:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error adding to watchlist:', err);
    return null;
  }
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('symbol', symbol);

    if (error) {
      console.error('Error removing from watchlist:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error removing from watchlist:', err);
    return false;
  }
}

// Cancel all pending orders in the same bracket except the one that just filled
export async function cancelBracketSiblings(bracketId: string, filledOrderId: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('bracket_id', bracketId)
    .eq('status', 'pending')
    .neq('id', filledOrderId);
  if (error) console.error('Error cancelling bracket siblings:', error);
}

// Upsert a short position with short_entry_price tracking
export async function updatePortfolioShort(
  userId: string,
  symbol: string,
  quantity: number,
  shortEntryPrice: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('portfolios')
      .upsert(
        {
          user_id: userId,
          symbol,
          quantity,
          average_cost_basis: 0,
          short_entry_price: shortEntryPrice,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,symbol' }
      );
    if (error) { console.error('Error updating short portfolio:', error); return false; }
    return true;
  } catch (err) {
    console.error('Error updating short portfolio:', err);
    return false;
  }
}

// Fetch top 100 users with their portfolios for leaderboard computation
export async function getLeaderboardData(): Promise<LeaderboardEntry[]> {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, virtual_balance')
      .order('virtual_balance', { ascending: false })
      .limit(100);

    if (usersError || !users) return [];

    const userIds = users.map((u: { id: string }) => u.id);
    const { data: portfolios, error: portError } = await supabase
      .from('portfolios')
      .select('user_id, symbol, quantity, short_entry_price')
      .in('user_id', userIds);

    if (portError) return [];

    return users.map((u: { id: string; display_name: string | null; virtual_balance: number }) => ({
      ...u,
      portfolios: (portfolios ?? [])
        .filter((p: { user_id: string }) => p.user_id === u.id)
        .map((p: { symbol: string; quantity: number; short_entry_price: number | null }) => ({
          symbol: p.symbol,
          quantity: p.quantity,
          short_entry_price: p.short_entry_price,
        })),
    }));
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return [];
  }
}

export async function updateDisplayName(userId: string, displayName: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return !error;
}
