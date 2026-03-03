/**
 * Growth Actions Engine
 *
 * Converts growth triggers into persisted, lifecycle-managed action rows.
 * Core guarantee: idempotent — running for the same restaurant twice never
 * creates duplicate active actions (one pending/in_progress per trigger_key).
 *
 * Exports:
 *   generateGrowthActions(restaurantId)  — single restaurant
 *   generateAllGrowthActions()           — all restaurants, concurrency-limited
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { evaluateRestaurantGrowth, type Trigger } from '@/lib/growth-triggers';

/* ── Action type mapping ───────────────────────────────────────────────────── */

type ActionType =
  | 'reengagement_recommendation'
  | 'email_campaign_suggestion'
  | 'loyalty_setup'
  | 'wallet_promotion'
  | 'setup_required'
  | 'growth_campaign'
  | 'upsell_opportunity'
  | 'upgrade_prompt';

const TRIGGER_ACTION_MAP: Record<string, ActionType> = {
  churn_risk_high:     'reengagement_recommendation',
  inactive_majority:   'reengagement_recommendation',
  engagement_drop:     'reengagement_recommendation',
  churn_risk_medium:   'reengagement_recommendation',
  growth_stalled:      'growth_campaign',
  re_engagement:       'reengagement_recommendation',
  campaign_underused:  'email_campaign_suggestion',
  no_rewards_issued:   'loyalty_setup',
  low_wallet_adoption: 'wallet_promotion',
  missing_avg_ticket:  'setup_required',
  growth_momentum:     'upsell_opportunity',
  wallet_upgrade:      'upgrade_prompt',
  revenue_kpis_locked: 'upgrade_prompt',
  analytics_upgrade:   'upgrade_prompt',
  ltv_upgrade:         'upgrade_prompt',
};

function actionTypeFor(triggerKey: string): ActionType {
  return TRIGGER_ACTION_MAP[triggerKey] ?? 'upsell_opportunity';
}

/* ── Public result type ────────────────────────────────────────────────────── */

export interface GenerateActionsResult {
  restaurantId: string;
  created:      number;
  skipped:      number;
  triggers:     number;
}

/* ── Single-restaurant ─────────────────────────────────────────────────────── */

/**
 * generateGrowthActions(restaurantId)
 *
 * 1. Evaluates growth triggers for the restaurant
 * 2. Fetches currently active (pending | in_progress) trigger keys
 * 3. Inserts a new action row for each trigger that has no active row yet
 *
 * Idempotency: relies on the DB constraint that only one active action
 * exists per (restaurant_id, trigger_key). We do a pre-flight query +
 * filtered insert rather than ON CONFLICT to preserve existing metadata.
 */
export async function generateGrowthActions(
  restaurantId: string,
): Promise<GenerateActionsResult> {
  // 1. Evaluate triggers
  let triggers: Trigger[];
  try {
    triggers = await evaluateRestaurantGrowth(restaurantId);
  } catch (err) {
    console.error(`[growth-actions] evaluateRestaurantGrowth failed for ${restaurantId}:`, err);
    return { restaurantId, created: 0, skipped: 0, triggers: 0 };
  }

  if (triggers.length === 0) {
    return { restaurantId, created: 0, skipped: 0, triggers: 0 };
  }

  // 2. Fetch active trigger keys for this restaurant
  const { data: existing } = await supabaseAdmin
    .from('growth_actions')
    .select('trigger_key')
    .eq('restaurant_id', restaurantId)
    .in('status', ['pending', 'in_progress']);

  const activeKeys = new Set((existing ?? []).map((r) => r.trigger_key));

  // 3. Build insert rows for triggers without an active action
  const toInsert = triggers
    .filter((t) => !activeKeys.has(t.key))
    .map((t) => ({
      restaurant_id: restaurantId,
      trigger_key:   t.key,
      action_type:   actionTypeFor(t.key),
      payload:       {
        type:           t.type,
        severity:       t.severity,
        title:          t.title,
        message:        t.message,
        suggested_plan: t.suggested_plan ?? null,
      },
      status: 'pending',
    }));

  if (toInsert.length === 0) {
    return {
      restaurantId,
      created:  0,
      skipped:  triggers.length,
      triggers: triggers.length,
    };
  }

  const { error } = await supabaseAdmin
    .from('growth_actions')
    .insert(toInsert);

  if (error) {
    console.error(`[growth-actions] insert failed for ${restaurantId}:`, error.message);
    return { restaurantId, created: 0, skipped: activeKeys.size, triggers: triggers.length };
  }

  return {
    restaurantId,
    created:  toInsert.length,
    skipped:  triggers.length - toInsert.length,
    triggers: triggers.length,
  };
}

/* ── Batch (all restaurants) ───────────────────────────────────────────────── */

export interface BatchActionsResult {
  restaurantsProcessed: number;
  actionsCreated:       number;
  errors:               number;
}

/**
 * generateAllGrowthActions()
 *
 * Runs generateGrowthActions for every restaurant.
 * Concurrency limited to 5 parallel evaluations (KPI + trigger evaluation
 * is the heavy part — 5 concurrent is safe without DB saturation).
 * Uses Promise.allSettled so a single restaurant failure never aborts the batch.
 */
export async function generateAllGrowthActions(): Promise<BatchActionsResult> {
  const { data: restaurants } = await supabaseAdmin
    .from('restaurants')
    .select('id');

  if (!restaurants || restaurants.length === 0) {
    return { restaurantsProcessed: 0, actionsCreated: 0, errors: 0 };
  }

  const CONCURRENCY = 5;
  let actionsCreated = 0;
  let errors         = 0;

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < restaurants.length; i += CONCURRENCY) {
    const chunk   = restaurants.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((r) => generateGrowthActions(r.id)),
    );

    for (const res of results) {
      if (res.status === 'fulfilled') {
        actionsCreated += res.value.created;
      } else {
        errors++;
        console.error('[growth-actions] batch item failed:', res.reason);
      }
    }
  }

  return {
    restaurantsProcessed: restaurants.length,
    actionsCreated,
    errors,
  };
}
