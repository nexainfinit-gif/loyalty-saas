'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AddToAppleWalletButton from '@/components/AddToAppleWalletButton';
import ReferralShareCard from '@/components/ReferralShareCard';
import { useTranslation } from '@/lib/i18n';
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Restaurant {
  id: string;
  name: string;
  primary_color: string;
  logo_url: string | null;
  city: string | null;
}

type Step = 'form' | 'success';

export default function RegisterPage() {
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
  const [walletUrl, setWalletUrl] = useState<string | null>(null);
  const [appleWalletUrl, setAppleWalletUrl] = useState<string | null>(null);
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
      if (
        turnstileRef.current &&
        (window as any).turnstile &&
        !turnstileRef.current.hasChildNodes()
      ) {
        (window as any).turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(null),
          theme: 'light',
        });
      }
    }

    if ((window as any).turnstile) {
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
      setErrorMsg(
        res.status === 409
          ? t('registerSlug.emailAlreadyRegistered')
          : data.error || t('register.genericError')
      );
      setStatus('error');
      return;
    }

    setCustomerName(first_name);
    setAppleWalletUrl(data.appleWalletUrl ?? null);
    if (data.referralCode) setReferralCode(data.referralCode);
    if (data.referralBonus) setReferralBonus(data.referralBonus);
    if (data.programType) setProgramType(data.programType);
    if (data.referralRewardAmount) setReferralRewardAmount(data.referralRewardAmount);
    const walletRes = await fetch(`/api/wallet/${data.customer_id}`);
    const walletData = await walletRes.json();
    if (walletData.walletUrl) setWalletUrl(walletData.walletUrl);
    setStep('success');
  }

  const color = restaurant?.primary_color ?? '#FF6B35';

  if (loadingResto) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FA' }}>
      <p style={{ color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif' }}>{t('registerSlug.loading')}</p>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FA', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '3rem', margin: '0 0 1rem' }}>🔍</p>
        <h2 style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>{t('registerSlug.notFound')}</h2>
        <p style={{ color: '#9CA3AF' }}>{t('registerSlug.invalidLink')}</p>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(160deg, ${color}18 0%, #F8F9FA 50%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
    }}>
      <div className="absolute top-3 right-3 z-10">
        <CompactLocaleSwitcher />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        * { box-sizing: border-box; }
        .field input[type="text"],
        .field input[type="email"],
        .field input[type="tel"],
        .field input[type="date"] {
          width: 100%;
          padding: 0.875rem 1rem;
          border-radius: 12px;
          border: 1.5px solid #E5E7EB;
          font-size: 0.9rem;
          font-family: 'DM Sans', sans-serif;
          background: white;
          transition: border-color 0.2s;
          outline: none;
        }
        .field input:focus { border-color: VAR_COLOR; }
        .submit-btn { transition: all 0.2s ease; }
        .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .card { animation: fadeUp 0.5s ease; }
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .success-icon { animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `.replace('VAR_COLOR', color)}</style>

      <div className="card" style={{
        background: 'white',
        borderRadius: '24px',
        overflow: 'hidden',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 8px 48px rgba(0,0,0,0.1)',
      }}>

        {/* Header */}
        <div style={{
          background: color,
          padding: '2rem',
          textAlign: 'center',
          position: 'relative',
        }}>
          {/* Pattern overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)',
          }} />

          {restaurant?.logo_url ? (
            <img src={restaurant.logo_url} alt={restaurant.name} style={{
              width: '64px', height: '64px', objectFit: 'contain',
              borderRadius: '16px', background: 'white', padding: '8px',
              margin: '0 auto 1rem', display: 'block',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }} />
          ) : (
            <div style={{
              width: '64px', height: '64px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', fontSize: '2rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }}>🍽️</div>
          )}

          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            color: 'white', fontSize: '1.4rem', fontWeight: 700,
            margin: '0 0 0.4rem', position: 'relative',
          }}>
            {step === 'form'
              ? t('registerSlug.programTitle')
              : t('registerSlug.welcomeName', { name: customerName })
            }
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', margin: 0, position: 'relative' }}>
            {step === 'form'
              ? restaurant?.name
              : t('registerSlug.confirmed')
            }
          </p>
        </div>

        {/* ── FORM ── */}
        {step === 'form' && (
          <div style={{ padding: '1.75rem' }}>
            <p style={{ textAlign: 'center', color: '#6B7280', fontSize: '0.875rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
              {t('registerSlug.joinProgram', { restaurant: restaurant?.name ?? '' })}
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Prénom */}
              <div className="field">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>
                  {t('registerSlug.firstName')}
                </label>
                <input name="first_name" type="text" placeholder={t('register.firstNamePlaceholder')} required />
              </div>

              {/* Email */}
              <div className="field">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>
                  {t('registerSlug.email')}
                </label>
                <input name="email" type="email" placeholder={t('register.emailPlaceholder')} required />
              </div>

              {/* Date de naissance */}
              <div className="field">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>
                  {t('registerSlug.birthday')}
                  <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: '0.25rem' }}>({t('registerSlug.birthdayHint')})</span>
                </label>
                <input name="birth_date" type="date" />
              </div>

              {/* Téléphone */}
              <div className="field">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.4rem' }}>
                  {t('registerSlug.phone')}
                  <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: '0.25rem' }}>({t('registerSlug.phoneOptional')})</span>
                </label>
                <input name="phone" type="tel" placeholder="+32 470 00 00 00" />
              </div>

              {/* Consentement RGPD */}
              <label style={{
                display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                background: '#F8F9FA', borderRadius: '12px', padding: '1rem',
                cursor: 'pointer', border: '1.5px solid #E5E7EB',
              }}>
                <input
                  name="consent_marketing"
                  type="checkbox"
                  required
                  style={{ marginTop: '2px', accentColor: color, width: '16px', height: '16px', flexShrink: 0 }}
                />
                <span style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.6 }}>
                  {t('registerSlug.consent', { restaurant: restaurant?.name ?? '' })}
                </span>
              </label>

              {/* Erreur */}
              {status === 'error' && (
                <p style={{
                  color: '#DC2626', fontSize: '0.82rem', textAlign: 'center',
                  background: '#FEF2F2', padding: '0.75rem', borderRadius: '10px', margin: 0,
                }}>
                  {errorMsg}
                </p>
              )}

              {/* Turnstile CAPTCHA */}
              {TURNSTILE_SITE_KEY && (
                <div
                  ref={turnstileRef}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: '0.25rem',
                  }}
                />
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="submit-btn"
                style={{
                  background: status === 'loading' ? '#D1D5DB' : color,
                  color: 'white', border: 'none',
                  padding: '1rem', borderRadius: '12px',
                  fontSize: '0.95rem', fontWeight: 700,
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  marginTop: '0.25rem',
                }}
              >
                {status === 'loading' ? t('registerSlug.submitting') : t('registerSlug.submitBtn')}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#9CA3AF', margin: 0 }}>
                {t('registerSlug.footer')}
              </p>
            </form>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div className="success-icon" style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: `${color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '2rem',
            }}>✓</div>

            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#111827' }}>
              {t('registerSlug.successTitle')}
            </h2>
            <p style={{ color: '#6B7280', fontSize: '0.875rem', lineHeight: 1.7, margin: '0 0 1.5rem' }}>
              {t('registerSlug.successMessage')}
            </p>

            {/* Wallet CTA */}
            <div style={{
              background: '#F8F9FA', borderRadius: '16px', padding: '1.25rem',
              marginBottom: '1rem', border: '1.5px solid #E5E7EB',
            }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', margin: '0 0 0.75rem' }}>
                {t('registerSlug.addToWalletTitle')}
              </p>
              {walletUrl ? (
              <a href={walletUrl} target="_blank" rel="noreferrer" style={{
                display: 'block', background: '#1a73e8', color: 'white',
                padding: '0.75rem', borderRadius: '10px', textAlign: 'center',
                fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none',
                marginBottom: appleWalletUrl ? '0.75rem' : '0',
              }}>
                {t('registerSlug.addToGoogleWallet')}
              </a>
            ) : (
              <p style={{ color: '#9CA3AF', fontSize: '0.8rem', textAlign: 'center' }}>
                {t('registerSlug.generatingCard')}
              </p>
            )}
            {appleWalletUrl && (() => {
              const applePassId = appleWalletUrl.split('/passes/')[1]?.split('/')[0] ?? null;
              return applePassId ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <AddToAppleWalletButton passId={applePassId} />
                </div>
              ) : null;
            })()}
            </div>

            <div style={{
              background: `${color}10`, borderRadius: '12px', padding: '1rem',
              border: `1.5px solid ${color}30`,
            }}>
              <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>
                {t('registerSlug.welcomePoints', { points: '10' })}
              </p>
            </div>

            {/* Referral bonus message */}
            {referralBonus != null && referralBonus > 0 && (
              <div style={{
                background: '#f0fdf4', borderRadius: '12px', padding: '1rem',
                border: '1.5px solid #bbf7d0', marginTop: '0.75rem',
              }}>
                <p style={{ fontSize: '0.82rem', color: '#15803d', margin: 0, lineHeight: 1.6, fontWeight: 600 }}>
                  {programType === 'stamps'
                    ? t('referral.referralBonusStamps', { amount: String(referralBonus) })
                    : t('referral.referralBonus', { amount: String(referralBonus) })
                  }
                </p>
              </div>
            )}

            {/* Referral share card */}
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
