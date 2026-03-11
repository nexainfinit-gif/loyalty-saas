'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PLAN_FEATURE_KEYS } from '@/lib/plan-features';

interface Plan {
  id: string;
  key: string;
  name: string;
  price_monthly: number | null;
  features: Record<string, boolean>;
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

export default function ChoosePlanPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Check if user already has active subscription → redirect to dashboard
  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/dashboard/login'); return; }

      const { data: resto } = await supabase
        .from('restaurants')
        .select('id, subscription_status')
        .eq('owner_id', session.user.id)
        .maybeSingle();

      if (!resto) { router.replace('/onboarding'); return; }
      if (resto.subscription_status === 'active') {
        router.replace('/dashboard');
        return;
      }
      setChecking(false);
    }
    check();
  }, [router]);

  // Load plans
  useEffect(() => {
    if (checking) return;
    fetch('/api/plans')
      .then(res => res.json())
      .then(data => {
        setPlans((data.plans ?? []).filter((p: Plan) => p.price_monthly && p.price_monthly > 0));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [checking]);

  async function selectPlan(plan: Plan) {
    setSelecting(plan.id);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      if (!session) { router.replace('/dashboard/login'); return; }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error || 'Erreur lors de la création du paiement.');
      setSelecting(null);
    } catch {
      setSelecting(null);
    }
  }

  if (checking || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center animate-fade-up">
          <div className="w-10 h-10 border-3 border-gray-200 border-t-primary-600 rounded-full animate-ds-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-100 opacity-30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl animate-fade-up">
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
            <p className="text-sm text-gray-500">Un abonnement est requis pour accéder à la plateforme.</p>
          </div>

          {/* Plans grid */}
          <div className="px-8 pb-8 pt-4">
            <div className={`grid gap-4 ${plans.length >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-sm mx-auto'}`}>
              {plans.map(plan => {
                const isSelecting = selecting === plan.id;
                const price = plan.price_monthly ?? 0;
                const isPopular = plan.key === 'pro';

                return (
                  <div
                    key={plan.id}
                    className={[
                      'relative rounded-2xl border-2 p-6 transition-all',
                      isPopular
                        ? 'border-primary-600 bg-primary-50/30'
                        : 'border-gray-200 bg-white',
                    ].join(' ')}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-primary-600 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                          Populaire
                        </span>
                      </div>
                    )}

                    <div className="mb-5">
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          {(price / 100).toFixed(0)}€
                        </span>
                        <span className="text-sm text-gray-500">/mois</span>
                      </div>
                    </div>

                    <ul className="space-y-2.5 mb-6">
                      {[...PLAN_FEATURE_KEYS].sort((a, b) => {
                        const ae = plan.features[a.key] ?? false;
                        const be = plan.features[b.key] ?? false;
                        return ae === be ? 0 : ae ? -1 : 1;
                      }).map(f => {
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

                    <button
                      onClick={() => selectPlan(plan)}
                      disabled={selecting !== null}
                      className={[
                        'w-full py-3 rounded-xl text-sm font-semibold transition-all',
                        isPopular
                          ? 'bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50',
                      ].join(' ')}
                    >
                      {isSelecting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-ds-spin" />
                          Redirection...
                        </span>
                      ) : (
                        `Commencer avec ${plan.name}`
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Plateforme de fidélité · ReBites
        </p>
      </div>
    </div>
  );
}
