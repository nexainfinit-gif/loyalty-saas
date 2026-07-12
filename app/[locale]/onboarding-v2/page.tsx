'use client';
import '../design-v2/theme.css';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';
import { Button } from '@/components/ui-v2';

/**
 * Onboarding établissement — version design v2 « Comptoir » (parallèle, ne
 * remplace pas /onboarding). Même logique (session, ref affilié, resto
 * existant, création). Neutres chauds ; sous-marque Events préservée.
 */

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'salon_beaute', label: 'Salon de beauté' },
  { value: 'salon_coiffure', label: 'Salon de coiffure' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'autre', label: 'Autre' },
];

export default function OnboardingPageV2() {
  const router = useLocaleRouter();
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [businessType, setBusinessType] = useState('restaurant');
  const [customType, setCustomType] = useState('');
  const [mode, setMode] = useState<'business' | 'events' | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isAdditional, setIsAdditional] = useState(false);
  const [affiliateCode, setAffiliateCode] = useState('');

  const validateField = (name: string, value: string) => {
    let error = '';
    if (name === 'name' && !value.trim()) error = t('onboarding.nameRequired');
    if (name === 'email') {
      if (!value.trim()) error = t('onboarding.emailRequired');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = t('onboarding.emailInvalid');
    }
    if (name === 'city' && !value.trim()) error = t('onboarding.cityRequired');
    setFieldErrors((prev) => {
      if (!error) { const { [name]: _removed, ...rest } = prev; return rest; }
      return { ...prev, [name]: error };
    });
  };

  function generateSlug(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  useEffect(() => {
    async function checkExisting() {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        const code = ref.trim().toUpperCase();
        setAffiliateCode(code);
        sessionStorage.setItem('affiliate_ref', code);
      } else {
        const saved = sessionStorage.getItem('affiliate_ref');
        if (saved) setAffiliateCode(saved);
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/dashboard/login'); return; }
      const wantsAdditional = params.get('new') === '1';
      if (wantsAdditional) {
        setIsAdditional(true);
        setAuthEmail(session.user.email ?? '');
        setChecking(false);
        return;
      }
      const { data: existingRows } = await supabase
        .from('restaurants').select('id')
        .eq('owner_id', session.user.id).eq('is_demo', false)
        .order('created_at', { ascending: true }).limit(1);
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
    const final_business_type = mode === 'events' ? 'organisateur' : businessType === 'autre' ? customType.trim() : businessType;
    const products = mode === 'events' ? ['ticketing'] : ['loyalty', 'booking'];

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.push('/dashboard/login'); return; }

    try {
      const res = await fetch('/api/Restaurant/Create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name, slug, email, city, phone: phone || null,
          business_type: final_business_type, primary_color, products,
          additional: isAdditional, ...(affiliateCode ? { affiliateCode } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(res.status === 409 ? t('onboarding.slugTaken') : data.error || t('onboarding.createError'));
        setStatus('error');
        return;
      }
      sessionStorage.removeItem('affiliate_ref');
      if (isAdditional && data.restaurant?.id) {
        document.cookie = `selected_restaurant=${data.restaurant.id}; path=/; max-age=31536000; samesite=lax`;
      }
      window.location.href = `/${locale}/${mode === 'events' ? 'dashboard' : 'choose-plan'}`;
    } catch (err) {
      console.error('Create error:', err);
      setErrorMsg(t('onboarding.networkError'));
      setStatus('error');
    }
  }

  if (checking) {
    return (
      <div data-ui-v2="" className="v2-auth">
        <div className="v2-auth__in">
          <div className="v2-auth__brand">
            <div className="v2-skel" style={{ width: 54, height: 54, borderRadius: 15, margin: '0 auto 15px' }} />
            <div className="v2-skel" style={{ width: 160, height: 20, borderRadius: 6, margin: '0 auto 8px' }} />
            <div className="v2-skel" style={{ width: 200, height: 12, borderRadius: 6, margin: '0 auto' }} />
          </div>
          <div className="v2-auth__card flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="v2-skel" style={{ height: 42, borderRadius: 8 }} />)}
            <div className="v2-skel" style={{ height: 44, borderRadius: 8, marginTop: 4 }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Écran 1 : choix d'univers ── */
  if (!mode) {
    return (
      <div data-ui-v2="" className="v2-auth">
        <div className="v2-auth__in v2-ob__choice">
          <h1>{t('onboarding.chooseTitle')}</h1>
          <p className="sub">{t('onboarding.chooseSubtitle')}</p>
          <div className="v2-ob__opts">
            <button onClick={() => setMode('business')} className="v2-ob__opt">
              <span className="v2-ob__opt-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></svg>
              </span>
              <span>
                <span className="v2-ob__opt-t">{t('onboarding.chooseBusiness')}</span>
                <span className="v2-ob__opt-d">{t('onboarding.chooseBusinessDesc')}</span>
              </span>
            </button>
            <button onClick={() => setMode('events')} className="v2-ob__opt v2-ob__opt--events">
              <span className="v2-ob__opt-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V6a1 1 0 0 1 1-1z" /><path d="M15 5v14" strokeDasharray="2 2" /></svg>
              </span>
              <span>
                <span className="v2-ob__opt-t">{t('onboarding.chooseEvents')}</span>
                <span className="v2-ob__opt-d">{t('onboarding.chooseEventsDesc')}</span>
              </span>
            </button>
          </div>
          <p className="v2-ob__hint">{t('onboarding.chooseHint')}</p>
        </div>
      </div>
    );
  }

  const isEvents = mode === 'events';

  return (
    <div data-ui-v2="" className="v2-auth">
      <div className="v2-auth__in">
        <div className="v2-auth__brand">
          <button type="button" onClick={() => setMode(null)} className="v2-auth__back">←</button>
          <div className="v2-auth__icon" style={isEvents ? { background: '#16150F', color: '#C8FF2E' } : undefined}>
            {isEvents ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V6a1 1 0 0 1 1-1z" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" /></svg>
            )}
          </div>
          <h1>{isEvents ? t('onboarding.eventsTitle') : t('onboarding.title')}</h1>
          <p className="sub">{isEvents ? t('onboarding.eventsSubtitle') : t('onboarding.subtitle')}</p>
        </div>

        <div className="v2-auth__card">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="v2-field">
              <label className="v2-label">{t('onboarding.emailLabel')}</label>
              <input name="email" type="email" autoComplete="email" defaultValue={authEmail} placeholder="contact@moncommerce.be"
                required onBlur={(e) => validateField('email', e.target.value)}
                className={`v2-input${fieldErrors.email ? ' v2-input--err' : ''}`} />
              {fieldErrors.email && <p className="v2-fielderr">{fieldErrors.email}</p>}
            </div>

            <div className="v2-field">
              <label className="v2-label">{isEvents ? t('onboarding.orgNameLabel') : t('onboarding.nameLabel')}</label>
              <input name="name" autoComplete="organization" placeholder={isEvents ? 'Ex: Collectif Nova' : 'Ex: Le Petit Bistro'}
                required onBlur={(e) => validateField('name', e.target.value)}
                className={`v2-input${fieldErrors.name ? ' v2-input--err' : ''}`} />
              {fieldErrors.name && <p className="v2-fielderr">{fieldErrors.name}</p>}
            </div>

            {!isEvents && (
              <div className="v2-field">
                <label className="v2-label">{t('onboarding.typeLabel')}</label>
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="v2-select">
                  {BUSINESS_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
                </select>
              </div>
            )}

            {!isEvents && businessType === 'autre' && (
              <div className="v2-field">
                <label className="v2-label">Précisez votre activité *</label>
                <input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Ex: Boulangerie, Épicerie…" required className="v2-input" />
              </div>
            )}

            <div className="v2-field">
              <label className="v2-label">{t('onboarding.cityLabel')}</label>
              <input name="city" autoComplete="address-level2" placeholder="Ex: Bruxelles" required
                onBlur={(e) => validateField('city', e.target.value)}
                className={`v2-input${fieldErrors.city ? ' v2-input--err' : ''}`} />
              {fieldErrors.city && <p className="v2-fielderr">{fieldErrors.city}</p>}
            </div>

            <div className="v2-field">
              <label className="v2-label">{t('onboarding.phoneLabel')} <span style={{ color: 'var(--v2-faint)', fontWeight: 400 }}>{t('common.optional')}</span></label>
              <input name="phone" type="tel" autoComplete="tel" placeholder="Ex: +32 470 00 00 00" className="v2-input" />
            </div>

            <div className="v2-field">
              <label className="v2-label">{t('onboarding.colorLabel')}</label>
              <div className="flex items-center gap-3">
                <input name="color" type="color" defaultValue="#e85d04" className="v2-color" />
                <span style={{ fontSize: 12, color: 'var(--v2-faint)' }}>{t('onboarding.colorHint')}</span>
              </div>
            </div>

            {status === 'error' && <div className="v2-bk__notice v2-bk__notice--err">{errorMsg}</div>}

            <Button type="submit" variant="primary" className="v2-reg__submit" disabled={status === 'loading'} style={{ marginTop: 2 }}>
              {status === 'loading' ? t('onboarding.creating') : t('onboarding.createBtn')}
            </Button>
          </form>
        </div>

        <p className="v2-auth__foot">{t('metadata.platformSubtitle')}</p>
      </div>
    </div>
  );
}
