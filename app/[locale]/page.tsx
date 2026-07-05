'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocaleRouter } from '@/lib/i18n';

export default function Home() {
  const router = useLocaleRouter();

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/dashboard');
        return;
      }
      // Pas de session : si l'URL contient un hash de lien magique
      // (#access_token=…), laisser /auth/confirm le parser. Sinon, un simple
      // visiteur qui veut se connecter doit arriver sur la page de LOGIN, pas
      // sur le spinner de confirmation (qui finit en « lien expiré »).
      const hasMagicHash =
        typeof window !== 'undefined' && window.location.hash.includes('access_token');
      router.replace(hasMagicHash ? '/auth/confirm' : '/dashboard/login');
    }
    checkAuth();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="text-gray-400 text-sm">Redirecting…</div>
    </div>
  );
}
