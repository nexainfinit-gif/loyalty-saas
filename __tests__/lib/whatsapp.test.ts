import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  normalizePhone,
  isWhatsAppConfigured,
  sendWhatsAppTemplate,
} from '@/lib/whatsapp';

describe('normalizePhone', () => {
  it('numéro national belge (0…) → +32', () => {
    expect(normalizePhone('0470 12 34 56')).toBe('32470123456');
    expect(normalizePhone('0470/12.34.56')).toBe('32470123456');
    expect(normalizePhone('04 70 12 34 56')).toBe('32470123456');
  });
  it('format international conservé', () => {
    expect(normalizePhone('+32 470 12 34 56')).toBe('32470123456');
    expect(normalizePhone('0032470123456')).toBe('32470123456');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('33612345678');
  });
  it('autre pays par défaut', () => {
    expect(normalizePhone('0612345678', '33')).toBe('33612345678');
  });
  it('rejette les valeurs invalides', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('123')).toBeNull();       // trop court
    expect(normalizePhone('abcdef')).toBeNull();
    expect(normalizePhone('0'.repeat(20))).toBeNull(); // trop long
  });
});

describe('isWhatsAppConfigured / sendWhatsAppTemplate', () => {
  const OLD = { ...process.env };
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { process.env = { ...OLD }; });

  it('non configuré → skip propre sans appel réseau', async () => {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(isWhatsAppConfigured()).toBe(false);
    const r = await sendWhatsAppTemplate({ to: '0470123456', template: 't', bodyParams: [] });
    expect(r).toEqual({ ok: false, skipped: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('téléphone invalide → skip sans appel réseau', async () => {
    process.env.WHATSAPP_TOKEN = 'x';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    const fetchSpy = vi.spyOn(global, 'fetch');
    const r = await sendWhatsAppTemplate({ to: '123', template: 't', bodyParams: [] });
    expect(r).toEqual({ ok: false, skipped: 'invalid_phone' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('configuré + valide → POST Graph API, ok', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"messages":[{"id":"wamid.x"}]}', { status: 200 }),
    );
    const r = await sendWhatsAppTemplate({
      to: '+32470123456', template: 'appointment_reminder',
      languageCode: 'fr', bodyParams: ['Alice', 'Salon X', 'Demain à 14:30'],
    });
    expect(r).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/999/messages');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe('32470123456');
    expect(body.template.name).toBe('appointment_reminder');
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text))
      .toEqual(['Alice', 'Salon X', 'Demain à 14:30']);
  });

  it('erreur HTTP → ok:false, jamais de throw', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const r = await sendWhatsAppTemplate({ to: '+32470123456', template: 't', bodyParams: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('http_401');
  });

  it('exception réseau → ok:false, jamais de throw', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
    const r = await sendWhatsAppTemplate({ to: '+32470123456', template: 't', bodyParams: [] });
    expect(r).toEqual({ ok: false, error: 'exception' });
  });
});
