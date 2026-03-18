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
      } else {
        router.replace('/auth/confirm');
      }
    }
    checkAuth();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="text-gray-400 text-sm">Redirecting…</div>
    </div>
  );
}
