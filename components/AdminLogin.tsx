'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { supabase as ssrClient } from '@/lib/supabase-browser';

interface Props {
  onAuthenticated: () => void;
}

export default function AdminLogin({ onAuthenticated }: Props) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    async function clearStaleSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.signOut();
        await ssrClient.auth.signOut();
      }
      setReady(true);
    }
    clearStaleSession();
  }, []);

  const sendOtp = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      setErrorMsg('Erreur lors de l\'envoi. Vérifiez votre email.');
      setStatus('error');
      return;
    }
    setStep('otp');
    setStatus('idle');
    setCooldown(60);
  }, [email]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error || !data.session) {
      setErrorMsg('Code invalide ou expiré.');
      setStatus('error');
      return;
    }
    await ssrClient.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    await new Promise(r => setTimeout(r, 300));
    onAuthenticated();
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-white/10 mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white">Administration Rebites</h1>
          <p className="text-sm text-gray-400 mt-1">
            {step === 'email' ? 'Connexion réservée aux administrateurs' : `Code envoyé à ${email}`}
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur rounded-2xl p-6 border border-white/10">
          {step === 'email' ? (
            <form onSubmit={e => { e.preventDefault(); sendOtp(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email administrateur</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@rebites.be"
                  className="w-full px-4 py-3 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 outline-none"
                />
              </div>
              {status === 'error' && (
                <p className="text-sm text-red-400">{errorMsg}</p>
              )}
              <button type="submit" disabled={status === 'loading'}
                className="w-full bg-white text-gray-900 py-3 rounded-xl text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {status === 'loading' ? 'Envoi...' : 'Recevoir le code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 text-center">Code de vérification</label>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  maxLength={8}
                  required
                  placeholder="• • • • • •"
                  className="w-full px-4 py-3 text-xl text-center font-mono tracking-[0.3em] bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-600 focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 outline-none"
                />
              </div>
              {status === 'error' && (
                <p className="text-sm text-red-400 text-center">{errorMsg}</p>
              )}
              <button type="submit" disabled={status === 'loading'}
                className="w-full bg-white text-gray-900 py-3 rounded-xl text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {status === 'loading' ? 'Vérification...' : 'Se connecter'}
              </button>
              <button type="button" onClick={() => { if (cooldown <= 0) sendOtp(); }}
                disabled={cooldown > 0}
                className="w-full text-sm text-gray-400 hover:text-white disabled:text-gray-600 transition-colors py-1">
                {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : 'Renvoyer le code'}
              </button>
              <button type="button" onClick={() => { setStep('email'); setStatus('idle'); setOtp(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors py-1">
                ← Changer d'email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
