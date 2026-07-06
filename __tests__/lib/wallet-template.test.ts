/**
 * Tests for ensureDefaultWalletTemplate — auto-provisioning of a generic
 * default wallet template after loyalty configuration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../helpers/fake-db';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

import { ensureDefaultWalletTemplate } from '@/lib/wallet-template';

const RID = 'rest-001';

function seed(overrides: Record<string, Record<string, unknown>[]> = {}) {
  dbHolder.db = createFakeDb({
    restaurants: [{ id: RID, name: 'Chez Test', primary_color: '#FF6B35' }],
    loyalty_settings: [{ restaurant_id: RID, program_type: 'stamps', stamps_total: 8, reward_message: 'Dessert offert' }],
    wallet_pass_templates: [],
    ...overrides,
  });
}

beforeEach(() => { vi.clearAllMocks(); seed(); });

describe('ensureDefaultWalletTemplate', () => {
  it('creates a generic default template derived from loyalty settings', async () => {
    const res = await ensureDefaultWalletTemplate(RID);
    expect(res.created).toBe(true);
    expect(res.templateId).toBeTruthy();

    const tpls = dbHolder.db.rows('wallet_pass_templates');
    expect(tpls).toHaveLength(1);
    const t = tpls[0];
    expect(t.pass_kind).toBe('stamps');
    expect(t.is_default).toBe(true);
    expect(t.status).toBe('published');
    expect(t.name).toBe('Chez Test — Carte de fidélité');
    expect(t.primary_color).toBe('#FF6B35'); // restaurant branding
    expect((t.config_json as Record<string, unknown>).stamps_total).toBe(8);
    expect((t.config_json as Record<string, unknown>).reward_message).toBe('Dessert offert');
  });

  it('derives a points template when the program is points-based', async () => {
    seed({ loyalty_settings: [{ restaurant_id: RID, program_type: 'points', reward_threshold: 300, points_per_scan: 5, reward_message: 'Menu offert' }] });
    const res = await ensureDefaultWalletTemplate(RID);
    expect(res.created).toBe(true);
    const t = dbHolder.db.rows('wallet_pass_templates')[0];
    expect(t.pass_kind).toBe('points');
    expect((t.config_json as Record<string, unknown>).reward_threshold).toBe(300);
    expect((t.config_json as Record<string, unknown>).points_per_scan).toBe(5);
  });

  it('is idempotent — does not create a second template if one is published', async () => {
    seed({ wallet_pass_templates: [{ id: 'existing', restaurant_id: RID, status: 'published', is_default: true }] });
    const res = await ensureDefaultWalletTemplate(RID);
    expect(res.created).toBe(false);
    expect(res.templateId).toBe('existing');
    expect(dbHolder.db.rows('wallet_pass_templates')).toHaveLength(1);
  });

  it('falls back to sensible defaults when loyalty settings are missing', async () => {
    seed({ loyalty_settings: [] });
    const res = await ensureDefaultWalletTemplate(RID);
    expect(res.created).toBe(true);
    const t = dbHolder.db.rows('wallet_pass_templates')[0];
    expect(t.pass_kind).toBe('stamps'); // default
    expect((t.config_json as Record<string, unknown>).stamps_total).toBe(10);
    expect(t.primary_color).toBe('#FF6B35'); // still uses restaurant branding
  });
});
