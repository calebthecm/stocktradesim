import { useState, useEffect } from 'react';
import { User } from '../services/supabase';
import { getCurrentUser } from '../services/supabase';
import { supabase } from '../services/supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getInitialUser = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setIsLoading(false);
    };

    getInitialUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
