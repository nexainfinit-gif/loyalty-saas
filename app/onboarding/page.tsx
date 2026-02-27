'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function OnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);
    const name = form.get('name') as string;
    const color = form.get('color') as string;
    const slug = generateSlug(name);

    // Récupérer l'utilisateur connecté
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = '/dashboard';
      return;
    }

    // Créer le restaurant
    const { error } = await supabase
      .from('restaurants')
      .insert({
        name,
        slug,
        color,
        user_id: user.id,
      });

    if (error) {
      if (error.code === '23505') {
        setErrorMsg('Ce nom de restaurant existe déjà. Essayez un autre nom.');
      } else {
        setErrorMsg('Erreur lors de la création. Réessayez.');
      }
      setStatus('error');
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-lg">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-xl font-bold">Créer votre restaurant</h1>
          <p className="text-gray-500 text-sm mt-1">
            Configurez votre programme fidélité
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Nom du restaurant *
            </label>
            <input
              name="name"
              placeholder="Ex: Le Petit Bistro"
              required
              className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Couleur de la carte
            </label>
            <div className="flex gap-3 items-center">
              <input
                name="color"
                type="color"
                defaultValue="#e85d04"
                className="h-10 w-16 rounded-lg border cursor-pointer"
              />
              <span className="text-sm text-gray-500">
                Couleur principale de votre carte fidélité
              </span>
            </div>
          </div>

          {status === 'error' && (
            <p className="text-red-500 text-sm text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition hover:bg-gray-800"
          >
            {status === 'loading' ? 'Création...' : 'Créer mon restaurant'}
          </button>
        </form>
      </div>
    </div>
  );
}