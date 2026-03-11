'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const BUSINESS_TYPES = [
  { value: 'restaurant', label: '🍽️ Restaurant' },
  { value: 'cafe', label: '☕ Café' },
  { value: 'salon_beaute', label: '💅 Salon de beauté' },
  { value: 'salon_coiffure', label: '💇 Salon de coiffure' },
  { value: 'boutique', label: '🛍️ Boutique' },
  { value: 'autre', label: '✏️ Autre' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [businessType, setBusinessType] = useState('restaurant');
  const [customType, setCustomType] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateField = (name: string, value: string) => {
    let error = '';
    if (name === 'name' && !value.trim()) error = 'Le nom est requis';
    if (name === 'email') {
      if (!value.trim()) error = "L'email est requis";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Email invalide';
    }
    if (name === 'city' && !value.trim()) error = 'La ville est requise';
    setFieldErrors((prev) => {
      if (!error) { const { [name]: _, ...rest } = prev; return rest; }
      return { ...prev, [name]: error };
    });
  };

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  useEffect(() => {
    async function checkExisting() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/dashboard/login');
        return;
      }
      const { data: existing } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', session.user.id)
        .single();
      if (existing) {
        window.location.href = '/choose-plan';
        return;
      }
      setAuthEmail(session.user.email ?? '');
      setChecking(false);
    }
    checkExisting();
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);
    const name = (form.get('name') as string).trim();
    const email = (form.get('email') as string).trim();
    const city = (form.get('city') as string).trim();
    const phone = (form.get('phone') as string).trim();
    const primary_color = form.get('color') as string;
    const slug = generateSlug(name);
    const final_business_type = businessType === 'autre' ? customType.trim() : businessType;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push('/dashboard/login');
      return;
    }

    try {
      const res = await fetch('/api/Restaurant/Create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name,
          slug,
          email,
          city,
          phone: phone || null,
          business_type: final_business_type,
          primary_color,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(
          res.status === 409
            ? 'Ce nom de commerce existe déjà. Essayez un autre nom.'
            : data.error || 'Erreur lors de la création. Réessayez.'
        );
        setStatus('error');
        return;
      }

      window.location.href = '/choose-plan';
    } catch (err) {
      console.error('Create error:', err);
      setErrorMsg('Erreur réseau. Réessayez.');
      setStatus('error');
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header skeleton */}
          <div className="bg-gray-900 rounded-t-2xl px-8 py-8 flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-xl animate-pulse" />
            <div className="h-5 w-40 bg-white/10 rounded-lg animate-pulse" />
            <div className="h-3 w-48 bg-white/10 rounded animate-pulse" />
          </div>
          {/* Form skeleton */}
          <div className="bg-white rounded-b-2xl border border-t-0 border-gray-100 p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-11 bg-gray-50 rounded-xl animate-pulse" />
              </div>
            ))}
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse mt-2" />
          </div>
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

      <div className="relative w-full max-w-md animate-fade-up">
        {/* Header */}
        <div className="bg-gray-900 rounded-t-2xl px-8 py-8 text-center">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
              <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Créer votre commerce</h1>
          <p className="text-sm text-white/60">Configurez votre programme fidélité</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Email du commerce *
              </label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={authEmail}
                placeholder="contact@moncommerce.be"
                required
                onBlur={(e) => validateField('email', e.target.value)}
                className={`w-full px-4 py-3 text-sm bg-gray-50 border rounded-xl placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none ${fieldErrors.email ? 'border-red-400' : 'border-gray-200'}`}
              />
              {fieldErrors.email && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>
              )}
            </div>

            {/* Nom */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Nom du commerce *
              </label>
              <input
                name="name"
                autoComplete="organization"
                placeholder="Ex: Le Petit Bistro"
                required
                onBlur={(e) => validateField('name', e.target.value)}
                className={`w-full px-4 py-3 text-sm bg-gray-50 border rounded-xl placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none ${fieldErrors.name ? 'border-red-400' : 'border-gray-200'}`}
              />
              {fieldErrors.name && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.name}</p>
              )}
            </div>

            {/* Type activité */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Type d&apos;activité *
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl transition-colors focus:border-gray-900 focus:outline-none"
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Champ custom si "autre" */}
            {businessType === 'autre' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Précisez votre activité *
                </label>
                <input
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder="Ex: Boulangerie, Épicerie..."
                  required
                  className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none"
                />
              </div>
            )}

            {/* Ville */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Ville *
              </label>
              <input
                name="city"
                autoComplete="address-level2"
                placeholder="Ex: Bruxelles"
                required
                onBlur={(e) => validateField('city', e.target.value)}
                className={`w-full px-4 py-3 text-sm bg-gray-50 border rounded-xl placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none ${fieldErrors.city ? 'border-red-400' : 'border-gray-200'}`}
              />
              {fieldErrors.city && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.city}</p>
              )}
            </div>

            {/* Téléphone */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Téléphone <span className="text-gray-400">(optionnel)</span>
              </label>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="Ex: +32 470 00 00 00"
                className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none"
              />
            </div>

            {/* Couleur */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Couleur principale
              </label>
              <div className="flex gap-3 items-center">
                <input
                  name="color"
                  type="color"
                  defaultValue="#e85d04"
                  className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer p-0.5"
                />
                <span className="text-xs text-gray-400">
                  Utilisée sur votre carte fidélité
                </span>
              </div>
            </div>

            {/* Erreur */}
            {status === 'error' && (
              <div className="flex items-center gap-2 bg-danger-50 text-danger-700 text-sm px-3.5 py-2.5 rounded-xl">
                <span>⚠️</span> {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-all mt-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {status === 'loading'
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-ds-spin" /> Création...</span>
                : 'Créer mon commerce →'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Plateforme de fidélité · ReBites
        </p>
      </div>
    </div>
  );
}
