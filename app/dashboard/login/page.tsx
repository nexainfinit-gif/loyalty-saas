'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');

    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-lg w-full">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-xl font-bold mb-2">Vérifiez vos emails !</h1>
          <p className="text-gray-500 text-sm">
            Un lien de connexion a été envoyé à<br />
            <strong>{email}</strong>
          </p>
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
          <p className="text-gray-500 text-sm">Connexion par magic link</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Votre email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition hover:bg-gray-800"
          >
            {status === 'loading' ? 'Envoi...' : 'Recevoir le lien de connexion'}
          </button>
        </form>
      </div>
    </div>
  );
}