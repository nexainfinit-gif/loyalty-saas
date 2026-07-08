import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../helpers/fake-db';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => dbHolder.db.from(t) },
}));

import { getReminderQuotaState, _clearPlanCache } from '@/lib/plan-limits';
import { REMINDER_PACKS, isReminderPackId } from '@/lib/reminder-packs';

const RID = 'rest-1';

function seed(includedByPlan: Record<string, number | null>, whatsappSentThisMonth: number) {
  const plans = Object.entries(includedByPlan).map(([key, v], i) => ({
    id: `plan-${i}`, key, max_customers: 500, max_templates: 3,
    max_campaigns_per_month: 8, max_emails_per_month: 5000,
    included_reminders_per_month: v,
  }));
  const monthStart = new Date();
  const reminders = Array.from({ length: whatsappSentThisMonth }, (_, i) => ({
    id: `r${i}`, restaurant_id: RID, type: 'whatsapp',
    sent_at: new Date(monthStart.getFullYear(), monthStart.getMonth(), 2).toISOString(),
  }));
  dbHolder.db = createFakeDb({ plans, plan_features: [], appointment_reminders: reminders });
  _clearPlanCache();
}

describe('getReminderQuotaState (modèle hybride)', () => {
  beforeEach(() => { _clearPlanCache(); });

  it('quota inclus non épuisé → canSend, restant correct', async () => {
    seed({ growth: 300 }, 120);
    const st = await getReminderQuotaState(RID, 'growth', 0);
    expect(st).toMatchObject({ included: 300, used: 120, credits: 0, canSend: true, unlimited: false });
  });

  it('quota inclus épuisé, aucun crédit → bloqué', async () => {
    seed({ starter: 100 }, 100);
    const st = await getReminderQuotaState(RID, 'starter', 0);
    expect(st.canSend).toBe(false);
    expect(st.used).toBe(100);
  });

  it('quota épuisé mais crédits dispo → canSend', async () => {
    seed({ starter: 100 }, 150);
    const st = await getReminderQuotaState(RID, 'starter', 50);
    expect(st.canSend).toBe(true);
    expect(st.credits).toBe(50);
  });

  it('plan illimité (NULL) → unlimited, jamais de comptage', async () => {
    seed({ pro: null }, 9999);
    const st = await getReminderQuotaState(RID, 'pro', 0);
    expect(st).toMatchObject({ included: -1, unlimited: true, canSend: true });
  });
});

describe('reminder packs', () => {
  it('packs définis avec prix cohérents', () => {
    expect(REMINDER_PACKS.small.credits).toBe(200);
    expect(REMINDER_PACKS.large.credits).toBe(500);
    expect(REMINDER_PACKS.small.priceCents).toBeGreaterThan(0);
  });
  it('isReminderPackId valide les ids', () => {
    expect(isReminderPackId('small')).toBe(true);
    expect(isReminderPackId('large')).toBe(true);
    expect(isReminderPackId('xl')).toBe(false);
    expect(isReminderPackId(null)).toBe(false);
  });
});
