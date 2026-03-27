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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setIsLoading(false);
      if (session?.user) {
        fetchUserRow(session.user.id).then((row) => {
          if (mounted) setUser(row);
        });
      }
    });

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
