/**
 * Referral Engine — modular, self-contained referral logic.
 *
 * All referral operations live here. Route handlers should only call these
 * exported functions — never embed referral SQL or business rules inline.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';
import { hasFeature, getPlanLimits } from '@/lib/plan-limits';

const CTX = 'referral';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface ReferralConfig {
  enabled: boolean;
  rewardReferrer: number;  // points or stamps
  rewardReferee: number;
  maxPerCustomer: number;
}

export interface ReferralResult {
  success: boolean;
  referrerId?: string;
  referrerReward?: number;
  refereeReward?: number;
  error?: 'invalid_code' | 'self_referral' | 'max_reached' | 'already_referred' | 'disabled' | 'plan_blocked';
}

interface ReferralStat {
  name: string;
  count: number;
}

export interface ReferralStats {
  total: number;
  thisPeriod: number;
  topReferrers: ReferralStat[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Generate a random 6-char alphanumeric code (no ambiguous chars). */
function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** Map a period shorthand to a PostgreSQL interval start date. */
function periodStart(period: '7d' | '30d' | '90d'): string {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/* ── Core Functions ──────────────────────────────────────────────────────── */

/**
 * Fetch the referral configuration for a restaurant.
 * Returns sensible defaults if loyalty_settings row is missing.
 */
export async function getReferralConfig(restaurantId: string): Promise<ReferralConfig> {
  const { data, error } = await supabaseAdmin
    .from('loyalty_settings')
    .select('referral_enabled, referral_reward_referrer, referral_reward_referee, referral_max_per_customer')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) {
    logger.error({ ctx: CTX, msg: 'Failed to fetch referral config', rid: restaurantId, err: error });
  }

  return {
    enabled: data?.referral_enabled ?? false,
    rewardReferrer: data?.referral_reward_referrer ?? 50,
    rewardReferee: data?.referral_reward_referee ?? 20,
    maxPerCustomer: data?.referral_max_per_customer ?? 10,
  };
}

/**
 * Generate a unique 6-char referral code for a customer.
 * Retries up to 5 times on collision. If the customer already has a code, returns it.
 */
export async function generateReferralCode(restaurantId: string, customerId: string): Promise<string> {
  // Check if customer already has a code
  const { data: existing } = await supabaseAdmin
    .from('customers')
    .select('referral_code')
    .eq('id', customerId)
    .eq('restaurant_id', restaurantId)
    .single();

  if (existing?.referral_code) {
    return existing.referral_code;
  }

  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();

    // Try to set it — the unique partial index will reject duplicates
    const { error } = await supabaseAdmin
      .from('customers')
      .update({ referral_code: code })
      .eq('id', customerId)
      .eq('restaurant_id', restaurantId);

    if (!error) {
      logger.info({ ctx: CTX, msg: 'Referral code generated', rid: restaurantId, customerId, code });
      return code;
    }

    // If it's a unique-violation, retry with a new code
    if (error.code === '23505') {
      logger.warn({ ctx: CTX, msg: `Referral code collision (attempt ${attempt + 1})`, rid: restaurantId });
      continue;
    }

    // Any other error is unexpected
    logger.error({ ctx: CTX, msg: 'Failed to save referral code', rid: restaurantId, err: error });
    throw new Error('Failed to generate referral code');
  }

  throw new Error('Could not generate unique referral code after max attempts');
}

/**
 * Validate a referral code before processing.
 * Checks: code exists, same restaurant, not self-referral, referrer under max limit.
 */
export async function validateReferralCode(
  restaurantId: string,
  code: string,
  refereeEmail: string,
): Promise<{ valid: boolean; referrerId?: string; error?: string }> {
  // Look up the referrer by code + restaurant
  const { data: referrer, error } = await supabaseAdmin
    .from('customers')
    .select('id, email, referral_count')
    .eq('restaurant_id', restaurantId)
    .eq('referral_code', code.toUpperCase().trim())
    .maybeSingle();

  if (error) {
    logger.error({ ctx: CTX, msg: 'Referral code lookup failed', rid: restaurantId, err: error });
    return { valid: false, error: 'invalid_code' };
  }

  if (!referrer) {
    return { valid: false, error: 'invalid_code' };
  }

  // Self-referral check (by email, case-insensitive)
  if (referrer.email?.toLowerCase() === refereeEmail.toLowerCase()) {
    return { valid: false, error: 'self_referral' };
  }

  // Max referrals check
  const config = await getReferralConfig(restaurantId);
  if (referrer.referral_count >= config.maxPerCustomer) {
    return { valid: false, error: 'max_reached' };
  }

  return { valid: true, referrerId: referrer.id };
}

/**
 * Process a referral: credit both parties, record the referral, update counts, audit log.
 *
 * This is the main entry point after a new customer registers with a valid referral code.
 * It is idempotent — a duplicate (restaurant_id, referee_id) will be rejected.
 */
export async function processReferral(params: {
  restaurantId: string;
  referrerId: string;
  refereeId: string;
  programType: 'points' | 'stamps';
  config: ReferralConfig;
}): Promise<ReferralResult> {
  const { restaurantId, referrerId, refereeId, programType, config } = params;

  // Guard: referral feature enabled
  if (!config.enabled) {
    return { success: false, error: 'disabled' };
  }

  // Guard: plan allows referrals
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('plan')
    .eq('id', restaurantId)
    .single();

  if (!hasFeature(restaurant?.plan ?? null, 'referral_program')) {
    return { success: false, error: 'plan_blocked' };
  }

  // Guard: referee not already referred (unique constraint will also catch this)
  const { data: existingReferral } = await supabaseAdmin
    .from('referrals')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('referee_id', refereeId)
    .maybeSingle();

  if (existingReferral) {
    return { success: false, error: 'already_referred' };
  }

  const referrerReward = config.rewardReferrer;
  const refereeReward = config.rewardReferee;

  // Determine the field to credit based on program type
  const pointsField = programType === 'stamps' ? 'stamps_count' : 'total_points';

  try {
    // 1. Insert referral record
    const { error: refError } = await supabaseAdmin
      .from('referrals')
      .insert({
        restaurant_id: restaurantId,
        referrer_id: referrerId,
        referee_id: refereeId,
        referrer_reward: referrerReward,
        referee_reward: refereeReward,
        status: 'completed',
        metadata: { program_type: programType },
      });

    if (refError) {
      // Unique constraint violation means already referred
      if (refError.code === '23505') {
        return { success: false, error: 'already_referred' };
      }
      throw refError;
    }

    // 2. Credit referrer — read current values then update
    const { data: referrerData } = await supabaseAdmin
      .from('customers')
      .select(`${pointsField}, referral_count`)
      .eq('id', referrerId)
      .single();

    const { error: creditReferrerErr } = await supabaseAdmin
      .from('customers')
      .update({
        [pointsField]: ((referrerData as Record<string, number>)?.[pointsField] ?? 0) + referrerReward,
        referral_count: (referrerData?.referral_count ?? 0) + 1,
      })
      .eq('id', referrerId);

    if (creditReferrerErr) {
      logger.error({ ctx: CTX, msg: 'Failed to credit referrer', rid: restaurantId, err: creditReferrerErr });
    }

    // 3. Credit referee — read current value then update
    const { data: refereeData } = await supabaseAdmin
      .from('customers')
      .select(pointsField)
      .eq('id', refereeId)
      .single();

    const { error: creditRefereeErr } = await supabaseAdmin
      .from('customers')
      .update({
        [pointsField]: ((refereeData as Record<string, number>)?.[pointsField] ?? 0) + refereeReward,
        referred_by: referrerId,
      })
      .eq('id', refereeId);

    if (creditRefereeErr) {
      logger.error({ ctx: CTX, msg: 'Failed to credit referee', rid: restaurantId, err: creditRefereeErr });
    }

    // 4. Record transactions for both parties
    await supabaseAdmin.from('transactions').insert([
      {
        customer_id: referrerId,
        points_delta: referrerReward,
        type: 'referral_bonus',
      },
      {
        customer_id: refereeId,
        points_delta: refereeReward,
        type: 'referral_welcome',
      },
    ]);

    // 5. Audit log
    auditLog({
      restaurantId,
      action: 'referral.completed',
      targetType: 'referral',
      targetId: refereeId,
      metadata: {
        referrerId,
        refereeId,
        referrerReward,
        refereeReward,
        programType,
      },
    });

    logger.info({
      ctx: CTX,
      msg: 'Referral processed',
      rid: restaurantId,
      referrerId,
      refereeId,
      referrerReward,
      refereeReward,
    });

    return {
      success: true,
      referrerId,
      referrerReward,
      refereeReward,
    };
  } catch (err) {
    logger.error({ ctx: CTX, msg: 'processReferral failed', rid: restaurantId, err });
    return { success: false, error: 'invalid_code' };
  }
}

/**
 * Get referral statistics for a restaurant dashboard.
 */
export async function getReferralStats(
  restaurantId: string,
  period: '7d' | '30d' | '90d' = '30d',
): Promise<ReferralStats> {
  // Total completed referrals
  const { count: total } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

  // Period count
  const start = periodStart(period);
  const { count: thisPeriod } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .gte('created_at', start);

  // Top referrers — fetch referrals grouped by referrer, join customer names
  const { data: topData } = await supabaseAdmin
    .from('referrals')
    .select('referrer_id, customers!referrals_referrer_id_fkey(first_name, last_name)')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

  // Aggregate in JS (Supabase doesn't support GROUP BY in the query builder)
  const countMap = new Map<string, { name: string; count: number }>();
  if (topData) {
    for (const row of (topData as unknown as Array<{ referrer_id: string; customers: { first_name: string; last_name: string } | null }>)) {
      const entry = countMap.get(row.referrer_id);
      if (entry) {
        entry.count++;
      } else {
        const c = row.customers;
        const name = c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Unknown';
        countMap.set(row.referrer_id, { name, count: 1 });
      }
    }
  }

  const topReferrers = Array.from(countMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: total ?? 0,
    thisPeriod: thisPeriod ?? 0,
    topReferrers,
  };
}

/**
 * Revoke a referral — sets status to 'revoked'. Does NOT reverse the point credits
 * (that should be a separate manual adjustment if needed).
 */
export async function revokeReferral(referralId: string, restaurantId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('referrals')
    .update({ status: 'revoked' })
    .eq('id', referralId)
    .eq('restaurant_id', restaurantId);

  if (error) {
    logger.error({ ctx: CTX, msg: 'Failed to revoke referral', rid: restaurantId, referralId, err: error });
    return false;
  }

  auditLog({
    restaurantId,
    action: 'referral.revoked',
    targetType: 'referral',
    targetId: referralId,
  });

  logger.info({ ctx: CTX, msg: 'Referral revoked', rid: restaurantId, referralId });
  return true;
}
