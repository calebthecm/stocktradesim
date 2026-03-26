import { useState, useEffect } from 'react';
import { User } from '../services/supabase';
import { supabase } from '../services/supabase';

async function fetchUserRow(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // getSession() reads from localStorage — never hangs on a network call.
    // This resolves immediately and unblocks the UI.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        const row = await fetchUserRow(session.user.id);
        if (mounted) setUser(row);
      }
      if (mounted) setIsLoading(false);
    });

    // onAuthStateChange handles sign-in, sign-out, and token refresh going forward.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          const row = await fetchUserRow(session.user.id);
          if (mounted) setUser(row);
        } else {
          if (mounted) setUser(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
