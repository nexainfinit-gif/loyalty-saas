'use client';

import { useEffect, useState } from 'react';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';
import AdminLogin from '@/components/AdminLogin';

interface Affiliate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  code: string;
  commission_rate: number;
  status: string;
  notes: string | null;
  stripe_account_id: string | null;
  created_at: string;
  referrals: number;
  total_pending: number;
  total_paid: number;
}

interface Commission {
  id: string;
  restaurant_id: string;
  stripe_invoice_id: string;
  invoice_amount: number;
  commission_amount: number;
  commission_rate: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

interface AffiliateDetail {
  affiliate: Affiliate;
  referrals: { id: string; name: string; slug: string; plan: string; subscription_status: string; created_at: string }[];
  commissions: Commission[];
}

export default function AdminAffiliatesPage() {
  const { locale } = useTranslation();
  const router = useLocaleRouter();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', code: '', commission_rate: '20', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<AffiliateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payingAll, setPayingAll] = useState(false);
  const [testingInvoice, setTestingInvoice] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  async function fetchList() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/affiliates');
      if (res.status === 401 || res.status === 403) { setAuthed(false); return; }
      setAuthed(true);
      if (res.ok) setAffiliates(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchList(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          code: form.code || undefined,
          commission_rate: form.commission_rate,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || 'Erreur');
        return;
      }
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', code: '', commission_rate: '20', notes: '' });
      fetchList();
    } catch { setError('Erreur réseau.'); }
    finally { setSaving(false); }
  }

  async function toggleStatus(aff: Affiliate) {
    await fetch('/api/admin/affiliates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: aff.id, status: aff.status === 'active' ? 'inactive' : 'active' }),
    });
    fetchList();
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/affiliates/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {}
    setDetailLoading(false);
  }

  async function markAllPaid() {
    if (!detail) return;
    const pendingIds = detail.commissions.filter(c => c.status === 'pending').map(c => c.id);
    if (pendingIds.length === 0) return;
    setPayingAll(true);
    try {
      await fetch(`/api/admin/affiliates/${detail.affiliate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', commissionIds: pendingIds }),
      });
      openDetail(detail.affiliate.id);
      fetchList();
    } catch {}
    setPayingAll(false);
  }

  async function testInvoice(restaurantId: string) {
    setTestingInvoice(restaurantId);
    setTestMsg('');
    try {
      const res = await fetch('/api/admin/affiliates/test-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, amount: 2900 }),
      });
      const j = await res.json();
      if (res.ok) {
        setTestMsg(`Facture test payée (${(j.amount_paid / 100).toFixed(2)}€). Commission en route via webhook.`);
        setTimeout(() => { if (detail) openDetail(detail.affiliate.id); fetchList(); }, 3000);
      } else {
        setTestMsg(j.error || 'Erreur');
      }
    } catch { setTestMsg('Erreur réseau.'); }
    setTestingInvoice(null);
  }

  if (authed === false) {
    return <AdminLogin onAuthenticated={() => { setAuthed(true); fetchList(); }} />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href={`/${locale}/admin`} className="text-xs text-gray-400 hover:text-white transition-colors">← Admin</a>
            <h1 className="text-sm font-bold tracking-wide uppercase">Affiliés</h1>
          </div>
          <button onClick={() => { setShowForm(true); setDetail(null); }} className="text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors">
            + Nouvel affilié
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* ── Formulaire création ── */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Créer un affilié</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Code (auto si vide)</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="EX: A7K2MN"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Commission (%)</label>
                <input type="number" min="0" max="100" step="0.5" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 outline-none" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50">
                  {saving ? 'Création...' : 'Créer'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            </form>
          </div>
        )}

        {/* ── Liste ── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="inline-block w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : affiliates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-sm text-gray-400">
            Aucun affilié pour le moment.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Affilié</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Commission</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Parrainages</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">En attente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Versé</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {affiliates.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(a.id)}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{a.name}</p>
                        <p className="text-xs text-gray-400">{a.email}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{a.code}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{a.commission_rate}%</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-700">{a.referrals}</td>
                      <td className="px-4 py-3 text-xs font-medium text-amber-700">{(a.total_pending / 100).toFixed(2)}€</td>
                      <td className="px-4 py-3 text-xs font-medium text-emerald-700">{(a.total_paid / 100).toFixed(2)}€</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${a.status === 'active' ? 'bg-emerald-50 text-emerald-700' : a.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.status === 'active' ? 'Actif' : a.status === 'pending' ? 'En attente' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={e => { e.stopPropagation(); toggleStatus(a); }}
                          className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                          {a.status === 'active' ? 'Désactiver' : 'Activer'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Détail affilié ── */}
        {detailLoading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="inline-block w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {detail && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{detail.affiliate.name}</h2>
                <p className="text-sm text-gray-500">{detail.affiliate.email} — {detail.affiliate.commission_rate}% récurrent</p>
                <div className="flex items-center gap-2 mt-1">
                  {detail.affiliate.stripe_account_id ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Stripe Connect
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg">
                      Pas de compte Stripe
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-sm text-gray-400 hover:text-gray-600">Fermer</button>
            </div>

            {/* Lien */}
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 mb-1">Lien de parrainage</p>
              <p className="text-sm font-mono text-gray-900 break-all select-all">{appUrl}/{locale}/onboarding?ref={detail.affiliate.code}</p>
            </div>

            {/* Parrainages */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Établissements parrainés ({detail.referrals.length})</h3>
              {detail.referrals.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun parrainage pour le moment.</p>
              ) : (
                <div className="space-y-2">
                  {detail.referrals.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.name}</p>
                        <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => testInvoice(r.id)} disabled={testingInvoice === r.id}
                          className="text-xs font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition disabled:opacity-50">
                          {testingInvoice === r.id ? 'Envoi...' : 'Test facture'}
                        </button>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${r.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.plan} — {r.subscription_status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {testMsg && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
                {testMsg}
              </div>
            )}

            {/* Commissions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Commissions ({detail.commissions.length})</h3>
                {detail.commissions.some(c => c.status === 'pending') && (
                  <button onClick={markAllPaid} disabled={payingAll}
                    className={`text-xs font-medium text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50 ${detail.affiliate.stripe_account_id ? 'bg-[#635bff] hover:bg-[#5851db]' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {payingAll ? 'Traitement...' : detail.affiliate.stripe_account_id ? 'Verser via Stripe' : 'Marquer payé (manuel)'}
                  </button>
                )}
              </div>
              {detail.commissions.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune commission enregistrée.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {detail.commissions.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(c.commission_amount / 100).toFixed(2)}€ <span className="text-xs text-gray-400">sur {(c.invoice_amount / 100).toFixed(2)}€ ({c.commission_rate}%)</span></p>
                        <p className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${c.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : c.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'paid' ? `Versé le ${new Date(c.paid_at!).toLocaleDateString('fr-FR')}` : c.status === 'pending' ? 'En attente' : 'Annulé'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
