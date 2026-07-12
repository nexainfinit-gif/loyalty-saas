'use client';

import { useState, useEffect } from 'react';

interface AffiliateData {
  affiliate: { name: string; code: string; commission_rate: number; status: string; created_at: string };
  referrals: { name: string; plan: string; subscription_status: string; created_at: string }[];
  commissions: { amount: number; status: string; created_at: string; paid_at: string | null }[];
  summary: { total_pending: number; total_paid: number; total_referrals: number };
}

interface ConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

export default function AffiliatePortalPage() {
  const [code, setCode] = useState('');
  const [data, setData] = useState<AffiliateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('code');
    if (c) { setCode(c.toUpperCase()); loadData(c.toUpperCase()); }
  }, []);

  async function loadData(c: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/affiliate?code=${encodeURIComponent(c)}`);
      if (!res.ok) { setError('Code introuvable.'); setData(null); return; }
      setData(await res.json());
      loadConnectStatus(c);
    } catch { setError('Erreur réseau.'); }
    finally { setLoading(false); }
  }

  async function loadConnectStatus(c: string) {
    try {
      const res = await fetch(`/api/affiliate/connect?code=${encodeURIComponent(c)}`);
      if (res.ok) setConnectStatus(await res.json());
    } catch { /* best-effort */ }
  }

  async function startOnboarding() {
    setConnectLoading(true);
    try {
      const res = await fetch('/api/affiliate/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } catch { /* ignore */ }
    setConnectLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length >= 4) loadData(code.trim().toUpperCase());
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-50 rounded-xl mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Portail Affilié</h1>
            <p className="text-sm text-gray-500 mt-1">Consultez vos parrainages et commissions</p>
          </div>

          {!data && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Votre code affilié</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="EX: A7K2MN"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none text-center text-lg font-mono tracking-widest"
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length < 4}
                className="w-full py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition disabled:opacity-50"
              >
                {loading ? 'Chargement...' : 'Accéder'}
              </button>
              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            </form>
          )}

          {data && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{data.affiliate.name}</p>
                  <p className="text-sm text-gray-500">Code : <span className="font-mono">{data.affiliate.code}</span> — {data.affiliate.commission_rate}% récurrent</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${data.affiliate.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {data.affiliate.status === 'active' ? 'Actif' : 'Inactif'}
                </span>
              </div>

              {/* Lien de parrainage */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Votre lien de parrainage</p>
                <p className="text-sm font-mono text-gray-900 break-all select-all">{appUrl}/onboarding?ref={data.affiliate.code}</p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-blue-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-blue-700">{data.summary.total_referrals}</p>
                  <p className="text-xs text-blue-600 mt-1">Parrainages</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-amber-700">{(data.summary.total_pending / 100).toFixed(2)}€</p>
                  <p className="text-xs text-amber-600 mt-1">En attente</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-emerald-700">{(data.summary.total_paid / 100).toFixed(2)}€</p>
                  <p className="text-xs text-emerald-600 mt-1">Versé</p>
                </div>
              </div>

              {/* Stripe Connect */}
              <div className="p-4 rounded-xl border border-gray-200">
                {!connectStatus || !connectStatus.connected ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Recevoir vos commissions</p>
                      <p className="text-xs text-gray-500 mt-0.5">Configurez votre compte bancaire pour recevoir vos paiements automatiquement.</p>
                    </div>
                    <button onClick={startOnboarding} disabled={connectLoading}
                      className="px-4 py-2 rounded-xl bg-[#635bff] text-white text-sm font-medium hover:bg-[#5851db] transition disabled:opacity-50 whitespace-nowrap">
                      {connectLoading ? 'Redirection...' : 'Configurer'}
                    </button>
                  </div>
                ) : connectStatus.payoutsEnabled ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Compte bancaire configuré</p>
                      <p className="text-xs text-gray-500">Vos commissions seront versées automatiquement.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-700">Configuration incomplète</p>
                      <p className="text-xs text-gray-500 mt-0.5">Finalisez la configuration de votre compte pour recevoir les paiements.</p>
                    </div>
                    <button onClick={startOnboarding} disabled={connectLoading}
                      className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition disabled:opacity-50 whitespace-nowrap">
                      {connectLoading ? 'Redirection...' : 'Finaliser'}
                    </button>
                  </div>
                )}
              </div>

              {/* Parrainages */}
              {data.referrals.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 mb-2">Établissements parrainés</h2>
                  <div className="space-y-2">
                    {data.referrals.map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${r.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.plan}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commissions */}
              {data.commissions.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 mb-2">Commissions</h2>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.commissions.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{(c.amount / 100).toFixed(2)}€</p>
                          <p className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${c.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {c.status === 'paid' ? 'Versé' : 'En attente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => { setData(null); setCode(''); }} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
