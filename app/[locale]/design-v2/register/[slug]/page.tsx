'use client';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import ReferralShareCard from '@/components/ReferralShareCard';
import { useTranslation } from '@/lib/i18n';
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher';
import { Button, Input } from '@/components/ui-v2';

/* ─────────────────────────────────────────────────────────────
   Inscription client — version design v2 « Comptoir ».
   Parallèle : la page /register/[slug] existante n'est PAS touchée.
   Logique métier identique (API, Turnstile, parrainage, i18n).
   ───────────────────────────────────────────────────────────── */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; theme: string }) => void;
};
const getTurnstile = () => (window as Window & { turnstile?: TurnstileApi }).turnstile;

interface Restaurant {
  id: string;
  name: string;
  primary_color: string;
  logo_url: string | null;
  city: string | null;
}

type Step = 'form' | 'success';

/* Assombrit un hex de `pct`% (négatif = plus sombre) pour l'état survol. */
function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = 1 + pct / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * f);
  const g = clamp(((n >> 8) & 255) * f);
  const b = clamp((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* Texte lisible (ink foncé ou blanc) selon la luminance de la couleur. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1C1B19' : '#FFFFFF';
}

export default function RegisterPageV2() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const locale = (params.locale as string) ?? 'fr';
  const refCode = searchParams.get('ref');
  const { t } = useTranslation();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loadingResto, setLoadingResto] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralBonus, setReferralBonus] = useState<number | null>(null);
  const [programType, setProgramType] = useState<'points' | 'stamps'>('points');
  const [referralRewardAmount, setReferralRewardAmount] = useState<number | undefined>(undefined);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.appendChild(script);
    }
    function renderWidget() {
      const turnstile = getTurnstile();
      if (turnstileRef.current && turnstile && !turnstileRef.current.hasChildNodes()) {
        turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY!,
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(null),
          theme: 'light',
        });
      }
    }
    if (getTurnstile()) {
      renderWidget();
    } else {
      const script = document.getElementById(scriptId);
      script?.addEventListener('load', renderWidget);
      return () => script?.removeEventListener('load', renderWidget);
    }
  }, []);

  useEffect(() => {
    async function loadRestaurant() {
      const res = await fetch(`/api/register/${slug}/restaurant`);
      if (!res.ok) { setNotFound(true); setLoadingResto(false); return; }
      const data = await res.json();
      setRestaurant(data.restaurant);
      setLoadingResto(false);
    }
    if (slug) loadRestaurant();
  }, [slug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);
    const first_name = (form.get('first_name') as string).trim();
    const email = (form.get('email') as string).trim();
    const birth_date = form.get('birth_date') as string;
    const phone = (form.get('phone') as string).trim();
    const consent_marketing = form.get('consent_marketing') === 'on';

    if (!consent_marketing) {
      setErrorMsg(t('registerSlug.consentRequired'));
      setStatus('error');
      return;
    }

    const res = await fetch(`/api/register/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, email, birth_date: birth_date || null, phone: phone || null, consent_marketing, ...(captchaToken ? { captchaToken } : {}), ...(refCode ? { ref: refCode } : {}) }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(res.status === 409 ? t('registerSlug.emailAlreadyRegistered') : data.error || t('register.genericError'));
      setStatus('error');
      return;
    }

    setCustomerName(first_name);
    if (data.referralCode) setReferralCode(data.referralCode);
    if (data.referralBonus) setReferralBonus(data.referralBonus);
    if (data.programType) setProgramType(data.programType);
    if (data.referralRewardAmount) setReferralRewardAmount(data.referralRewardAmount);
    setStep('success');
  }

  const color = restaurant?.primary_color ?? '#4148D6';

  // Branding NFC : teinte la barre d'adresse iOS à la couleur de l'établissement.
  useEffect(() => {
    if (!restaurant?.primary_color) return;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const prev = meta.content;
    meta.content = restaurant.primary_color;
    return () => { if (meta) meta.content = prev; };
  }, [restaurant?.primary_color]);

  // Injecte la couleur de l'établissement comme accent du design system (scopé à la page).
  const accentVars = {
    '--v2-a-600': color,
    '--v2-a-700': shade(color, -14),
    '--v2-a-50': `${color}14`,
    '--v2-a-100': `${color}22`,
    '--v2-ring': `${color}2e`,
    '--v2-btn-bg': color,
    '--v2-btn-bg-h': shade(color, -14),
    '--v2-btn-fg': readableOn(color),
  } as CSSProperties;

  if (loadingResto) return (
    <div className="v2-reg__state">
      <p style={{ color: 'var(--v2-faint)' }}>{t('registerSlug.loading')}</p>
    </div>
  );

  if (notFound) return (
    <div className="v2-reg__state">
      <div>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--v2-faint)" strokeWidth="1.6" style={{ margin: '0 auto' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <h2>{t('registerSlug.notFound')}</h2>
        <p>{t('registerSlug.invalidLink')}</p>
      </div>
    </div>
  );

  return (
    <div className="v2-reg" style={accentVars}>
      {/* ── Panneau marque ── */}
      <div className="v2-reg__brand">
        <div className="v2-reg__logo">
          {restaurant?.logo_url
            ? <img src={restaurant.logo_url} alt={restaurant.name} />
            : (restaurant?.name ?? '★').charAt(0).toUpperCase()}
        </div>
        <h1 className="v2-reg__name">
          {step === 'form' ? restaurant?.name : t('registerSlug.welcomeName', { name: customerName })}
        </h1>
        <p className="v2-reg__tagline">
          {t('registerSlug.joinProgram', { restaurant: restaurant?.name ?? '' })}
          {restaurant?.city ? ` · ${restaurant.city}` : ''}
        </p>

        <div className="v2-reg__benefits">
          <div className="v2-reg__benefit">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" /></svg></span>
            <span>Cumulez des points à chaque visite</span>
          </div>
          <div className="v2-reg__benefit">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><path d="M12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg></span>
            <span>Des récompenses offertes rien que pour vous</span>
          </div>
          <div className="v2-reg__benefit">
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg></span>
            <span>Votre carte, directement dans Apple &amp; Google Wallet</span>
          </div>
        </div>
      </div>

      {/* ── Formulaire / succès ── */}
      <div className="v2-reg__formwrap">
        <div className="v2-reg__locale"><CompactLocaleSwitcher /></div>

        {step === 'form' && (
          <div className="v2-reg__form">
            <h2 className="v2-reg__h">{t('registerSlug.programTitle')}</h2>
            <p className="v2-reg__sub">{t('registerSlug.joinProgram', { restaurant: restaurant?.name ?? '' })}</p>

            <form onSubmit={handleSubmit} className="v2-reg__stack">
              <Input name="first_name" type="text" label={t('registerSlug.firstName')} placeholder={t('register.firstNamePlaceholder')} required maxLength={100} />
              <Input name="email" type="email" label={t('registerSlug.email')} placeholder={t('register.emailPlaceholder')} required />
              <Input name="birth_date" type="date" label={`${t('registerSlug.birthday')} `} />
              <Input name="phone" type="tel" label={`${t('registerSlug.phone')} `} placeholder="+32 470 00 00 00" />

              <label className="v2-reg__consent">
                <input name="consent_marketing" type="checkbox" required defaultChecked />
                <span>{t('registerSlug.consent', { restaurant: restaurant?.name ?? '' })}</span>
              </label>

              {status === 'error' && <p className="v2-reg__err">{errorMsg}</p>}

              {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="v2-reg__turnstile" />}

              <Button type="submit" variant="primary" className="v2-reg__submit" disabled={status === 'loading'}>
                {status === 'loading' ? t('registerSlug.submitting') : t('registerSlug.submitBtn')}
              </Button>

              <p className="v2-reg__foot">{t('registerSlug.footer')}</p>
            </form>
          </div>
        )}

        {step === 'success' && (
          <div className="v2-reg__success">
            <span className="v2-reg__check">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
            <h2>{t('registerSlug.successTitle')}</h2>
            <p>{t('registerSlug.successMessage')}</p>

            <div className="v2-reg__callout">
              <span className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              </span>
              <div>
                <div className="v2-reg__callout__t">{t('registerSlug.checkEmailTitle')}</div>
                <div className="v2-reg__callout__d">{t('registerSlug.checkEmailSpam')} — {t('registerSlug.spamTip')}</div>
              </div>
            </div>

            <div className="v2-reg__points">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" /></svg>
              <span>{t('registerSlug.welcomePoints', { points: '10' })}</span>
            </div>

            {referralBonus != null && referralBonus > 0 && (
              <div className="v2-reg__bonus">
                {programType === 'stamps'
                  ? t('referral.referralBonusStamps', { amount: String(referralBonus) })
                  : t('referral.referralBonus', { amount: String(referralBonus) })}
              </div>
            )}

            {referralCode && restaurant && (
              <ReferralShareCard
                referralCode={referralCode}
                restaurantSlug={slug}
                restaurantName={restaurant.name}
                restaurantColor={color}
                rewardAmount={referralRewardAmount}
                programType={programType}
                locale={locale}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
