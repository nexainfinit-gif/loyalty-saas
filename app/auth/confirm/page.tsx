'use client';
import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuth() {
      // Extraire le hash de l'URL
      const hash = window.location.hash;
      
      if (hash) {
        // Laisser Supabase parser le hash automatiquement
        const { data, error } = await supabase.auth.getSession();
        
        if (data.session) {
          router.replace('/dashboard');
          return;
        }

        // Si pas de session, attendre un peu et réessayer
        setTimeout(async () => {
          const { data: data2 } = await supabase.auth.getSession();
          if (data2.session) {
            router.replace('/dashboard');
          } else {
            router.replace('/dashboard/login');
          }
        }, 2000);
      }
    }

    handleAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-gray-600">Connexion en cours...</p>
      </div>
    </div>
  );
}