'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PLAN_FEATURE_KEYS } from '@/lib/plan-features';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Plan {
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

/* ── Toggle row ─────────────────────────────────────────────────────────────── */

function FeatureToggle({
  featureKey,
  label,
  enabled,
  onChange,
}: {
  featureKey: string;
  label: string;
  enabled: boolean;
  onChange: (key: string, val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 font-mono">{featureKey}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(featureKey, !enabled)}
        className={[
          'relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0',
          enabled ? 'bg-primary-600' : 'bg-gray-200',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function AdminPlanEditPage() {
  const router    = useRouter();
  const params    = useParams<{ planId: string }>();
  const planId    = params.planId;

  const [plan, setPlan]                   = useState<Plan | null>(null);
  const [restaurantCount, setRestaurantCount] = useState(0);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [savingMeta, setSavingMeta]       = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [metaMsg, setMetaMsg]             = useState('');
  const [featMsg, setFeatMsg]             = useState('');
  const [newFeatureKey, setNewFeatureKey] = useState('');
  const [features, setFeatures]           = useState<Record<string, boolean>>({});

  // Local metadata form state
  const [meta, setMeta] = useState({
    name: '', price_monthly: '', is_public: true, is_active: true, sort_order: '0',
  });

  useEffect(() => {
    if (!planId) return;
    setLoading(true);
    fetch(`/api/admin/plans/${planId}`)
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) { router.replace('/dashboard'); return; }
        if (res.status === 404) { setError('Plan introuvable.'); return; }
        if (!res.ok) throw new Error('Erreur serveur');
        const json = await res.json();
        const p: Plan = json.plan;
        setPlan(p);
        setRestaurantCount(json.restaurant_count ?? 0);
        setMeta({
          name:          p.name,
          price_monthly: p.price_monthly != null ? String(p.price_monthly) : '',
          is_public:     p.is_public,
          is_active:     p.is_active,
          sort_order:    String(p.sort_order),
        });
        setFeatures(p.features ?? {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [planId, router]);

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    setMetaMsg('');
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          meta.name.trim(),
          price_monthly: meta.price_monthly ? Number(meta.price_monthly) : null,
          is_public:     meta.is_public,
          is_active:     meta.is_active,
          sort_order:    Number(meta.sort_order) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setMetaMsg(json.error ?? 'Erreur.'); return; }
      setPlan((p) => p ? { ...p, ...json.plan } : p);
      setMetaMsg('✓ Sauvegardé');
    } finally {
      setSavingMeta(false);
    }
  }

  async function saveFeatures() {
    setSavingFeatures(true);
    setFeatMsg('');
    try {
      const res = await fetch(`/api/admin/plans/${planId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
      });
      const json = await res.json();
      if (!res.ok) { setFeatMsg(json.error ?? 'Erreur.'); return; }
      setFeatures(json.features ?? features);
      setFeatMsg('✓ Features sauvegardées');
    } finally {
      setSavingFeatures(false);
    }
  }

  function toggleFeature(key: string, val: boolean) {
    setFeatures((prev) => ({ ...prev, [key]: val }));
    setFeatMsg('');
  }

  function addCustomKey() {
    const k = newFeatureKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!k || k in features) return;
    setFeatures((prev) => ({ ...prev, [k]: false }));
    setNewFeatureKey('');
    setFeatMsg('');
  }

  // Known keys with label, plus unknown keys already in features
  const knownKeys = PLAN_FEATURE_KEYS.map((f) => f.key);
  const unknownKeys = Object.keys(features).filter((k) => !knownKeys.includes(k as typeof knownKeys[number]));

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

  if (error) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-100 p-8 text-center">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          <button onClick={() => router.back()} className="mt-4 text-sm text-primary-600 hover:underline">← Retour</button>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/plans')}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Plans
            </button>
            <span className="text-gray-200">/</span>
            <h1 className="text-lg font-bold text-gray-900">{plan.name}</h1>
            <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg">{plan.key}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Section 1 — Metadata */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">Informations du plan</h2>
          <form onSubmit={saveMeta} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom affiché</label>
              <input
                value={meta.name}
                onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Key (lecture seule)</label>
              <input
                value={plan.key}
                readOnly
                className="w-full px-3 py-2 rounded-xl border border-gray-100 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prix mensuel (centimes)</label>
              <input
                type="number"
                value={meta.price_monthly}
                onChange={(e) => setMeta({ ...meta, price_monthly: e.target.value })}
                placeholder="ex: 2900 → 29,00 €"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ordre d&apos;affichage</label>
              <input
                type="number"
                value={meta.sort_order}
                onChange={(e) => setMeta({ ...meta, sort_order: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
              />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={meta.is_public}
                  onChange={(e) => setMeta({ ...meta, is_public: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Public</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={meta.is_active}
                  onChange={(e) => setMeta({ ...meta, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Actif</span>
              </label>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={savingMeta}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {savingMeta ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
              {metaMsg && (
                <span className={`text-xs font-medium ${metaMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                  {metaMsg}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Section 2 — Feature toggles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">Fonctionnalités</h2>

          {/* Known feature keys */}
          {PLAN_FEATURE_KEYS.map((f) => (
            <FeatureToggle
              key={f.key}
              featureKey={f.key}
              label={f.label}
              enabled={features[f.key] ?? false}
              onChange={toggleFeature}
            />
          ))}

          {/* Unknown keys already in plan_features */}
          {unknownKeys.length > 0 && (
            <>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mt-4 mb-2">
                Clés personnalisées
              </p>
              {unknownKeys.map((k) => (
                <FeatureToggle
                  key={k}
                  featureKey={k}
                  label={k}
                  enabled={features[k] ?? false}
                  onChange={toggleFeature}
                />
              ))}
            </>
          )}

          {/* Add new feature key */}
          <div className="mt-4 pt-4 border-t border-gray-50 flex gap-2">
            <input
              value={newFeatureKey}
              onChange={(e) => setNewFeatureKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomKey())}
              placeholder="Ajouter une clé de feature…"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
            <button
              type="button"
              onClick={addCustomKey}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Ajouter
            </button>
          </div>

          {/* Save features */}
          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={saveFeatures}
              disabled={savingFeatures}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {savingFeatures ? 'Sauvegarde…' : 'Sauvegarder les features'}
            </button>
            {featMsg && (
              <span className={`text-xs font-medium ${featMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {featMsg}
              </span>
            )}
          </div>
        </div>

        {/* Section 3 — Restaurant count */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{restaurantCount}</span>{' '}
            restaurant{restaurantCount !== 1 ? 's' : ''} sur ce plan.
          </p>
        </div>
      </main>
    </div>
  );
}
