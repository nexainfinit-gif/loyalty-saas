'use client';
import '../design-v2/theme.css';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';
import { Button, Input } from '@/components/ui-v2';

/**
 * Login propriétaire — version design v2 « Comptoir » (parallèle, ne remplace
 * pas /dashboard/login). Même flux OTP (email → code) et même routage
 * (redirect d'invitation, restaurant existant, membre d'équipe).
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const router = useLocaleRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const authError = searchParams.get('error');
  const [prevAuthError, setPrevAuthError] = useState<string | null>(null);
  if (authError && authError !== prevAuthError) {
    setPrevAuthError(authError);
    setErrorMsg(t('auth.linkExpired'));
    setStatus('error');
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendOtp = useCallback(async () => {
    setStatus('loading');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      setErrorMsg(t('auth.genericOtpSent') || 'Si un compte existe avec cet email, un code de connexion vous a été envoyé.');
    }
    setStep('otp');
    setStatus('idle');
    setCooldown(60);
  }, [email, t]);

  async function handleSendOtp(e: React.FormEvent) { e.preventDefault(); await sendOtp(); }
  async function handleResendOtp() { if (cooldown > 0) return; await sendOtp(); }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'magiclink' });
    if (error) {
      setErrorMsg(t('auth.codeInvalid'));
      setStatus('error');
      return;
    }
    const userId = data.session?.user?.id ?? data.user?.id ?? null;
    const redirectParam = new URLSearchParams(window.location.search).get('redirect');
    if (redirectParam && redirectParam.startsWith(window.location.origin)) {
      window.location.href = redirectParam;
      return;
    }
    let hasRestaurant = false;
    if (userId) {
      const { data: restos } = await supabase
        .from('restaurants').select('id').eq('owner_id', userId).eq('is_demo', false).limit(1);
      hasRestaurant = !!restos && restos.length > 0;
      if (!hasRestaurant) {
        const { data: tm } = await supabase.from('team_members').select('restaurant_id').eq('user_id', userId).limit(1);
        if (tm && tm.length > 0) {
          document.cookie = `selected_restaurant=${tm[0].restaurant_id}; path=/; max-age=31536000; samesite=lax`;
          window.location.href = `/${locale}/dashboard/appointments`;
          return;
        }
      }
    }
    window.location.href = `/${locale}/${hasRestaurant ? 'dashboard' : 'onboarding'}`;
  }

  return (
    <div className="v2-auth__in">
      <div className="v2-auth__brand">
        <div className="v2-auth__icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
          </svg>
        </div>
        <h1>{t('auth.dashboardTitle')}</h1>
        <p className="sub">{step === 'email' ? t('auth.secureLogin') : t('auth.codeSentTo', { email })}</p>
      </div>

      <div className="v2-auth__card">
        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <Input label={t('auth.emailLabel')} type="email" name="email" autoComplete="email"
              placeholder="vous@restaurant.com" value={email} onChange={e => setEmail(e.target.value)} required />
            {status === 'error' && <div className="v2-bk__notice v2-bk__notice--err">{errorMsg}</div>}
            <Button type="submit" variant="primary" className="v2-reg__submit" disabled={status === 'loading'}>
              {status === 'loading' ? t('auth.sending') : t('auth.sendCodeBtn')}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <div>
              <input type="text" autoComplete="one-time-code" placeholder="••••••••"
                value={otp} onChange={e => setOtp(e.target.value)} maxLength={8} required className="v2-auth__otp" />
              <p className="v2-auth__hint">{t('auth.checkEmail')}</p>
            </div>
            {status === 'error' && <div className="v2-bk__notice v2-bk__notice--err">{errorMsg}</div>}
            <Button type="submit" variant="primary" className="v2-reg__submit" disabled={status === 'loading'}>
              {status === 'loading' ? t('auth.verifying') : t('auth.loginBtn')}
            </Button>
            <button type="button" onClick={handleResendOtp} disabled={cooldown > 0 || status === 'loading'} className="v2-auth__resend">
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendBtn')}
            </button>
            <button type="button" onClick={() => { setStep('email'); setStatus('idle'); setOtp(''); setCooldown(0); }} className="v2-auth__change">
              ← {t('auth.changeEmail')}
            </button>
          </form>
        )}
      </div>

      <p className="v2-auth__foot">{t('metadata.platformSubtitle')}</p>
    </div>
  );
}

export default function LoginPageV2() {
  return (
    <div data-ui-v2="" className="v2-auth">
      <Suspense fallback={<div className="v2-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
