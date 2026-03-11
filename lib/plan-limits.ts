/* ── Plan Gating — limits & feature flags per plan ────────────────────────── */

import { supabaseAdmin } from '@/lib/supabase-admin';

/* ── Plan definitions ─────────────────────────────────────────────────────── */

export const PLAN_LIMITS = {
  free: {
    maxTemplates:         1,
    maxCampaignsPerMonth: 2,
    maxCustomers:         100,
    features:             ['loyalty_basic'],
  },
  starter: {
    maxTemplates:         3,
    maxCampaignsPerMonth: 10,
    maxCustomers:         500,
    features:             ['loyalty_basic', 'campaigns_email', 'wallet_apple'],
  },
  pro: {
    maxTemplates:         10,
    maxCampaignsPerMonth: -1, // unlimited
    maxCustomers:         -1, // unlimited
    features:             ['loyalty_basic', 'campaigns_email', 'wallet_apple', 'wallet_google', 'analytics_advanced'],
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string | null) {
  return PLAN_LIMITS[(plan as PlanName) ?? 'free'] ?? PLAN_LIMITS.free;
}

/* ── Resource limit checker ───────────────────────────────────────────────── */

const RESOURCE_LABELS: Record<string, string> = {
  templates: 'templates de pass',
  campaigns: 'campagnes ce mois-ci',
  customers: 'clients',
};

/**
 * Check whether a restaurant has reached its plan limit for a given resource.
 * Returns { allowed, limit, current } so the caller can decide what to do.
 */
export async function checkPlanLimit(
  restaurantId: string,
  plan: string | null,
  resource: 'templates' | 'campaigns' | 'customers',
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const limits = getPlanLimits(plan);

  let max: number;
  let current = 0;

  switch (resource) {
    case 'templates': {
      max = limits.maxTemplates;
      const { count } = await supabaseAdmin
        .from('wallet_pass_templates')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId);
      current = count ?? 0;
      break;
    }

    case 'campaigns': {
      max = limits.maxCampaignsPerMonth;
      // Count campaigns created in the current calendar month (UTC)
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { count } = await supabaseAdmin
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .gte('created_at', monthStart);
      current = count ?? 0;
      break;
    }

    case 'customers': {
      max = limits.maxCustomers;
      const { count } = await supabaseAdmin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId);
      current = count ?? 0;
      break;
    }
  }

  // -1 means unlimited
  if (max === -1) return { allowed: true, limit: -1, current };

  return { allowed: current < max, limit: max, current };
}

/**
 * Build a standardised 403 JSON body for plan limit errors.
 */
export function planLimitError(
  resource: 'templates' | 'campaigns' | 'customers',
  current: number,
  limit: number,
) {
  const label = RESOURCE_LABELS[resource] ?? resource;
  return {
    error: `Limite atteinte pour votre plan (${current}/${limit} ${label}). Passez au plan supérieur.`,
    upgrade: true,
  };
}
