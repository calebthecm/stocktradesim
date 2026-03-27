import { useState, useEffect } from 'react';
import type { User } from '../services/supabase';
import { supabase } from '../services/supabase';

async function fetchUserRow(userId: string): Promise<User | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data ?? null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // getSession() reads localStorage — resolves in <1ms, never hangs.
    // We unblock isLoading immediately so the UI is never stuck,
    // then fetch the user row from the DB in the background.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;

      // Auth state is known — unblock the UI right now
      setIsLoading(false);

      // Hydrate user row if there's an active session
      if (session?.user) {
        fetchUserRow(session.user.id).then((row) => {
          if (mounted) setUser(row);
        });
      }
    });

    // Handle sign-in / sign-out / token-refresh events going forward
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          fetchUserRow(session.user.id).then((row) => {
            if (mounted) setUser(row);
          });
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
