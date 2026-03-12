/**
 * k6 load test — Public routes
 *
 * Tests the unauthenticated endpoints that face the internet:
 *   1. GET  /api/register/{slug}/restaurant  (restaurant branding lookup)
 *   2. POST /api/register/{slug}             (customer registration)
 *   3. GET  /api/wallet/passes/{id}/pkpass    (Apple pass download)
 *
 * Run:
 *   k6 run -e BASE_URL=http://localhost:3000 \
 *          -e RESTAURANT_SLUG=le-petit-bistro \
 *          -e TEST_PASS_ID=<uuid> \
 *          load-tests/public-routes.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, RESTAURANT_SLUG, TEST_PASS_ID, THRESHOLDS } from './config.js';

/* ── Custom metrics ─────────────────────────────────────────────────────── */

const registrationDuration = new Trend('registration_duration', true);
const rateLimited = new Counter('rate_limited_responses');

/* ── Scenarios ──────────────────────────────────────────────────────────── */

export const options = {
  scenarios: {
    // Steady traffic: restaurant page loads (branding lookup)
    restaurant_lookup: {
      executor: 'constant-arrival-rate',
      exec: 'restaurantLookup',
      rate: 20,            // 20 req/s
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },

    // Registration burst: simulates a busy evening with 5 sign-ups/s
    registration_burst: {
      executor: 'ramping-arrival-rate',
      exec: 'registerCustomer',
      startRate: 1,
      timeUnit: '1s',
      stages: [
        { target: 5, duration: '30s' },   // ramp up
        { target: 5, duration: '1m' },     // sustain
        { target: 0, duration: '30s' },    // ramp down
      ],
      preAllocatedVUs: 20,
      maxVUs: 100,
    },

    // pkpass download: moderate steady load
    pkpass_download: {
      executor: 'constant-arrival-rate',
      exec: 'downloadPkpass',
      rate: 5,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 5,
      maxVUs: 30,
    },
  },

  thresholds: {
    ...THRESHOLDS,
    registration_duration: ['p(95)<800'],
    rate_limited_responses: ['count<50'],
  },
};

/* ── Test functions ─────────────────────────────────────────────────────── */

/** 1. Restaurant branding lookup — lightweight GET */
export function restaurantLookup() {
  const res = http.get(`${BASE_URL}/api/register/${RESTAURANT_SLUG}/restaurant`);

  check(res, {
    'restaurant lookup 200': (r) => r.status === 200,
    'has restaurant name': (r) => {
      try { return JSON.parse(r.body).name !== undefined; }
      catch { return false; }
    },
  });

  if (res.status === 429) rateLimited.add(1);
}

/** 2. Customer registration — POST with unique email per VU iteration */
export function registerCustomer() {
  const uniqueEmail = `loadtest+${Date.now()}-${__VU}-${__ITER}@test.invalid`;

  const payload = JSON.stringify({
    first_name: 'LoadTest',
    email: uniqueEmail,
    consent_marketing: false,
  });

  const res = http.post(
    `${BASE_URL}/api/register/${RESTAURANT_SLUG}`,
    payload,
    { headers: { 'Content-Type': 'application/json' } },
  );

  registrationDuration.add(res.timings.duration);

  check(res, {
    'register 201': (r) => r.status === 201,
    'register has customer_id': (r) => {
      try { return JSON.parse(r.body).customer_id !== undefined; }
      catch { return false; }
    },
  });

  if (res.status === 429) {
    rateLimited.add(1);
    // Rate limited — back off slightly
    sleep(2);
  }
}

/** 3. Apple pass download — CPU-intensive pkpass generation */
export function downloadPkpass() {
  if (!TEST_PASS_ID) {
    // Skip if no pass ID configured
    sleep(1);
    return;
  }

  const res = http.get(`${BASE_URL}/api/wallet/passes/${TEST_PASS_ID}/pkpass`);

  check(res, {
    'pkpass 200 or 503': (r) => r.status === 200 || r.status === 503,
    'pkpass content-type': (r) =>
      r.status !== 200 || r.headers['Content-Type'] === 'application/vnd.apple.pkpass',
  });

  if (res.status === 429) rateLimited.add(1);
}
