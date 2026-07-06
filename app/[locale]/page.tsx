'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/lib/i18n';

export default function Home() {
  const router = useLocaleRouter();

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Pas de session : lien magique (#access_token=…) → /auth/confirm le
        // parse ; sinon → page de LOGIN (jamais le spinner de confirmation).
        const hasMagicHash =
          typeof window !== 'undefined' && window.location.hash.includes('access_token');
        router.replace(hasMagicHash ? '/auth/confirm' : '/dashboard/login');
        return;
      }

      // Session active : email connu (a un restaurant réel) → dashboard,
      // sinon → onboarding. Décision unique et déterministe.
      const { data: restos } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', session.user.id)
        .eq('is_demo', false)
        .limit(1);
      router.replace(restos && restos.length > 0 ? '/dashboard' : '/onboarding');
    }
    checkAuth();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="text-gray-400 text-sm">Redirecting…</div>
    </div>
  );
}
