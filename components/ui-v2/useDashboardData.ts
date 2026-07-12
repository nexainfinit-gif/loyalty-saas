'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/* ─────────────────────────────────────────────────────────────
   Hook de données du dashboard v2 « Comptoir ».
   Reproduit la logique d'auth + chargement du dashboard existant
   (session localStorage → restaurant possédé → clients / métriques),
   sans toucher au code existant. Données réelles, lecture seule.
   ───────────────────────────────────────────────────────────── */

type Tone = 'ok' | 'honey' | 'neutral' | 'accent';

interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  total_points: number | null;
  stamps_count: number | null;
  completed_cards: number | null;
  total_visits: number | null;
  last_visit_at: string | null;
  reward_pending: boolean | null;
  created_at: string;
}

/** Données brutes exposées pour l'onglet Analytique (calcul côté client). */
export interface RawCustomer {
  id: string; total_points: number; stamps_count: number; completed_cards: number;
  total_visits: number; last_visit_at: string | null; created_at: string;
}
export interface RawTx { created_at: string; type: string; customer_id: string; points_delta: number; }
export interface RawBundle {
  customers: RawCustomer[]; transactions: RawTx[];
  programType: 'points' | 'stamps'; vipThreshold: number; rewardThreshold: number; stampsTotal: number;
}

export interface DashboardKpis {
  totalCustomers: number;
  newCustomers30d: number | null;
  visits30d: number | null;
  returnRatePct: number | null;
  rewardsDue: number;
  vipCount: number;
}

export interface RecentCustomer {
  id: string;
  initials: string;
  name: string;
  email: string;
  points: string;
  cards: string;
  last: string;
  tone: Tone;
  status: string;
}

export interface DashboardInsights {
  vipCount: number;
  inactiveCount: number;
  lastCampaign: { name: string; recipients: number; when: string } | null;
}

export interface DashboardData {
  restaurantId: string;
  restaurantName: string;
  greetingName: string;
  kpis: DashboardKpis;
  chartDaily: number[];
  chartLabels: string[];
  recent: RecentCustomer[];
  /** Liste complète des clients (pour l'onglet Clients). */
  customers: RecentCustomer[];
  insights: DashboardInsights;
  /** Données brutes pour l'onglet Analytique. */
  raw: RawBundle;
}

export type DashboardState =
  | { status: 'loading' }
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DashboardData };

const INACTIVE_DAYS = 45;
const nf = new Intl.NumberFormat('fr-FR');

function relTime(iso: string | null): string {
  if (!iso) return 'Jamais';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "À l'instant";
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Hier';
  if (d < 30) return `Il y a ${d} j`;
  const m = Math.floor(d / 30);
  return m === 1 ? 'Il y a 1 mois' : `Il y a ${m} mois`;
}

function initials(first: string | null, last: string | null, email: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase() || '·';
  return (email ?? '?')[0].toUpperCase();
}

function statusOf(c: CustomerRow, programType: 'points' | 'stamps', vipThreshold: number): 'vip' | 'active' | 'inactive' {
  const last = c.last_visit_at ? new Date(c.last_visit_at) : null;
  if (!last || Date.now() - last.getTime() > INACTIVE_DAYS * 86_400_000) return 'inactive';
  const val = programType === 'stamps' ? (c.stamps_count ?? 0) : (c.total_points ?? 0);
  if (vipThreshold > 0 && val >= vipThreshold) return 'vip';
  return 'active';
}

const TONE: Record<'vip' | 'active' | 'inactive', Tone> = { vip: 'honey', active: 'ok', inactive: 'neutral' };
const LABEL: Record<'vip' | 'active' | 'inactive', string> = { vip: 'VIP', active: 'Actif', inactive: 'Inactif' };

export function useDashboardData(): DashboardState {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const locale = (typeof window !== 'undefined' && window.location.pathname.split('/')[1]) || 'fr';

    async function load() {
      try {
        // 1 — Session (localStorage, comme le dashboard existant)
        let session: Session | null = null;
        const { data: { session: cached } } = await supabase.auth.getSession();
        session = cached;
        if (!session) {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession();
          session = refreshed;
        }
        if (!session) {
          if (!cancelled) setState({ status: 'redirecting' });
          window.location.href = `/${locale}/dashboard/login`;
          return;
        }

        // 2 — Restaurant possédé (honore le cookie selected_restaurant)
        const { data: restos, error: rErr } = await supabase
          .from('restaurants')
          .select('id, name, slug, subscription_status')
          .eq('owner_id', session.user.id)
          .eq('is_demo', false)
          .order('created_at', { ascending: true });
        if (rErr) throw new Error(rErr.message);

        const list = restos ?? [];
        const selectedId = document.cookie.match(/(?:^|;\s*)selected_restaurant=([^;]+)/)?.[1];
        const resto = (selectedId && list.find((r) => r.id === selectedId)) || list[0] || null;
        if (!resto) {
          if (!cancelled) setState({ status: 'redirecting' });
          window.location.href = `/${locale}/onboarding`;
          return;
        }

        // 3 — Données en parallèle : clients, réglages fidélité, campagnes, transactions, métriques
        const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
        const [clientsRes, lsRes, campsRes, txRes, metricsRes] = await Promise.all([
          supabase.from('customers').select('id, first_name, last_name, email, total_points, stamps_count, completed_cards, total_visits, last_visit_at, reward_pending, created_at')
            .eq('restaurant_id', resto.id).order('created_at', { ascending: false }),
          supabase.from('loyalty_settings').select('program_type, vip_threshold_points, vip_threshold_stamps, reward_threshold, stamps_total')
            .eq('restaurant_id', resto.id).maybeSingle(),
          supabase.from('campaigns').select('name, recipients_count, sent_at, status')
            .eq('restaurant_id', resto.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('transactions').select('created_at, points_delta, type, customer_id')
            .eq('restaurant_id', resto.id).gte('created_at', since90).order('created_at', { ascending: true }),
          fetch('/api/restaurant-metrics', { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        const customers = (clientsRes.data ?? []) as CustomerRow[];
        const programType = (lsRes.data?.program_type as 'points' | 'stamps') ?? 'points';
        const vipThreshold = programType === 'stamps'
          ? (lsRes.data?.vip_threshold_stamps ?? 0)
          : (lsRes.data?.vip_threshold_points ?? 0);

        const metrics = (metricsRes?.metrics ?? null) as Record<string, number> | null;

        // KPIs
        const statuses = customers.map((c) => statusOf(c, programType, vipThreshold));
        const vipCount = statuses.filter((s) => s === 'vip').length;
        const inactiveCount = statuses.filter((s) => s === 'inactive').length;
        const rewardsDue = customers.filter((c) => c.reward_pending).length;

        const rawReturn = metrics?.repeat_rate;
        const returnRatePct = typeof rawReturn === 'number'
          ? Math.round((rawReturn <= 1 ? rawReturn * 100 : rawReturn))
          : null;

        const kpis: DashboardKpis = {
          totalCustomers: metrics?.total_customers ?? customers.length,
          newCustomers30d: metrics?.new_customers_30d ?? null,
          visits30d: metrics?.visits_30d ?? null,
          returnRatePct,
          rewardsDue,
          vipCount,
        };

        // Chart — visites/jour sur 30 jours à partir des transactions positives
        const daily = new Array(30).fill(0) as number[];
        const start = Date.now() - 30 * 86_400_000;
        for (const tx of (txRes.data ?? []) as { created_at: string; points_delta: number | null }[]) {
          if ((tx.points_delta ?? 0) <= 0) continue;
          const idx = Math.floor((new Date(tx.created_at).getTime() - start) / 86_400_000);
          if (idx >= 0 && idx < 30) daily[idx] += 1;
        }
        const fmtDay = (offsetDays: number) =>
          new Date(start + offsetDays * 86_400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        const chartLabels = [fmtDay(0), fmtDay(10), fmtDay(20), fmtDay(29)];

        // Clients (liste complète mappée ; les 5 premiers = récents)
        const mappedCustomers: RecentCustomer[] = customers.map((c) => {
          const st = statusOf(c, programType, vipThreshold);
          const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || (c.email ?? 'Client');
          const val = programType === 'stamps' ? (c.stamps_count ?? 0) : (c.total_points ?? 0);
          return {
            id: c.id,
            initials: initials(c.first_name, c.last_name, c.email),
            name,
            email: c.email ?? '',
            points: nf.format(val),
            cards: String(c.completed_cards ?? 0),
            last: relTime(c.last_visit_at),
            tone: TONE[st],
            status: LABEL[st],
          };
        });
        const recent = mappedCustomers.slice(0, 5);

        // Insights — dernière campagne envoyée
        const lastSent = (campsRes.data ?? []).find((c) => c.status === 'sent' && c.sent_at) as
          | { name: string; recipients_count: number | null; sent_at: string }
          | undefined;
        const insights: DashboardInsights = {
          vipCount,
          inactiveCount,
          lastCampaign: lastSent
            ? { name: lastSent.name, recipients: lastSent.recipients_count ?? 0, when: relTime(lastSent.sent_at) }
            : null,
        };

        const greetingName = (session.user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
          ?? (session.user.email ?? '').split('@')[0];

        // Données brutes pour l'onglet Analytique
        const raw: RawBundle = {
          customers: customers.map((c) => ({
            id: c.id, total_points: c.total_points ?? 0, stamps_count: c.stamps_count ?? 0,
            completed_cards: c.completed_cards ?? 0, total_visits: c.total_visits ?? 0,
            last_visit_at: c.last_visit_at, created_at: c.created_at,
          })),
          transactions: ((txRes.data ?? []) as { created_at: string; type: string | null; customer_id: string | null; points_delta: number | null }[])
            .map((t) => ({ created_at: t.created_at, type: t.type ?? '', customer_id: t.customer_id ?? '', points_delta: t.points_delta ?? 0 })),
          programType,
          vipThreshold,
          rewardThreshold: lsRes.data?.reward_threshold ?? 100,
          stampsTotal: lsRes.data?.stamps_total ?? 10,
        };

        if (!cancelled) {
          setState({
            status: 'ready',
            data: { restaurantId: resto.id, restaurantName: resto.name ?? resto.slug, greetingName, kpis, chartDaily: daily, chartLabels, recent, customers: mappedCustomers, insights, raw },
          });
        }
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Erreur inconnue' });
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
