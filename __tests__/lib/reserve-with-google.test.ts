import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  verifyRwgAuth, isRwgConfigured,
  buildMerchantFeed, buildServicesFeed, buildAvailabilityEntry, mapBookingStatus,
} from '@/lib/reserve-with-google';

const OLD = { ...process.env };
afterEach(() => { process.env = { ...OLD }; vi.restoreAllMocks(); });

describe('verifyRwgAuth', () => {
  it('non configuré → false, jamais true', () => {
    delete process.env.RWG_AUTH_TOKEN;
    expect(isRwgConfigured()).toBe(false);
    expect(verifyRwgAuth('Bearer whatever')).toBe(false);
  });
  it('Bearer valide', () => {
    process.env.RWG_AUTH_TOKEN = 'secret-token';
    expect(verifyRwgAuth('Bearer secret-token')).toBe(true);
    expect(verifyRwgAuth('Bearer wrong')).toBe(false);
    expect(verifyRwgAuth(null)).toBe(false);
  });
  it('Basic auth (password = token)', () => {
    process.env.RWG_AUTH_TOKEN = 'secret-token';
    const basic = 'Basic ' + Buffer.from('google:secret-token').toString('base64');
    expect(verifyRwgAuth(basic)).toBe(true);
    const bad = 'Basic ' + Buffer.from('google:nope').toString('base64');
    expect(verifyRwgAuth(bad)).toBe(false);
  });
});

describe('buildMerchantFeed', () => {
  it('mappe les marchands avec URL de réservation', () => {
    const feed = buildMerchantFeed(
      [{ id: 'r1', name: 'Salon X', slug: 'salon-x', phone: '+32470', city: 'Bruxelles' }],
      'https://app.rebites.be',
    );
    expect(feed.merchant[0]).toMatchObject({
      merchant_id: 'r1', name: 'Salon X', telephone: '+32470',
      url: 'https://app.rebites.be/fr/book/salon-x', category: 'health_and_beauty',
    });
    expect(feed.merchant[0].geo?.address.locality).toBe('Bruxelles');
    expect(typeof feed.metadata.generation_timestamp).toBe('number');
  });
});

describe('buildServicesFeed', () => {
  it('prix converti en micros EUR + durée en secondes', () => {
    const feed = buildServicesFeed([
      { id: 's1', restaurant_id: 'r1', name: 'Coupe', duration_minutes: 30, price: 25 },
    ]);
    expect(feed.service[0]).toMatchObject({
      merchant_id: 'r1', service_id: 's1', name: 'Coupe',
      duration_sec: 1800,
    });
    expect(feed.service[0].price).toEqual({ price_micros: 25_000_000, currency_code: 'EUR' });
  });
});

describe('buildAvailabilityEntry', () => {
  it('une entrée par créneau disponible, spots_open=1', () => {
    const entries = buildAvailabilityEntry({
      merchantId: 'r1', serviceId: 's1', staffId: 'st1',
      date: '2026-07-10', startTimes: ['09:00', '09:30'], durationMinutes: 30,
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ merchant_id: 'r1', service_id: 's1', duration_sec: 1800, spots_open: 1 });
    expect(entries[0].resources.staff_id).toBe('st1');
  });
});

describe('mapBookingStatus', () => {
  it('mappe les statuts internes → Maps Booking', () => {
    expect(mapBookingStatus('confirmed')).toBe('CONFIRMED');
    expect(mapBookingStatus('cancelled')).toBe('CANCELED');
    expect(mapBookingStatus('no_show')).toBe('NO_SHOW');
    expect(mapBookingStatus('completed')).toBe('COMPLETED');
    expect(mapBookingStatus('pending_payment')).toBe('PENDING');
    expect(mapBookingStatus('weird')).toBe('PENDING');
  });
});
