/**
 * KPI Engine — runtime resolver.
 *
 * getRestaurantKPIs(restaurantId) returns the full list of KPIs a restaurant
 * has access to, based on their plan, with availability flags and the
 * restaurant's own settings (e.g. average_ticket).
 *
 * NOTE: This module does NOT compute KPI values — it only resolves
 * which KPIs are available and what settings are present.
 * Actual computation belongs in a future kpi-calculator layer.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface KpiRow {
  id:          string;
  key:         string;
  name:        string;
  description: string;
  category:    'growth' | 'retention' | 'revenue' | 'engagement';
  is_active:   boolean;
}

export interface ResolvedKpi {
  kpi:     KpiRow;
  /** true = plan grants access AND plan_kpis.enabled = true AND kpi.is_active = true */
  enabled: boolean;
}

export interface RestaurantKpiContext {
  restaurantId: string;
  planId:       string | null;
  planKey:      string;
  kpis:         ResolvedKpi[];
  /** All restaurant_settings values for this restaurant, keyed by settings key */
  settings:     Record<string, string>;
}

/* ── Main resolver ─────────────────────────────────────────────────────────── */

export async function getRestaurantKPIs(restaurantId: string): Promise<RestaurantKpiContext> {
  // 1. Load restaurant (plan_id + plan key)
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('plan_id, plan')
    .eq('id', restaurantId)
    .maybeSingle();

  const planId  = restaurant?.plan_id ?? null;
  const planKey = restaurant?.plan   ?? 'free';

  // 2. Load restaurant_settings
  const { data: settingsRows } = await supabaseAdmin
    .from('restaurant_settings')
    .select('key, value')
    .eq('restaurant_id', restaurantId);

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((s) => [s.key, s.value])
  );

  // 3. Load all active KPIs
  const { data: allKpis } = await supabaseAdmin
    .from('kpis')
    .select('id, key, name, description, category, is_active')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (!allKpis || allKpis.length === 0) {
    return { restaurantId, planId, planKey, kpis: [], settings };
  }

  // 4. Load plan_kpis for this plan (if plan_id exists)
  let enabledKpiIds = new Set<string>();
  if (planId) {
    const { data: planKpis } = await supabaseAdmin
      .from('plan_kpis')
      .select('kpi_id, enabled')
      .eq('plan_id', planId)
      .eq('enabled', true);

    enabledKpiIds = new Set((planKpis ?? []).map((pk) => pk.kpi_id));
  }

  // 5. Resolve: a KPI is enabled iff the plan has it enabled
  const kpis: ResolvedKpi[] = allKpis.map((kpi) => ({
    kpi:     kpi as KpiRow,
    enabled: enabledKpiIds.has(kpi.id),
  }));

  return { restaurantId, planId, planKey, kpis, settings };
}

/* ── Convenience: enabled KPIs only ───────────────────────────────────────── */

export async function getEnabledKpis(restaurantId: string): Promise<KpiRow[]> {
  const ctx = await getRestaurantKPIs(restaurantId);
  return ctx.kpis.filter((r) => r.enabled).map((r) => r.kpi);
}
