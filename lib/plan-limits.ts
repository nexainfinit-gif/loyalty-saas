/* ── Plan Gating — limits & feature flags per plan ──────────────────────────
 *
 * SOURCE UNIQUE : les tables `plans` (limites numériques, migration 035) et
 * `plan_features` (flags) en DB — éditables via le panel admin.
 * L'ancien objet PLAN_LIMITS hardcodé a été supprimé (2026-07-05) : ses clés
 * (free/starter/pro) ne correspondaient plus aux plans réels
 * (starter/growth/pro) et faisaient retomber "growth" sur les limites "free".
 *
 * Cache mémoire 60 s pour éviter une requête DB par appel.
 * Fallback si plan introuvable / DB indisponible : limites les plus
 * restrictives connues (celles de starter) — jamais d'accès illimité par
 * accident.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export type PlanLimits = {
  maxTemplates: number;          // -1 = illimité
  maxCampaignsPerMonth: number;  // -1 = illimité
  maxCustomers: number;          // -1 = illimité
  maxEmailsPerMonth: number;     // -1 = illimité (migration 036)
};

type PlanEntry = {
  id: string;
  limits: PlanLimits;
  features: Record<string, boolean>;
};

/** Fallback restrictif (valeurs starter) quand le plan est inconnu. */
const FALLBACK_LIMITS: PlanLimits = {
  maxTemplates: 3,
  maxCampaignsPerMonth: 8,
  maxCustomers: 500,
  maxEmailsPerMonth: 5000,
};

const CACHE_TTL_MS = 60_000;
let cache: { at: number; byKey: Map<string, PlanEntry> } | null = null;

/** NULL/undefined en DB = illimité (-1 en interne). */
function toLimit(v: unknown): number {
  return typeof v === 'number' ? v : -1;
}

async function loadPlans(): Promise<Map<string, PlanEntry>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.byKey;

  // select('*') : tolère l'absence des colonnes max_* tant que la
  // migration 035 n'est pas appliquée (les limites tombent en fallback).
  const [{ data: plans, error: plansErr }, { data: feats }] = await Promise.all([
    supabaseAdmin.from('plans').select('*'),
    supabaseAdmin.from('plan_features').select('plan_id, feature_key, enabled'),
  ]);

  if (plansErr || !plans) {
    // DB indisponible : garder le cache périmé s'il existe, sinon vide.
    return cache?.byKey ?? new Map();
  }

  const byKey = new Map<string, PlanEntry>();
  for (const p of plans as Record<string, unknown>[]) {
    const features: Record<string, boolean> = {};
    for (const f of feats ?? []) {
      if (f.plan_id === p.id) features[f.feature_key] = f.enabled;
    }
    const hasLimitColumns = 'max_customers' in p;
    byKey.set(String(p.key), {
      id: String(p.id),
      limits: hasLimitColumns
        ? {
            maxTemplates: toLimit(p.max_templates),
            maxCampaignsPerMonth: toLimit(p.max_campaigns_per_month),
            maxCustomers: toLimit(p.max_customers),
            maxEmailsPerMonth: toLimit(p.max_emails_per_month),
          }
        : FALLBACK_LIMITS,
      features,
    });
  }

  cache = { at: Date.now(), byKey };
  return byKey;
}

/** Test-only: réinitialise le cache mémoire. */
export function _clearPlanCache() {
  cache = null;
}

/**
 * Limites numériques d'un plan (par clé). Fallback restrictif si inconnu.
 */
export async function getPlanLimits(plan: string | null): Promise<PlanLimits> {
  const byKey = await loadPlans();
  return byKey.get(plan ?? '')?.limits ?? FALLBACK_LIMITS;
}

/**
 * Le plan inclut-il un feature flag (table plan_features) ?
 * Inconnu / DB indisponible → false (jamais d'accès par accident).
 */
export async function hasFeature(plan: string | null, feature: string): Promise<boolean> {
  const byKey = await loadPlans();
  return byKey.get(plan ?? '')?.features[feature] === true;
}

/* ── Resource limit checker ───────────────────────────────────────────────── */

const RESOURCE_LABELS: Record<string, string> = {
  templates: 'templates de pass',
  campaigns: 'campagnes ce mois-ci',
  customers: 'clients',
  emails: 'emails ce mois-ci',
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
  const limits = await getPlanLimits(plan);

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
 * Quota d'emails du mois calendaire courant (UTC).
 *
 * `additional` = nombre d'emails que l'appelant s'apprête à envoyer :
 * la campagne est autorisée si (déjà envoyés ce mois) + additional ≤ quota.
 * Comptage = SUM(campaigns.recipients_count) du mois courant — les campagnes
 * planifiées comptent aussi (le quota est réservé à la création).
 */
export async function checkEmailQuota(
  restaurantId: string,
  plan: string | null,
  additional: number,
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const limits = await getPlanLimits(plan);
  const max = limits.maxEmailsPerMonth;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await supabaseAdmin
    .from('campaigns')
    .select('recipients_count')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', monthStart);

  const current = (data ?? []).reduce(
    (sum, c) => sum + ((c.recipients_count as number) ?? 0),
    0,
  );

  if (max === -1) return { allowed: true, limit: -1, current };
  return { allowed: current + additional <= max, limit: max, current };
}

/**
 * Build a standardised 403 JSON body for plan limit errors.
 */
export function planLimitError(
  resource: 'templates' | 'campaigns' | 'customers' | 'emails',
  current: number,
  limit: number,
) {
  const label = RESOURCE_LABELS[resource] ?? resource;
  return {
    error: `Limite atteinte pour votre plan (${current}/${limit} ${label}). Passez au plan supérieur.`,
    upgrade: true,
  };
}
