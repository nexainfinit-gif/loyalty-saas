import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type PlatformRole = 'owner' | 'restaurant_admin' | 'staff';

export interface AuthContext {
  userId:       string;
  platformRole: PlatformRole;
  restaurantId: string | null;
  plan:         string;
  planId:       string | null;
  /**
   * Feature flags loaded from plan_features for this restaurant's plan.
   * Falls back to empty object when plan_id is not yet set.
   */
  features:     Record<string, boolean>;
  /**
   * true when wallet studio is accessible for this restaurant.
   * Derived from features['wallet_studio'] when plan_id is set,
   * otherwise falls back to plan !== 'free' check for backward compat.
   * Also granted by per-restaurant wallet_studio_enabled manual override.
   */
  walletEnabled: boolean;
}

/* ── Internal: resolve user ID from Bearer header or cookie session ────────── */

async function resolveUserId(request: Request): Promise<string | null> {
  const supabase = await createClient();

  const raw   = request.headers.get('Authorization') ?? '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';

  if (token) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) return user.id;
  }

  // Cookie session fallback (browser navigation after SupabaseSessionSync writes cookies)
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* ── Internal: build full auth context (parallel DB queries) ──────────────── */

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const userId = await resolveUserId(request);
  if (!userId) return null;

  const [{ data: restaurant }, { data: profile }] = await Promise.all([
    supabaseAdmin
      .from('restaurants')
      .select('id, plan, plan_id, wallet_studio_enabled')
      .eq('owner_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('platform_role')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const plan        = restaurant?.plan ?? 'free';
  const planId      = restaurant?.plan_id ?? null;
  const manualGrant = restaurant?.wallet_studio_enabled ?? false;

  // Load feature flags from plan_features when plan_id is available
  let features: Record<string, boolean> = {};
  if (planId) {
    const { data: pf } = await supabaseAdmin
      .from('plan_features')
      .select('feature_key, enabled')
      .eq('plan_id', planId);
    features = Object.fromEntries((pf ?? []).map((f) => [f.feature_key, f.enabled]));
  }

  // walletEnabled: use DB feature flag when available, else fall back to plan string
  const walletEnabled = 'wallet_studio' in features
    ? (features['wallet_studio'] || manualGrant)
    : (plan !== 'free' || manualGrant);

  return {
    userId,
    platformRole: (profile?.platform_role ?? 'restaurant_admin') as PlatformRole,
    restaurantId: restaurant?.id ?? null,
    plan,
    planId,
    features,
    walletEnabled,
  };
}

/* ── Guards ───────────────────────────────────────────────────────────────── */

/** Any authenticated user. */
export async function requireAuth(
  request: Request,
): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }
  return ctx;
}

/**
 * Platform owner only.
 * Used on all Wallet Studio routes right now.
 * When you want to open Wallet Studio to individual restaurants,
 * switch their routes to requireWalletAccess() and set wallet_studio_enabled = true.
 */
export async function requireOwner(
  request: Request,
): Promise<AuthContext | NextResponse> {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;
  if (result.platformRole !== 'owner') {
    return NextResponse.json(
      { error: 'Accès réservé au propriétaire de la plateforme.' },
      { status: 403 },
    );
  }
  return result;
}

/**
 * Wallet Studio access — forward-compatible gate:
 *   - owner              → always allowed
 *   - restaurant_admin   → allowed if their restaurant has wallet_studio_enabled = true
 *
 * To open Wallet Studio to a restaurant:
 *   UPDATE restaurants SET wallet_studio_enabled = true WHERE id = '<id>';
 * Then switch that restaurant's routes from requireOwner() to requireWalletAccess().
 */
/**
 * Scanner auth — accepts EITHER:
 *   1. X-Scanner-Token header  → public cashier scanner page (no Supabase session required)
 *   2. Supabase owner session  → dashboard scanner (backward compat)
 *
 * Returns { restaurantId } on success. restaurantId is always a valid non-null string.
 * Use this guard on POST /api/scan/[token] instead of requireAuth().
 */
export async function requireScannerAuth(
  request: Request,
): Promise<{ restaurantId: string } | NextResponse> {
  // Path 1: public cashier scanner — X-Scanner-Token header
  const scannerToken = request.headers.get('X-Scanner-Token');
  if (scannerToken) {
    const { data: restaurant } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('scanner_token', scannerToken)
      .maybeSingle();

    if (restaurant) return { restaurantId: restaurant.id };
    return NextResponse.json({ error: 'Token scanner invalide.' }, { status: 401 });
  }

  // Path 2: owner Supabase session (existing dashboard scanner flow)
  const ctx = await getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }
  if (!ctx.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }
  return { restaurantId: ctx.restaurantId };
}

export async function requireWalletAccess(
  request: Request,
): Promise<AuthContext | NextResponse> {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;
  if (result.platformRole === 'owner') return result;
  if (result.walletEnabled) return result;
  return NextResponse.json(
    { error: 'Wallet Studio non activé pour ce compte.' },
    { status: 403 },
  );
}
