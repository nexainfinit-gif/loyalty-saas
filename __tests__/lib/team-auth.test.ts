/**
 * Option B — comptes équipe : résolution team_members dans getAuthContext
 * et refus par défaut du rôle 'staff' dans requireAuth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { createFakeDb, type FakeDb } from '../helpers/fake-db';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };
const USER = 'user-staff-1';

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => dbHolder.db.from(t),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } }, error: null })) },
  },
}));
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));

import { getAuthContext, requireAuth } from '@/lib/server-auth';

const REST = 'rest-salon-1';
const req = (cookie = '') =>
  new Request('http://x/api/test', { headers: { Authorization: 'Bearer tok', ...(cookie ? { cookie } : {}) } });

function seed(opts: { owned?: boolean; teamRole?: 'staff' | 'restaurant_admin' }) {
  dbHolder.db = createFakeDb({
    restaurants: [
      { id: REST, owner_id: opts.owned ? USER : 'someone-else', is_demo: false, plan: 'pro', plan_id: null, wallet_studio_enabled: false, created_at: '2026-01-01' },
    ],
    profiles: [],
    plan_features: [],
    team_members: opts.teamRole
      ? [{ id: 'tm1', restaurant_id: REST, user_id: USER, role: opts.teamRole }]
      : [],
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('getAuthContext — comptes équipe', () => {
  it('propriétaire → memberRole owner', async () => {
    seed({ owned: true });
    const ctx = await getAuthContext(req());
    expect(ctx?.restaurantId).toBe(REST);
    expect(ctx?.memberRole).toBe('owner');
  });

  it('membre staff sans restaurant possédé → fallback sur son salon, memberRole staff', async () => {
    seed({ owned: false, teamRole: 'staff' });
    const ctx = await getAuthContext(req());
    expect(ctx?.restaurantId).toBe(REST);
    expect(ctx?.memberRole).toBe('staff');
  });

  it('membre restaurant_admin → memberRole restaurant_admin', async () => {
    seed({ owned: false, teamRole: 'restaurant_admin' });
    const ctx = await getAuthContext(req());
    expect(ctx?.memberRole).toBe('restaurant_admin');
  });

  it('cookie selected_restaurant honoré pour un MEMBRE (pas seulement owner)', async () => {
    seed({ owned: false, teamRole: 'staff' });
    const ctx = await getAuthContext(req(`selected_restaurant=${REST}`));
    expect(ctx?.restaurantId).toBe(REST);
    expect(ctx?.memberRole).toBe('staff');
  });

  it('cookie vers un restaurant NI possédé NI membre → ignoré (isolation)', async () => {
    dbHolder.db = createFakeDb({
      restaurants: [
        { id: 'rest-mine', owner_id: USER, is_demo: false, plan: 'pro', plan_id: null, wallet_studio_enabled: false, created_at: '2026-01-01' },
        { id: 'rest-other', owner_id: 'x', is_demo: false, plan: 'pro', plan_id: null, wallet_studio_enabled: false, created_at: '2026-01-02' },
      ],
      profiles: [], plan_features: [], team_members: [],
    });
    const ctx = await getAuthContext(req('selected_restaurant=rest-other'));
    expect(ctx?.restaurantId).toBe('rest-mine'); // pas de fuite cross-tenant
    expect(ctx?.memberRole).toBe('owner');
  });
});

describe('requireAuth — refus staff par défaut', () => {
  it('staff refusé (403) sur une route standard', async () => {
    seed({ owned: false, teamRole: 'staff' });
    const r = await requireAuth(req());
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });

  it('staff accepté avec allowStaff (routes agenda)', async () => {
    seed({ owned: false, teamRole: 'staff' });
    const r = await requireAuth(req(), { allowStaff: true });
    expect(r).not.toBeInstanceOf(NextResponse);
    expect((r as { memberRole: string }).memberRole).toBe('staff');
  });

  it('restaurant_admin passe partout (équivalent gérant)', async () => {
    seed({ owned: false, teamRole: 'restaurant_admin' });
    const r = await requireAuth(req());
    expect(r).not.toBeInstanceOf(NextResponse);
  });

  it('owner inchangé', async () => {
    seed({ owned: true });
    const r = await requireAuth(req());
    expect(r).not.toBeInstanceOf(NextResponse);
    expect((r as { memberRole: string }).memberRole).toBe('owner');
  });
});
