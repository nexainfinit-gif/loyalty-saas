'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

const BUSINESS_TYPES_KEYS = [
  { value: 'restaurant', label: '🍽️ Restaurant' },
  { value: 'cafe', label: '☕ Café' },
  { value: 'salon_beaute', label: '💅 Salon de beauté' },
  { value: 'salon_coiffure', label: '💇 Salon de coiffure' },
  { value: 'boutique', label: '🛍️ Boutique' },
  { value: 'autre', label: '✏️ Autre' },
];

export default function OnboardingPage() {
  const router = useLocaleRouter();
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [businessType, setBusinessType] = useState('restaurant');
  const [customType, setCustomType] = useState('');
  // Deux univers DISSOCIÉS (T0.5) : commerce (fidélité + réservations) ou
  // organisateur d'événements (Rebites Events, billetterie seule). Le profil
  // produit est implicite — les autres services s'activent plus tard depuis
  // les Paramètres, pas à l'inscription.
  const [mode, setMode] = useState<'business' | 'events' | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // ?new=1 : création d'un établissement SUPPLÉMENTAIRE depuis le sélecteur
  // du dashboard — on saute la redirection « déjà un établissement ».
  const [isAdditional, setIsAdditional] = useState(false);

  const validateField = (name: string, value: string) => {
    let error = '';
    if (name === 'name' && !value.trim()) error = t('onboarding.nameRequired');
    if (name === 'email') {
      if (!value.trim()) error = t('onboarding.emailRequired');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = t('onboarding.emailInvalid');
    }
    if (name === 'city' && !value.trim()) error = t('onboarding.cityRequired');
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
      const wantsAdditional = new URLSearchParams(window.location.search).get('new') === '1';
      if (wantsAdditional) {
        setIsAdditional(true);
        setAuthEmail(session.user.email ?? '');
        setChecking(false);
        return;
      }
      // Même pattern robuste que le dashboard (commit 81a8d97) : un owner peut
      // posséder plusieurs restaurants (démos + réel). .maybeSingle() PLANTE
      // sur >1 ligne → l'onboarding croyait à tort qu'aucun resto n'existait et
      // piégeait l'utilisateur sur le formulaire. On prend le 1er resto RÉEL.
      const { data: existingRows } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', session.user.id)
        .eq('is_demo', false)
        .order('created_at', { ascending: true })
        .limit(1);
      if (existingRows && existingRows.length > 0) {
        window.location.href = `/${locale}/choose-plan`;
        return;
      }
      setAuthEmail(session.user.email ?? '');
      setChecking(false);
    }
    checkExisting();
  }, [router, locale]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mode) return;
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);
    const name = (form.get('name') as string).trim();
    const email = (form.get('email') as string).trim();
    const city = (form.get('city') as string).trim();
    const phone = (form.get('phone') as string).trim();
    const primary_color = form.get('color') as string;
    const slug = generateSlug(name);
    const final_business_type = mode === 'events'
      ? 'organisateur'
      : businessType === 'autre' ? customType.trim() : businessType;
    const products = mode === 'events' ? ['ticketing'] : ['loyalty', 'booking'];

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
          products,
          additional: isAdditional,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(
          res.status === 409
            ? t('onboarding.slugTaken')
            : data.error || t('onboarding.createError')
        );
        setStatus('error');
        return;
      }

      if (isAdditional && data.restaurant?.id) {
        // Bascule sur le nouvel établissement (même cookie que le sélecteur).
        document.cookie = `selected_restaurant=${data.restaurant.id}; path=/; max-age=31536000; samesite=lax`;
      }
      // Rebites Events = plan gratuit (commission par billet) : accès
      // direct au dashboard, pas de choix de plan payant.
      window.location.href = `/${locale}/${mode === 'events' ? 'dashboard' : 'choose-plan'}`;
    } catch (err) {
      console.error('Create error:', err);
      setErrorMsg(t('onboarding.networkError'));
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

  /* ── Écran 1 : choix d'univers (deux plateformes dissociées) ── */
  if (!mode) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-100 opacity-40 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-100 opacity-30 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md animate-fade-up text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('onboarding.chooseTitle')}</h1>
          <p className="text-sm text-gray-500 mb-6">{t('onboarding.chooseSubtitle')}</p>
          <div className="space-y-3">
            <button
              onClick={() => setMode('business')}
              className="w-full bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6 text-left hover:border-gray-900 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-2xl flex-shrink-0">🏪</div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-900">{t('onboarding.chooseBusiness')}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{t('onboarding.chooseBusinessDesc')}</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setMode('events')}
              className="w-full bg-gray-900 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.15)] p-6 text-left hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl flex-shrink-0">🎟️</div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-white">{t('onboarding.chooseEvents')}</p>
                  <p className="text-sm text-white/60 mt-0.5">{t('onboarding.chooseEventsDesc')}</p>
                </div>
              </div>
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-5">{t('onboarding.chooseHint')}</p>
        </div>
      </div>
    );
  }

  const isEvents = mode === 'events';

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-100 opacity-30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        {/* Header — branding par univers */}
        <div className="bg-gray-900 rounded-t-2xl px-8 py-8 text-center relative">
          <button
            type="button"
            onClick={() => setMode(null)}
            className="absolute left-4 top-4 text-white/50 hover:text-white text-xs transition-colors"
          >
            ←
          </button>
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            {isEvents ? (
              <span className="text-2xl">🎟️</span>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
              </svg>
            )}
          </div>
          <h1 className="text-xl font-bold text-white mb-1">
            {isEvents ? t('onboarding.eventsTitle') : t('onboarding.title')}
          </h1>
          <p className="text-sm text-white/60">
            {isEvents ? t('onboarding.eventsSubtitle') : t('onboarding.subtitle')}
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {t('onboarding.emailLabel')}
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
                {isEvents ? t('onboarding.orgNameLabel') : t('onboarding.nameLabel')}
              </label>
              <input
                name="name"
                autoComplete="organization"
                placeholder={isEvents ? 'Ex: Collectif Nova' : 'Ex: Le Petit Bistro'}
                required
                onBlur={(e) => validateField('name', e.target.value)}
                className={`w-full px-4 py-3 text-sm bg-gray-50 border rounded-xl placeholder:text-gray-400 transition-colors focus:border-gray-900 focus:outline-none ${fieldErrors.name ? 'border-red-400' : 'border-gray-200'}`}
              />
              {fieldErrors.name && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.name}</p>
              )}
            </div>

            {/* Type activité — implicite (« organisateur ») côté Events */}
            {!isEvents && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {t('onboarding.typeLabel')}
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl transition-colors focus:border-gray-900 focus:outline-none"
              >
                {BUSINESS_TYPES_KEYS.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            </div>
            )}

            {/* Champ custom si "autre" */}
            {!isEvents && businessType === 'autre' && (
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
                {t('onboarding.cityLabel')}
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
                {t('onboarding.phoneLabel')} <span className="text-gray-400">{t('common.optional')}</span>
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
                {t('onboarding.colorLabel')}
              </label>
              <div className="flex gap-3 items-center">
                <input
                  name="color"
                  type="color"
                  defaultValue="#e85d04"
                  className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer p-0.5"
                />
                <span className="text-xs text-gray-400">
                  {t('onboarding.colorHint')}
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
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-ds-spin" /> {t('onboarding.creating')}</span>
                : t('onboarding.createBtn')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          {t('metadata.platformSubtitle')}
        </p>
      </div>
    </div>
  );
}
