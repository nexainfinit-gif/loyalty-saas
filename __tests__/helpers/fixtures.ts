/**
 * Shared test fixtures — mock data objects for all domains.
 */

export const RESTAURANT = {
  id: 'rest-001',
  name: 'Chez Test',
  slug: 'chez-test',
  color: '#4F6BED',
  primary_color: '#4F6BED',
  logo_url: null,
  owner_id: 'owner-001',
  plan: 'free',
  plan_id: 'plan-001',
  business_type: 'restaurant',
  scanner_token: 'scanner-token-001',
};

export const RESTAURANT_B = {
  ...RESTAURANT,
  id: 'rest-002',
  name: 'Autre Restaurant',
  slug: 'autre-resto',
  owner_id: 'owner-002',
  scanner_token: 'scanner-token-002',
};

export const LOYALTY_SETTINGS_POINTS = {
  restaurant_id: 'rest-001',
  points_per_scan: 10,
  reward_threshold: 100,
  reward_message: 'Bravo ! Un dessert offert !',
  program_type: 'points',
  stamps_total: 10,
};

export const LOYALTY_SETTINGS_STAMPS = {
  ...LOYALTY_SETTINGS_POINTS,
  program_type: 'stamps',
  stamps_total: 10,
};

export const CUSTOMER = {
  id: 'cust-001',
  restaurant_id: 'rest-001',
  first_name: 'Alice',
  last_name: 'Dupont',
  email: 'alice@example.com',
  qr_token: 'qr-token-alice-001',
  total_points: 50,
  total_visits: 5,
  stamps_count: 5,
  completed_cards: 0,
  birth_date: '1990-06-15',
  postal_code: '75001',
  marketing_consent: true,
  consent_marketing: true,
  consent_date: '2026-01-01T00:00:00Z',
  last_visit_at: '2026-03-01T12:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  phone: '+33612345678',
};

export const SERVICE = {
  id: 'svc-001',
  restaurant_id: 'rest-001',
  name: 'Coupe Homme',
  duration_minutes: 30,
  price: 25,
  category: 'Coiffure',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
};

export const STAFF = {
  id: 'staff-001',
  restaurant_id: 'rest-001',
  name: 'Marie',
  email: 'marie@example.com',
  phone: null,
  avatar_url: null,
  service_ids: ['svc-001', 'svc-002'],
  active: true,
  created_at: '2026-01-01T00:00:00Z',
};

export const APPOINTMENT = {
  id: 'apt-001',
  restaurant_id: 'rest-001',
  client_id: null,
  staff_id: 'staff-001',
  service_id: 'svc-001',
  date: '2026-03-15',
  start_time: '10:00',
  end_time: '10:30',
  status: 'confirmed' as const,
  client_name: 'Bob Client',
  client_email: 'bob@example.com',
  client_phone: '+33612345678',
  notes: null,
  created_at: '2026-03-10T00:00:00Z',
};

export const APPOINTMENT_SETTINGS = {
  id: 'settings-001',
  restaurant_id: 'rest-001',
  slot_duration_minutes: 15,
  buffer_minutes: 10,
  max_advance_days: 30,
  min_advance_hours: 2,
  working_days: [1, 2, 3, 4, 5, 6],
  opening_time: '09:00',
  closing_time: '19:00',
  confirmation_message: null,
};

export const NO_SHOW_STATS = {
  restaurant_id: 'rest-001',
  client_email: 'bob@example.com',
  no_show_count: 2,
  last_no_show_at: '2026-03-05T14:00:00Z',
};

export const AUTH_CONTEXT = {
  userId: 'owner-001',
  restaurantId: 'rest-001',
  platformRole: 'owner' as const,
  plan: 'free',
  features: {} as Record<string, boolean>,
  walletEnabled: false,
};
