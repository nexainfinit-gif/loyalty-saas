'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail]   = useState('');
  const [otp, setOtp]       = useState('');
  const [step, setStep]     = useState<'email' | 'otp'>('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    } else {
      setStep('otp');
      setStatus('idle');
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'magiclink',
    });
    console.log('Session:', data.session);
    console.log('Erreur:', error);
    if (error) {
      setErrorMsg('Code invalide. Réessayez.');
      setStatus('error');
    } else {
      window.location.href = '/dashboard';
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-100 opacity-30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-gray-900 text-white text-2xl shadow-[0_4px_16px_rgba(17,24,39,0.15)] mb-4">
            🍽
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === 'email' ? 'Connexion sécurisée par email' : `Code envoyé à ${email}`}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Adresse email
                </label>
                <input
                  type="email"
                  placeholder="vous@restaurant.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors"
                />
              </div>

              {status === 'error' && (
                <div className="flex items-center gap-2 bg-danger-50 text-danger-700 text-sm px-3.5 py-2.5 rounded-xl">
                  <span>⚠️</span> {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {status === 'loading'
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-ds-spin" /> Envoi...</span>
                  : 'Recevoir mon code →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 text-center">
                  Code de connexion
                </label>
                <input
                  type="text"
                  placeholder="• • • • • • • •"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  maxLength={8}
                  required
                  className="w-full px-4 py-3 text-xl text-center font-mono tracking-[0.4em] bg-gray-50 border border-gray-200 rounded-xl placeholder:text-gray-300 transition-colors"
                />
                <p className="text-xs text-gray-400 text-center mt-2">
                  Vérifiez votre boîte mail
                </p>
              </div>

              {status === 'error' && (
                <div className="flex items-center gap-2 bg-danger-50 text-danger-700 text-sm px-3.5 py-2.5 rounded-xl">
                  <span>⚠️</span> {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {status === 'loading'
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-ds-spin" /> Vérification...</span>
                  : 'Se connecter'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('email'); setStatus('idle'); setOtp(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
              >
                ← Changer d&apos;adresse email
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Plateforme de fidélité pour restaurants · ReBites
        </p>
      </div>
    </div>
  );
}
