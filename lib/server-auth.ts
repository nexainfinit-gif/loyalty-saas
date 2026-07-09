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
  /** true when platform owner is impersonating another restaurant via demo mode */
  impersonating?: boolean;
  /**
   * Rôle de l'utilisateur SUR CE restaurant (distinct de platformRole) :
   * 'owner' = propriétaire du restaurant ; 'restaurant_admin' | 'staff' =
   * membre d'équipe (table team_members). Les guards refusent 'staff' par
   * défaut — les routes agenda l'acceptent via requireAuth(req, { allowStaff }).
   */
  memberRole: 'owner' | 'restaurant_admin' | 'staff';
}

/* ── Internal: resolve user ID from Bearer header or cookie session ────────── */

async function resolveUserId(request: Request): Promise<string | null> {
  const raw   = request.headers.get('Authorization') ?? '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';

  // Path 1: Bearer token (API calls from client components)
  if (token) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return user.id;
  }

  // Path 2: Cookie session fallback (server components / browser navigation)
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/* ── Internal: build full auth context (parallel DB queries) ──────────────── */

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  const userId = await resolveUserId(request);
  if (!userId) return null;

  const [{ data: restaurants }, { data: profile }, { data: memberships }] = await Promise.all([
    supabaseAdmin
      .from('restaurants')
      .select('id, plan, plan_id, wallet_studio_enabled')
      .eq('owner_id', userId)
      .neq('is_demo', true)
      .order('created_at', { ascending: true })
      .limit(1),
    supabaseAdmin
      .from('profiles')
      .select('platform_role')
      .eq('id', userId)
      .maybeSingle(),
    // Comptes équipe (option B) : rattachements team_members de l'utilisateur.
    supabaseAdmin
      .from('team_members')
      .select('restaurant_id, role')
      .eq('user_id', userId),
  ]);

  let restaurant = restaurants?.[0] ?? null;
  const role = (profile?.platform_role ?? 'restaurant_admin') as PlatformRole;
  const teamRoleFor = (rid: string): 'restaurant_admin' | 'staff' | null => {
    const m = (memberships ?? []).find((x) => x.restaurant_id === rid);
    return m ? ((m.role === 'restaurant_admin' ? 'restaurant_admin' : 'staff')) : null;
  };
  // Rôle sur le restaurant actif ; recalculé si la sélection change.
  let memberRole: AuthContext['memberRole'] = 'owner';

  const cookieHeader = request.headers.get('cookie') ?? '';

  // ── Restaurant switch: le cookie `selected_restaurant` est honoré si le
  //    caller POSSÈDE le restaurant, ou s'il en est MEMBRE d'équipe (option B).
  //    Distinct de l'impersonation (platform-owner cross-tenant, ci-dessous). ──
  const selectedMatch = cookieHeader.match(/(?:^|;\s*)selected_restaurant=([^;]+)/);
  const selectedId = selectedMatch?.[1]?.trim() || null;
  if (selectedId && selectedId !== restaurant?.id) {
    const { data: sel } = await supabaseAdmin
      .from('restaurants')
      .select('id, plan, plan_id, wallet_studio_enabled, owner_id')
      .eq('id', selectedId)
      .neq('is_demo', true)
      .maybeSingle();
    if (sel && sel.owner_id === userId) {
      restaurant = sel;
    } else if (sel) {
      const tr = teamRoleFor(sel.id);
      if (tr) { restaurant = sel; memberRole = tr; }
    }
  }

  // ── Fallback membre d'équipe : aucun restaurant possédé → premier
  //    rattachement team_members (un coiffeur invité atterrit sur son salon). ──
  if (!restaurant && (memberships?.length ?? 0) > 0) {
    const first = memberships![0];
    const { data: teamResto } = await supabaseAdmin
      .from('restaurants')
      .select('id, plan, plan_id, wallet_studio_enabled')
      .eq('id', first.restaurant_id)
      .maybeSingle();
    if (teamResto) {
      restaurant = teamResto;
      memberRole = first.role === 'restaurant_admin' ? 'restaurant_admin' : 'staff';
    }
  }

  // ── Impersonation: platform owner can override restaurant context via cookie ──
  const impersonateMatch = cookieHeader.match(/(?:^|;\s*)x-admin-impersonate=([^;]+)/);
  const impersonateId = impersonateMatch?.[1]?.trim() || null;

  let targetRestaurant = restaurant;
  let impersonating = false;

  if (impersonateId && role === 'owner') {
    const { data: impersonated } = await supabaseAdmin
      .from('restaurants')
      .select('id, plan, plan_id, wallet_studio_enabled')
      .eq('id', impersonateId)
      .maybeSingle();
    if (impersonated) {
      targetRestaurant = impersonated;
      impersonating = true;
      memberRole = 'owner'; // le platform owner impersonifie avec les pleins droits
    }
  }

  const plan        = targetRestaurant?.plan ?? 'free';
  const planId      = targetRestaurant?.plan_id ?? null;
  const manualGrant = targetRestaurant?.wallet_studio_enabled ?? false;

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
    platformRole: role,
    restaurantId: targetRestaurant?.id ?? null,
    plan,
    planId,
    features,
    walletEnabled,
    impersonating,
    memberRole,
  };
}

/* ── Guards ───────────────────────────────────────────────────────────────── */

/**
 * Any authenticated user with dashboard rights.
 * SÉCURITÉ (option B) : les membres d'équipe au rôle 'staff' sont refusés par
 * défaut sur TOUTES les routes — seules les routes agenda opt-in via
 * `requireAuth(req, { allowStaff: true })`. 'restaurant_admin' (gérant invité)
 * a les mêmes droits que le propriétaire du restaurant.
 */
export async function requireAuth(
  request: Request,
  opts?: { allowStaff?: boolean },
): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }
  if (ctx.memberRole === 'staff' && !opts?.allowStaff) {
    return NextResponse.json(
      { error: 'Accès réservé au gérant de l\'établissement.' },
      { status: 403 },
    );
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
): Promise<{ restaurantId: string; userId: string | null } | NextResponse> {
  // SÉCURITÉ (2026-07-09) : l'accès par X-Scanner-Token (lien caisse partageable
  // à l'infini) est SUPPRIMÉ à la demande du propriétaire. Le staff se connecte
  // désormais avec son compte équipe (email + code OTP Supabase) — voir
  // team_members / option B. Seule la session reste acceptée ci-dessous.

  // Path 2: owner Supabase session (existing dashboard scanner flow)
  const ctx = await getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }
  if (!ctx.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }
  return { restaurantId: ctx.restaurantId, userId: ctx.userId };
}

/**
 * Feature gate — checks plan_features for a specific feature key.
 * Call AFTER requireAuth/requireOwner to get the AuthContext.
 * Returns 403 with upgrade message if feature is not enabled.
 */
export function requireFeature(
  ctx: AuthContext,
  featureKey: string,
  label?: string,
): NextResponse | null {
  if (ctx.features[featureKey]) return null; // allowed
  return NextResponse.json(
    {
      error: `Fonctionnalité "${label ?? featureKey}" non disponible avec votre plan. Passez à un plan supérieur.`,
      upgrade: true,
      feature: featureKey,
    },
    { status: 403 },
  );
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
