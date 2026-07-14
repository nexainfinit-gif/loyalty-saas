'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * Acceptation d'invitation équipe — PAGE CLIENT.
 * L'auth de l'app vit en localStorage, donc on l'utilise ici (Bearer token)
 * au lieu des cookies serveur → plus de boucle de login. Si non connecté,
 * on renvoie au login avec ?redirect vers cette même page ; au retour, la
 * session localStorage est présente et l'acceptation se fait via POST Bearer.
 */
function AcceptFlow() {
  const { locale } = useParams() as { locale: string };
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<'working' | 'error' | 'success'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Lien d\'invitation invalide.'); return; }

    let cancelled = false;
    (async () => {
      // Session localStorage (jamais les cookies — cf. proxy.ts)
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) session = (await supabase.auth.refreshSession()).data.session;

      if (!session) {
        // Pas connecté → login, puis retour ICI (page client → pas de boucle)
        const here = `${window.location.origin}/${locale}/team/accept?token=${encodeURIComponent(token)}`;
        window.location.href = `/${locale}/dashboard/login?redirect=${encodeURIComponent(here)}`;
        return;
      }

      const res = await fetch('/api/team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ token }),
      });
      const j = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (res.ok) {
        // Bascule le dashboard sur l'établissement rejoint, puis va à l'agenda.
        if (j.restaurantId) {
          document.cookie = `selected_restaurant=${j.restaurantId}; path=/; max-age=31536000; samesite=lax`;
        }
        // Café/resto → scanner ; salon → agenda (renvoyé par l'API).
        const landing = j.landing === 'scanner' ? 'scanner' : 'appointments';
        setStatus('success');
        setTimeout(() => { window.location.href = `/${locale}/dashboard/${landing}?team_joined=success`; }, 900);
      } else if (j.needsLogin) {
        const here = `${window.location.origin}/${locale}/team/accept?token=${encodeURIComponent(token)}`;
        window.location.href = `/${locale}/dashboard/login?redirect=${encodeURIComponent(here)}`;
      } else {
        setStatus('error');
        setMessage(j.error || 'Impossible d\'accepter l\'invitation.');
      }
    })();

    return () => { cancelled = true; };
  }, [token, locale]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {status === 'working' && (
          <>
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-500">Validation de votre invitation…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Bienvenue dans l&apos;équipe !</h1>
            <p className="text-sm text-gray-500">Redirection vers votre espace…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Invitation non valide</h1>
            <p className="text-sm text-gray-500">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function TeamAcceptPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <AcceptFlow />
    </Suspense>
  );
}
