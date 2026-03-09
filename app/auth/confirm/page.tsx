'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthConfirmPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 5;

    async function tryGetSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace('/dashboard');
        return true;
      }
      return false;
    }

    async function handleAuth() {
      const hash = window.location.hash;
      if (!hash) {
        setFailed(true);
        return;
      }

      // Try immediately — Supabase may have already parsed the hash
      if (await tryGetSession()) return;

      // Retry a few times with short intervals
      const interval = setInterval(async () => {
        attempts++;
        if (await tryGetSession()) {
          clearInterval(interval);
          return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setFailed(true);
        }
      }, 1000);

      return () => clearInterval(interval);
    }

    handleAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center animate-fade-up">
        {failed ? (
          <>
            <p className="text-sm text-gray-600 mb-4">Le lien a expiré ou est invalide.</p>
            <button
              onClick={() => router.replace('/dashboard/login')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              Retour à la connexion →
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary-600 rounded-full animate-ds-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Connexion en cours...</p>
          </>
        )}
      </div>
    </div>
  );
}
