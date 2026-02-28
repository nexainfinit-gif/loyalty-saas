'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const BUSINESS_TYPES = [
  { value: 'restaurant', label: '🍽️ Restaurant' },
  { value: 'cafe', label: '☕ Café' },
  { value: 'salon', label: '💇 Salon' },
  { value: 'autre', label: '✏️ Autre' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [businessType, setBusinessType] = useState('restaurant');
  const [customType, setCustomType] = useState('');

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
      const { data: existing } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', session.user.id)
        .single();
      if (existing) window.location.href = '/dashboard';
    }
    checkExisting();
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);
    const name = (form.get('name') as string).trim();
    const email = (form.get('email') as string).trim();
    const city = (form.get('city') as string).trim();
    const phone = (form.get('phone') as string).trim();
    const primary_color = form.get('color') as string;
    const slug = generateSlug(name);
    const final_business_type = businessType === 'autre' ? customType.trim() : businessType;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push('/dashboard/login');
      return;
    }

    // Vérifie si restaurant existe déjà
    const { data: existingResto } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', session.user.id)
      .single();
    if (existingResto) {
      window.location.href = '/dashboard';
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(
          res.status === 409
            ? 'Ce nom de commerce existe déjà. Essayez un autre nom.'
            : data.error || 'Erreur lors de la création. Réessayez.'
        );
        setStatus('error');
        return;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Create error:', err);
      setErrorMsg('Erreur réseau. Réessayez.');
      setStatus('error');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fafafa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:wght@700&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .form-card { animation: fadeUp 0.5s ease; }
        .field input, .field select {
          width: 100%;
          padding: 0.875rem 1rem;
          border-radius: 12px;
          border: 1.5px solid #e5e5e5;
          font-size: 0.9rem;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          box-sizing: border-box;
          background: white;
          transition: border-color 0.2s;
        }
        .field input:focus, .field select:focus { border-color: #111; }
        .submit-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .submit-btn { transition: all 0.2s ease; }
      `}</style>

      <div className="form-card" style={{
        background: 'white',
        borderRadius: '24px',
        overflow: 'hidden',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 4px 40px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ background: '#111', padding: '2rem', textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem', fontSize: '1.5rem',
          }}>🍽️</div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            color: 'white', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem',
          }}>Créer votre commerce</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: 0 }}>
            Configurez votre programme fidélité
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

            {/* Email */}
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Email du commerce *
              </label>
              <input name="email" type="email" placeholder="contact@moncommerce.be" required />
            </div>

            {/* Nom */}
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Nom du commerce *
              </label>
              <input name="name" placeholder="Ex: Le Petit Bistro" required />
            </div>

            {/* Type activité */}
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Type d&apos;activité *
              </label>
              <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Champ custom si "autre" */}
            {businessType === 'autre' && (
              <div className="field">
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                  Précisez votre activité *
                </label>
                <input
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder="Ex: Boulangerie, Épicerie..."
                  required
                />
              </div>
            )}

            {/* Ville */}
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Ville *
              </label>
              <input name="city" placeholder="Ex: Bruxelles" required />
            </div>

            {/* Téléphone */}
            <div className="field">
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Téléphone <span style={{ color: '#bbb' }}>(optionnel)</span>
              </label>
              <input name="phone" type="tel" placeholder="Ex: +32 470 00 00 00" />
            </div>

            {/* Couleur */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Couleur principale
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  name="color"
                  type="color"
                  defaultValue="#e85d04"
                  style={{ width: '48px', height: '48px', borderRadius: '10px', border: '1.5px solid #e5e5e5', cursor: 'pointer', padding: '2px' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#999' }}>
                  Utilisée sur votre carte fidélité
                </span>
              </div>
            </div>

            {/* Erreur */}
            {status === 'error' && (
              <p style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center', background: '#fef2f2', padding: '0.75rem', borderRadius: '10px', margin: 0 }}>
                {errorMsg}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="submit-btn"
              style={{
                background: status === 'loading' ? '#ccc' : '#111',
                color: 'white', border: 'none',
                padding: '1rem', borderRadius: '12px',
                fontSize: '0.95rem', fontWeight: 600,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                marginTop: '0.5rem',
              }}
            >
              {status === 'loading' ? '⏳ Création...' : '✨ Créer mon commerce'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
