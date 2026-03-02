'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface PlanRow {
  id:            string;
  key:           string;
  name:          string;
  price_monthly: number | null;
  is_public:     boolean;
  is_active:     boolean;
  sort_order:    number;
  created_at:    string;
  features:      Record<string, boolean>;
}

/* ── Plan badge ─────────────────────────────────────────────────────────────── */

function PlanBadge({ planKey }: { planKey: string }) {
  const styles: Record<string, string> = {
    free:       'bg-gray-100 text-gray-500',
    basic:      'bg-blue-50 text-blue-600',
    pro:        'bg-violet-50 text-violet-600',
    enterprise: 'bg-amber-50 text-amber-700',
  };
  const cls = styles[planKey] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {planKey}
    </span>
  );
}

/* ── Create plan modal ──────────────────────────────────────────────────────── */

function CreatePlanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (plan: PlanRow) => void;
}) {
  const [form, setForm] = useState({ key: '', name: '', price_monthly: '', sort_order: '0', is_public: true });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.key.trim() || !form.name.trim()) {
      setError('Key et nom sont requis.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key:           form.key.trim().toLowerCase(),
          name:          form.name.trim(),
          price_monthly: form.price_monthly ? Number(form.price_monthly) : null,
          sort_order:    Number(form.sort_order) || 0,
          is_public:     form.is_public,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erreur création.'); return; }
      onCreated({ ...json.plan, features: {} });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Créer un plan</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Key (identifiant unique)</label>
            <input
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="ex: starter"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom affiché</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex: Starter"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prix mensuel (centimes)</label>
            <input
              type="number"
              value={form.price_monthly}
              onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
              placeholder="ex: 2900 → 29,00 €"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_public"
              checked={form.is_public}
              onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="is_public" className="text-sm text-gray-700">Plan public (visible par les clients)</label>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminPlansPage() {
  const router = useRouter();
  const [plans, setPlans]     = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetch('/api/admin/plans')
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) { router.replace('/dashboard'); return; }
        if (!res.ok) throw new Error('Erreur serveur');
        const json = await res.json();
        setPlans(json.plans ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function toggleActive(plan: PlanRow) {
    const res = await fetch(`/api/admin/plans/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !plan.is_active }),
    });
    if (res.ok) {
      const { plan: updated } = await res.json();
      setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, is_active: updated.is_active } : p));
    }
  }

  function fmtPrice(cents: number | null) {
    if (cents === null) return '—';
    if (cents === 0) return 'Gratuit';
    return `${(cents / 100).toFixed(2).replace('.', ',')} €/mois`;
  }

  function countEnabled(features: Record<string, boolean>) {
    return Object.values(features).filter(Boolean).length;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400 mt-4">Chargement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Admin
            </button>
            <span className="text-gray-200">/</span>
            <h1 className="text-lg font-bold text-gray-900">Plans d&apos;abonnement</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            + Créer un plan
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100 text-sm text-red-600">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Key</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Prix</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Public</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Actif</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Features ON</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {plans.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    Aucun plan configuré.
                  </td>
                </tr>
              )}
              {plans.map((plan) => (
                <tr key={plan.id} className={`hover:bg-gray-50/50 transition-colors ${!plan.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{plan.name}</td>
                  <td className="px-4 py-3"><PlanBadge planKey={plan.key} /></td>
                  <td className="px-4 py-3 text-gray-600 tabular-nums">{fmtPrice(plan.price_monthly)}</td>
                  <td className="px-4 py-3">
                    {plan.is_public
                      ? <span className="text-emerald-600 text-xs font-medium">Oui</span>
                      : <span className="text-gray-400 text-xs">Non</span>}
                  </td>
                  <td className="px-4 py-3">
                    {plan.is_active
                      ? <span className="text-emerald-600 text-xs font-medium">Actif</span>
                      : <span className="text-gray-400 text-xs">Archivé</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {countEnabled(plan.features)}/{Object.keys(plan.features).length}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/admin/plans/${plan.id}`)}
                        className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-primary-600 hover:text-primary-600 transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => toggleActive(plan)}
                        className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        {plan.is_active ? 'Archiver' : 'Activer'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {showCreate && (
        <CreatePlanModal
          onClose={() => setShowCreate(false)}
          onCreated={(plan) => {
            setPlans((prev) => [...prev, plan]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
