'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/lib/i18n';

/**
 * Hook that checks if the current user has an active subscription.
 * Redirects to /choose-plan if not.
 * Returns { ready: boolean } — render nothing until ready is true.
 */
export function useSubscriptionGate() {
  const router = useLocaleRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/dashboard/login'); return; }

      const { data: resto } = await supabase
        .from('restaurants')
        .select('subscription_status')
        .eq('owner_id', session.user.id)
        .maybeSingle();

      if (!resto || resto.subscription_status !== 'active') {
        router.replace('/choose-plan');
        return;
      }
      setReady(true);
    }
    check();
  }, [router]);

  return { ready };
}
