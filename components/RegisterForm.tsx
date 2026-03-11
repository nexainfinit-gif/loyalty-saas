'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'react-qr-code';
import AddToAppleWalletButton from '@/components/AddToAppleWalletButton';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  color: string;
  logo_url: string | null;
}

export default function RegisterForm({ restaurant }: { restaurant: Restaurant }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<{
    qrToken: string;
    customerName: string;
    restaurantName: string;
    walletLink: string | null;
    appleWalletUrl?: string | null;
  } | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
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

    // If script already loaded, render immediately; otherwise wait for load
    if ((window as any).turnstile) {
      renderWidget();
    } else {
      const script = document.getElementById(scriptId);
      script?.addEventListener('load', renderWidget);
      return () => script?.removeEventListener('load', renderWidget);
    }
  }, []);

  const validateField = (name: string, value: string) => {
    let error = '';
    if (name === 'firstName' && !value.trim()) error = 'Le prénom est requis';
    if (name === 'lastName' && !value.trim()) error = 'Le nom est requis';
    if (name === 'email') {
      if (!value.trim()) error = "L'email est requis";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Email invalide';
    }
    setFieldErrors((prev) => {
      if (!error) { const { [name]: _, ...rest } = prev; return rest; }
      return { ...prev, [name]: error };
    });
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantSlug: restaurant.slug,
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        email: form.get('email'),
        birthDate: form.get('birthDate') || null,
        postalCode: form.get('postalCode') || null,
        marketingConsent: form.get('marketingConsent') === 'on',
        ...(captchaToken ? { captchaToken } : {}),
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setSuccessData(data);
      setStatus('success');
    } else {
      setErrorMsg(data.error || 'Une erreur est survenue.');
      setStatus('error');
    }
  }

  if (status === 'success' && successData) {
    const scanUrl = `${window.location.origin}/api/scan/${successData.qrToken}`;

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
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
          .success-card { animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
          .fade-up-1 { animation: fadeUp 0.6s ease forwards; }
          .fade-up-2 { animation: fadeUp 0.6s ease 0.1s forwards; opacity: 0; }
          .fade-up-3 { animation: fadeUp 0.6s ease 0.2s forwards; opacity: 0; }
          .fade-up-4 { animation: fadeUp 0.6s ease 0.3s forwards; opacity: 0; }
          .wallet-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; }
          .wallet-btn { transition: all 0.2s ease; }
        `}</style>
        

        <div className="success-card" style={{
          background: 'white',
          borderRadius: '24px',
          padding: '2.5rem',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 4px 40px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}>
          {/* Badge succès */}
          <div className="fade-up-1" style={{
            width: '64px',
            height: '64px',
            background: `${restaurant.color}15`,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <span style={{ fontSize: '2rem' }}>✓</span>
          </div>

          <h1 className="fade-up-1" style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.8rem',
            fontWeight: 700,
            color: '#111',
            margin: '0 0 0.5rem',
          }}>
            Bienvenue !
          </h1>

          <p className="fade-up-2" style={{
            color: '#888',
            fontSize: '0.95rem',
            margin: '0 0 0.25rem',
          }}>
            {successData.customerName}
          </p>

          <p className="fade-up-2" style={{
            color: '#555',
            fontSize: '0.9rem',
            margin: '0 0 2rem',
          }}>
            Membre fidélité · <strong style={{ color: restaurant.color }}>{successData.restaurantName}</strong>
          </p>

          {/* QR Code */}
          <div className="fade-up-3" style={{
            background: '#fafafa',
            borderRadius: '16px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: `2px solid ${restaurant.color}20`,
          }}>
            <QRCode
              value={scanUrl}
              size={240}
              level="M"
              style={{ width: '240px', height: '240px' }}
            />
            <p style={{
              color: '#888',
              fontSize: '0.75rem',
              margin: '1rem 0 0',
              lineHeight: 1.5,
            }}>
              Présentez ce QR code à chaque visite<br />pour gagner des points
            </p>
          </div>

          {/* Boutons Wallet */}
          {(successData.walletLink || successData.appleWalletUrl) && (
            <div className="fade-up-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {successData.walletLink && (
                <a
                  href={successData.walletLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wallet-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    background: '#000',
                    color: 'white',
                    padding: '0.875rem 1.5rem',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                  </svg>
                  Ajouter à Google Wallet
                </a>
              )}
              {successData.appleWalletUrl && (() => {
                const applePassId = successData.appleWalletUrl!.split('/passes/')[1]?.split('/')[0] ?? null;
                return applePassId ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <AddToAppleWalletButton passId={applePassId} />
                  </div>
                ) : null;
              })()}
            </div>
          )}

          <p className="fade-up-4" style={{
            color: '#aaa',
            fontSize: '0.75rem',
            margin: 0,
          }}>
            Un email avec votre QR code vous a été envoyé
          </p>
        </div>
      </div>
    );
  }

  const inputStyle = (field: string) => ({
    width: '100%',
    padding: '0.875rem 1rem',
    borderRadius: '12px',
    border: `1.5px solid ${focusedField === field ? restaurant.color : '#e5e5e5'}`,
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    background: 'white',
    color: '#111',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box' as const,
  });

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
        .submit-btn:hover:not(:disabled) { 
          transform: translateY(-1px); 
          box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
        }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        .submit-btn { transition: all 0.2s ease; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; }
        ::placeholder { color: #bbb; }
      `}</style>

      <div className="form-card" style={{
        background: 'white',
        borderRadius: '24px',
        overflow: 'hidden',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 4px 40px rgba(0,0,0,0.08)',
      }}>

        {/* Header coloré */}
        <div style={{
          background: restaurant.color,
          padding: '2rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Cercles décoratifs */}
          <div style={{
            position: 'absolute',
            top: '-30px',
            right: '-30px',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-20px',
            left: '-20px',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }} />

          {restaurant.logo_url ? (
  <img
    src={restaurant.logo_url}
    alt={restaurant.name}
    style={{
      width: '72px', height: '72px', objectFit: 'contain',
      borderRadius: '16px', margin: '0 auto 1rem',
      background: 'rgba(255,255,255,0.2)',
      padding: '8px',
      display: 'block',
    }}
  />
) : (
  <div style={{
    width: '48px', height: '48px',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 1rem', fontSize: '1.5rem',
  }}>
    🍽️
  </div>
)}

          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 700,
            margin: '0 0 0.25rem',
          }}>
            {restaurant.name}
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.8)',
            fontSize: '0.85rem',
            margin: 0,
            fontWeight: 300,
          }}>
            Programme de fidélité
          </p>
        </div>

        {/* Formulaire */}
        <div style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Prénom + Nom */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                  Prénom *
                </label>
                <input
                  name="firstName"
                  autoComplete="given-name"
                  placeholder="Jean"
                  required
                  style={{
                    ...inputStyle('firstName'),
                    ...(fieldErrors.firstName ? { borderColor: '#ef4444' } : {}),
                  }}
                  onFocus={() => setFocusedField('firstName')}
                  onBlur={(e) => { setFocusedField(null); validateField('firstName', e.target.value); }}
                />
                {fieldErrors.firstName && (
                  <p style={{ color: '#ef4444', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>{fieldErrors.firstName}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                  Nom *
                </label>
                <input
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="Dupont"
                  required
                  style={{
                    ...inputStyle('lastName'),
                    ...(fieldErrors.lastName ? { borderColor: '#ef4444' } : {}),
                  }}
                  onFocus={() => setFocusedField('lastName')}
                  onBlur={(e) => { setFocusedField(null); validateField('lastName', e.target.value); }}
                />
                {fieldErrors.lastName && (
                  <p style={{ color: '#ef4444', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>{fieldErrors.lastName}</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                Email *
              </label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="jean@exemple.com"
                required
                style={{
                  ...inputStyle('email'),
                  ...(fieldErrors.email ? { borderColor: '#ef4444' } : {}),
                }}
                onFocus={() => setFocusedField('email')}
                onBlur={(e) => { setFocusedField(null); validateField('email', e.target.value); }}
              />
              {fieldErrors.email && (
                <p style={{ color: '#ef4444', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>{fieldErrors.email}</p>
              )}
            </div>

            {/* Date de naissance + Code postal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                  Anniversaire
                </label>
                <input
                  name="birthDate"
                  type="date"
                  autoComplete="bday"
                  style={inputStyle('birthDate')}
                  onFocus={() => setFocusedField('birthDate')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#666', display: 'block', marginBottom: '0.4rem' }}>
                  Code postal
                </label>
                <input
                  name="postalCode"
                  autoComplete="postal-code"
                  placeholder="1000"
                  style={inputStyle('postalCode')}
                  onFocus={() => setFocusedField('postalCode')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>

            {/* Consentement RGPD */}
            <label style={{
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: '0.75rem',
              background: '#f9f9f9',
              borderRadius: '10px',
              marginTop: '0.25rem',
            }}>
              <input
                name="marketingConsent"
                type="checkbox"
                required
                style={{ marginTop: '2px', accentColor: restaurant.color, flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.75rem', color: '#777', lineHeight: 1.5 }}>
                J&apos;accepte de recevoir des offres et actualités.
                Données traitées conformément au RGPD. Voir notre{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: restaurant.color, fontWeight: 500, textDecoration: 'underline' }}>
                  politique de confidentialité
                </a>. *
              </span>
            </label>

            {status === 'error' && (
              <p style={{
                color: '#ef4444',
                fontSize: '0.85rem',
                textAlign: 'center',
                background: '#fef2f2',
                padding: '0.75rem',
                borderRadius: '10px',
                margin: 0,
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

            {/* Bouton submit */}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="submit-btn"
              style={{
                background: status === 'loading' ? '#ccc' : restaurant.color,
                color: 'white',
                border: 'none',
                padding: '1rem',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                marginTop: '0.5rem',
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: status === 'loading' ? 'none' : `0 4px 12px ${restaurant.color}40`,
              }}
            >
              {status === 'loading' ? '⏳ Inscription...' : '✨ Obtenir ma carte fidélité'}
            </button>
          </form>

          {/* Footer */}
          <p style={{
            textAlign: 'center',
            color: '#bbb',
            fontSize: '0.7rem',
            marginTop: '1.25rem',
            marginBottom: 0,
          }}>
            Inscription gratuite · Pas de spam · Résiliable à tout moment
          </p>
        </div>
      </div>
    </div>
  );
}
