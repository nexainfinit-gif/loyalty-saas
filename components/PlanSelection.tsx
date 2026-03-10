'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PLAN_FEATURE_KEYS } from '@/lib/plan-features';

interface Plan {
  id: string;
  key: string;
  name: string;
  price_monthly: number | null;
  features: Record<string, boolean>;
}

interface Props {
  restaurantId: string;
  accessToken: string;
  onComplete: () => void;
}

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success-600">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CROSS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PlanSelection({ restaurantId, accessToken, onComplete }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/plans')
      .then(res => res.json())
      .then(data => {
        setPlans(data.plans ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function selectPlan(plan: Plan) {
    setSelecting(plan.id);
    try {
      // Paid plans → redirect to Stripe Checkout
      if (plan.price_monthly && plan.price_monthly > 0) {
        // Refresh token to ensure it's not expired
        const { data: { session: freshSession } } = await supabase.auth.refreshSession();
        const token = freshSession?.access_token ?? accessToken;

        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ planId: plan.id }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        alert(data.error || 'Erreur lors de la création du paiement.');
        setSelecting(null);
        return;
      }

      // Free plan → direct selection
      await fetch('/api/select-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      onComplete();
    } catch {
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary-600 rounded-full animate-ds-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 animate-fade-up">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_16px_64px_rgba(0,0,0,0.12)] overflow-hidden">

          {/* Header */}
          <div className="text-center px-8 pt-8 pb-4">
            <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Choisissez votre plan</h2>
            <p className="text-sm text-gray-500">Vous pourrez changer à tout moment depuis les paramètres.</p>
          </div>

          {/* Plans grid */}
          <div className="px-8 pb-8 pt-4">
            <div className={`grid gap-4 ${plans.length >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-sm mx-auto'}`}>
              {plans.map(plan => {
                const isPro = plan.key !== 'free';
                const isSelecting = selecting === plan.id;
                const price = plan.price_monthly ?? 0;

                return (
                  <div
                    key={plan.id}
                    className={[
                      'relative rounded-2xl border-2 p-6 transition-all',
                      isPro
                        ? 'border-primary-600 bg-primary-50/30'
                        : 'border-gray-200 bg-white',
                    ].join(' ')}
                  >
                    {/* Popular badge */}
                    {isPro && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-primary-600 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                          Populaire
                        </span>
                      </div>
                    )}

                    {/* Plan name + price */}
                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          {price === 0 ? '0' : (price / 100).toFixed(0)}€
                        </span>
                        {price > 0 && <span className="text-sm text-gray-500">/mois</span>}
                        {price === 0 && <span className="text-sm text-gray-500">pour toujours</span>}
                      </div>
                    </div>

                    {/* Features list */}
                    <ul className="space-y-2.5 mb-6">
                      {PLAN_FEATURE_KEYS.map(f => {
                        const enabled = plan.features[f.key] ?? false;
                        return (
                          <li key={f.key} className="flex items-center gap-2.5">
                            {enabled ? CHECK : CROSS}
                            <span className={`text-sm ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                              {f.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => selectPlan(plan)}
                      disabled={selecting !== null}
                      className={[
                        'w-full py-3 rounded-xl text-sm font-semibold transition-all',
                        isPro
                          ? 'bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50',
                      ].join(' ')}
                    >
                      {isSelecting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-ds-spin" />
                          Sélection...
                        </span>
                      ) : isPro ? (
                        'Commencer avec Pro'
                      ) : (
                        'Commencer gratuitement'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
