'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ─────────────────────────────────────────────────────────────
   Réglages établissement (onglet Réglages v2). Charge nom/slug,
   plan et paramètres analytiques ; enregistre via les MÊMES routes
   que le dashboard existant (PATCH /api/Restaurant/Create,
   PUT /api/restaurant-settings) — aucune régression.
   ───────────────────────────────────────────────────────────── */

export interface PlanInfo { name: string; key: string; status: string | null; periodEnd: string | null; }
type Status = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

async function token(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function useSettingsData(restaurantId: string | null) {
  const [status, setStatus] = useState<Status>('loading');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [origin, setOrigin] = useState({ name: '', slug: '' });
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [infoState, setInfoState] = useState<SaveState>('idle');
  const [kpiState, setKpiState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [restoRes, settingsRes] = await Promise.all([
          supabase.from('restaurants')
            .select('name, slug, plan, subscription_status, current_period_end, plans(name, key)')
            .eq('id', restaurantId).single(),
          token().then((tk) => tk
            ? fetch('/api/restaurant-settings', { headers: { Authorization: `Bearer ${tk}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
            : null),
        ]);
        if (cancelled) return;
        const r = restoRes.data as unknown as {
          name: string | null; slug: string; plan: string | null;
          subscription_status: string | null; current_period_end: string | null;
          plans: { name: string; key: string } | { name: string; key: string }[] | null;
        } | null;
        if (!r) { setStatus('error'); return; }
        const p = Array.isArray(r.plans) ? r.plans[0] : r.plans;
        setName(r.name ?? '');
        setSlug(r.slug ?? '');
        setOrigin({ name: r.name ?? '', slug: r.slug ?? '' });
        setPlan({
          name: p?.name ?? r.plan ?? '—',
          key: p?.key ?? r.plan ?? '',
          status: r.subscription_status,
          periodEnd: r.current_period_end,
        });
        setSettings(settingsRes?.settings ?? {});
        setStatus('ready');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  function setKpi(key: string, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    setKpiState('idle');
  }

  async function saveInfo() {
    setInfoState('saving');
    const tk = await token();
    if (!tk) { setInfoState('error'); return; }
    const res = await fetch('/api/Restaurant/Create', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
    });
    if (!res.ok) { setInfoState('error'); return; }
    setOrigin({ name: name.trim(), slug: slug.trim() });
    setInfoState('saved');
  }

  async function saveKpi() {
    setKpiState('saving');
    const tk = await token();
    if (!tk) { setKpiState('error'); return; }
    const res = await fetch('/api/restaurant-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: JSON.stringify(settings),
    });
    if (!res.ok) { setKpiState('error'); return; }
    const json = await res.json().catch(() => null);
    if (json?.settings) setSettings(json.settings);
    setKpiState('saved');
  }

  const infoDirty = name.trim() !== origin.name || slug.trim() !== origin.slug;

  return { status, name, setName, slug, setSlug, plan, settings, setKpi, saveInfo, saveKpi, infoState, kpiState, infoDirty };
}
