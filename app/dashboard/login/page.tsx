'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
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

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm shadow-lg w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📧</div>
            <h1 className="text-xl font-bold">Entrez votre code</h1>
            <p className="text-gray-500 text-sm mt-1">
              Code envoyé à <strong>{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <input
              type="text"
              placeholder="Code à 8 chiffres"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={8}
              required
              className="border rounded-lg px-3 py-2 text-sm w-full text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-black"
            />

            {status === 'error' && (
              <p className="text-red-500 text-sm text-center">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-black text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition hover:bg-gray-800"
            >
              {status === 'loading' ? 'Vérification...' : 'Se connecter'}
            </button>

            <button
              type="button"
              onClick={() => setStep('email')}
              className="w-full text-gray-500 text-sm"
            >
              Changer d&apos;email
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm shadow-lg w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-xl font-bold">Dashboard Restaurant</h1>
          <p className="text-gray-500 text-sm">Connexion sécurisée</p>
        </div>

        <form onSubmit={handleSendOtp} className="space-y-4">
          <input
            type="email"
            placeholder="Votre email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
          />

          {status === 'error' && (
            <p className="text-red-500 text-sm text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition hover:bg-gray-800"
          >
            {status === 'loading' ? 'Envoi...' : 'Recevoir mon code'}
          </button>
        </form>
      </div>
    </div>
  );
}