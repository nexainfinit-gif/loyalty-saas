import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  verifyWebhookSignature,
  parseInboundButtonTaps,
  sendAppointmentReminderWhatsApp,
} from '@/lib/whatsapp';

const OLD = { ...process.env };
afterEach(() => { process.env = { ...OLD }; vi.restoreAllMocks(); });

describe('verifyWebhookSignature', () => {
  beforeEach(() => { process.env.WHATSAPP_APP_SECRET = 'shhh'; });

  it('accepte une signature HMAC valide', () => {
    const raw = '{"hello":"world"}';
    const sig = 'sha256=' + createHmac('sha256', 'shhh').update(raw, 'utf8').digest('hex');
    expect(verifyWebhookSignature(raw, sig)).toBe(true);
  });
  it('rejette une signature invalide / manquante', () => {
    expect(verifyWebhookSignature('{}', 'sha256=deadbeef')).toBe(false);
    expect(verifyWebhookSignature('{}', null)).toBe(false);
  });
  it('rejette si le secret n\'est pas configuré', () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const sig = 'sha256=' + createHmac('sha256', 'shhh').update('{}', 'utf8').digest('hex');
    expect(verifyWebhookSignature('{}', sig)).toBe(false);
  });
});

describe('parseInboundButtonTaps', () => {
  const wrap = (messages: unknown[]) => ({
    entry: [{ changes: [{ value: { messages } }] }],
  });

  it('extrait un tap de bouton template (type button)', () => {
    const taps = parseInboundButtonTaps(wrap([
      { from: '32470123456', type: 'button', button: { payload: 'CANCEL:abc-123' } },
    ]));
    expect(taps).toEqual([{ from: '32470123456', action: 'CANCEL', token: 'abc-123' }]);
  });
  it('extrait un bouton interactif (button_reply)', () => {
    const taps = parseInboundButtonTaps(wrap([
      { from: '32470000000', type: 'interactive', interactive: { button_reply: { id: 'CONFIRM:xyz' } } },
    ]));
    expect(taps).toEqual([{ from: '32470000000', action: 'CONFIRM', token: 'xyz' }]);
  });
  it('ignore les messages texte, accusés et payloads malformés', () => {
    expect(parseInboundButtonTaps(wrap([
      { from: '3247', type: 'text', text: { body: 'coucou' } },
      { from: '3247', type: 'button', button: { payload: 'NOSEP' } },
      { type: 'button', button: { payload: 'CANCEL:x' } }, // pas de from
    ]))).toEqual([]);
  });
  it('ne lève jamais sur un corps malformé', () => {
    expect(parseInboundButtonTaps(null)).toEqual([]);
    expect(parseInboundButtonTaps({})).toEqual([]);
    expect(parseInboundButtonTaps({ entry: 'nope' })).toEqual([]);
  });
});

describe('sendAppointmentReminderWhatsApp — boutons', () => {
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
  });

  it('joint les payloads Confirmer/Annuler quand un cancelToken est fourni', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await sendAppointmentReminderWhatsApp({
      to: '+32470123456', clientName: 'Alice', businessName: 'Salon X',
      dateTimeLabel: 'Demain à 14:30', cancelToken: 'tok-uuid',
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    const buttons = body.template.components.filter((c: { type: string }) => c.type === 'button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'CONFIRM:tok-uuid' }] });
    expect(buttons[1]).toMatchObject({ index: '1', parameters: [{ type: 'payload', payload: 'CANCEL:tok-uuid' }] });
  });

  it('sans cancelToken → aucun composant bouton', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await sendAppointmentReminderWhatsApp({
      to: '+32470123456', clientName: 'Alice', businessName: 'Salon X', dateTimeLabel: 'Demain à 14:30',
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.template.components.filter((c: { type: string }) => c.type === 'button')).toHaveLength(0);
  });
});
