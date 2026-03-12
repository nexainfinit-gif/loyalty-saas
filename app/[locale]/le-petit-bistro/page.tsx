'use client';
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';

export default function RegisterPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<{
    qrToken: string;
    customerName: string;
    restaurantName: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    const form = new FormData(e.currentTarget);

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantSlug: 'le-petit-bistro',
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        email: form.get('email'),
        birthDate: form.get('birthDate') || null,
        postalCode: form.get('postalCode') || null,
        marketingConsent: form.get('marketingConsent') === 'on',
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setSuccessData(data);
      setStatus('success');
    } else {
      setErrorMsg(data.error || t('register.genericError'));
      setStatus('error');
    }
  }

  if (status === 'success' && successData) {
    const scanUrl = `${window.location.origin}/api/scan/${successData.qrToken}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(scanUrl)}`;

    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-lg w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-green-700 mb-1">
            {t('demo.welcome')}
          </h1>
          <p className="text-gray-500 mb-2">
            {successData.customerName}
          </p>
          <p className="text-gray-600 mb-6">
            {t('demo.cardReady', { restaurant: successData.restaurantName })}
          </p>
          <img
            src={qrUrl}
            alt={t('demo.qrTitle')}
            className="mx-auto rounded-xl mb-4"
          />
          <p className="text-xs text-gray-400">
            {t('demo.qrDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-lg">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-xl font-bold">{t('demo.title')}</h1>
          <p className="text-gray-500 text-sm">{t('demo.joinProgram')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              name="firstName"
              placeholder={t('demo.firstName')}
              required
              className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
            />
            <input
              name="lastName"
              placeholder={t('demo.lastName')}
              required
              className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <input
            name="email"
            type="email"
            placeholder={t('demo.email')}
            required
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
          />

          <input
            name="birthDate"
            type="date"
            placeholder={t('demo.birthday')}
            className="border rounded-lg px-3 py-2 text-sm w-full text-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
          />

          <input
            name="postalCode"
            placeholder={t('demo.postalCode')}
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-black"
          />

          <label className="flex gap-2 items-start text-xs text-gray-600 cursor-pointer">
            <input
              name="marketingConsent"
              type="checkbox"
              required
              className="mt-0.5 shrink-0"
            />
            <span>
              {t('demo.gdprConsent')}
            </span>
          </label>

          {status === 'error' && (
            <p className="text-red-500 text-sm text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition hover:bg-gray-800"
          >
            {status === 'loading' ? t('demo.submitting') : t('demo.submitBtn')}
          </button>
        </form>
      </div>
    </div>
  );
}
