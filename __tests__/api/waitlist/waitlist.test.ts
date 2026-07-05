/**
 * Tests for POST /api/waitlist — marketing site lead capture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, type FakeDb } from '../../helpers/fake-db';

const dbHolder: { db: FakeDb } = { db: createFakeDb({}) };

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => dbHolder.db.from(table) },
}));

const mockCheck = vi.fn(() => ({ success: true }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ check: () => mockCheck() }),
  getClientIp: () => '127.0.0.1',
}));

const mockSend = vi.fn().mockResolvedValue({ id: 'email-1' });
vi.mock('resend', () => ({
  Resend: class { emails = { send: (...args: unknown[]) => mockSend(...args) }; },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST, OPTIONS } from '@/app/api/waitlist/route';
import { NextRequest } from 'next/server';

function post(body: unknown, origin = 'https://rebites.be') {
  return POST(new NextRequest('https://app.rebites.be/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockReturnValue({ success: true });
  dbHolder.db = createFakeDb({ waitlist_leads: [] }, { uniques: { waitlist_leads: ['email'] } });
  process.env.ADMIN_EMAIL = 'admin@rebites.be';
});

describe('POST /api/waitlist', () => {
  it('stores the lead, notifies the admin, echoes the allowed origin', async () => {
    const res = await post({ email: 'Prospect@Example.com' });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://rebites.be');

    const leads = dbHolder.db.rows('waitlist_leads');
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe('prospect@example.com'); // normalized
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for duplicate emails (success, no re-notification)', async () => {
    await post({ email: 'dup@example.com' });
    mockSend.mockClear();

    const res = await post({ email: 'dup@example.com' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(dbHolder.db.rows('waitlist_leads')).toHaveLength(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects an invalid email with 400', async () => {
    const res = await post({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(dbHolder.db.rows('waitlist_leads')).toHaveLength(0);
  });

  it('rejects when rate-limited with 429', async () => {
    mockCheck.mockReturnValue({ success: false });
    const res = await post({ email: 'a@b.co' });
    expect(res.status).toBe(429);
  });

  it('falls back to a locked default origin for unknown origins', async () => {
    const res = await post({ email: 'x@y.co' }, 'https://evil.example');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://rebites.be');
  });

  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await OPTIONS(new NextRequest('https://app.rebites.be/api/waitlist', {
      method: 'OPTIONS',
      headers: { origin: 'https://www.rebites.be' },
    }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.rebites.be');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
