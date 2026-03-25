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
  virtual_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number;
  average_cost_basis: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  total_cost: number;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop_loss' | 'stop_loss_limit';
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  stop_price?: number;
  status: 'pending' | 'filled' | 'cancelled';
  created_at: string;
  filled_at?: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  created_at: string;
}

export async function signUp(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
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
  type: 'market' | 'limit' | 'stop_loss' | 'stop_loss_limit',
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  stopPrice?: number
): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          user_id: userId,
          symbol,
          type,
          side,
          quantity,
          price,
          stop_price: stopPrice,
          status: 'pending',
        },
      ])
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
