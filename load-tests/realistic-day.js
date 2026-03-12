/**
 * k6 load test — Realistic restaurant day simulation
 *
 * Models a full day for a 1000-customer restaurant:
 *   - Morning: owner checks dashboard, exports CSV
 *   - Lunch rush: high scan rate + new registrations
 *   - Afternoon: moderate scans, owner sends campaign
 *   - Evening rush: peak scan rate
 *   - Close: owner reviews analytics
 *
 * This is the most comprehensive test — run after individual route tests pass.
 *
 * Run:
 *   k6 run -e BASE_URL=http://localhost:3000 \
 *          -e RESTAURANT_SLUG=le-petit-bistro \
 *          -e SCANNER_TOKEN=<token> \
 *          -e OWNER_TOKEN=<token> \
 *          -e TEST_CUSTOMER_QR=<qr_token> \
 *          load-tests/realistic-day.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import {
  BASE_URL,
  RESTAURANT_SLUG,
  SCANNER_TOKEN,
  OWNER_TOKEN,
  TEST_CUSTOMER_QR,
  THRESHOLDS,
  authHeaders,
} from './config.js';

/* ── Custom metrics ─────────────────────────────────────────────────────── */

const scanP95 = new Trend('scan_p95', true);
const registerP95 = new Trend('register_p95', true);
const dashboardP95 = new Trend('dashboard_p95', true);
const overallSuccess = new Rate('overall_success_rate');
const rateLimited = new Counter('rate_limited_total');

/* ── Scenario: compressed day in 5 minutes ──────────────────────────────── */

export const options = {
  scenarios: {
    // Owner morning routine (dashboard checks)
    morning_dashboard: {
      executor: 'per-vu-iterations',
      exec: 'ownerDashboard',
      vus: 1,
      iterations: 3,
      startTime: '0s',
    },

    // Lunch rush: scans ramp up
    lunch_scans: {
      executor: 'ramping-arrival-rate',
      exec: 'lunchScan',
      startRate: 1,
      timeUnit: '1s',
      stages: [
        { target: 8, duration: '30s' },    // ramp up to lunch peak
        { target: 8, duration: '1m' },      // sustain lunch rush
        { target: 2, duration: '30s' },     // taper off
      ],
      preAllocatedVUs: 10,
      maxVUs: 40,
      startTime: '15s',
    },

    // Lunch registrations: new customers signing up
    lunch_registrations: {
      executor: 'ramping-arrival-rate',
      exec: 'newRegistration',
      startRate: 0,
      timeUnit: '1s',
      stages: [
        { target: 2, duration: '30s' },
        { target: 2, duration: '1m' },
        { target: 0, duration: '30s' },
      ],
      preAllocatedVUs: 5,
      maxVUs: 20,
      startTime: '15s',
    },

    // Afternoon: owner sends a campaign (single burst)
    afternoon_campaign: {
      executor: 'per-vu-iterations',
      exec: 'ownerDashboard',
      vus: 1,
      iterations: 2,
      startTime: '2m30s',
    },

    // Evening rush: peak scan load
    evening_scans: {
      executor: 'ramping-arrival-rate',
      exec: 'lunchScan',
      startRate: 2,
      timeUnit: '1s',
      stages: [
        { target: 12, duration: '20s' },   // fast ramp to dinner peak
        { target: 12, duration: '1m' },     // sustain peak
        { target: 0, duration: '20s' },     // close
      ],
      preAllocatedVUs: 15,
      maxVUs: 60,
      startTime: '3m',
    },
  },

  thresholds: {
    ...THRESHOLDS,
    scan_p95: ['p(95)<400'],
    register_p95: ['p(95)<1000'],
    dashboard_p95: ['p(95)<800'],
    overall_success_rate: ['rate>0.92'],
    rate_limited_total: ['count<100'],
  },
};

/* ── Test functions ─────────────────────────────────────────────────────── */

/** Owner checks dashboard: campaigns list + CSV export */
export function ownerDashboard() {
  if (!OWNER_TOKEN) { sleep(1); return; }

  const headers = authHeaders();

  group('dashboard_load', () => {
    const res = http.get(`${BASE_URL}/api/compaigns`, { headers });
    dashboardP95.add(res.timings.duration);
    const ok = check(res, { 'campaigns 200': (r) => r.status === 200 });
    overallSuccess.add(ok ? 1 : 0);
  });

  group('csv_export', () => {
    const res = http.get(`${BASE_URL}/api/export-csv`, { headers });
    dashboardP95.add(res.timings.duration);
    const ok = check(res, { 'csv 200': (r) => r.status === 200 });
    overallSuccess.add(ok ? 1 : 0);
  });

  sleep(3 + Math.random() * 5);
}

/** QR scan during service */
export function lunchScan() {
  if (!TEST_CUSTOMER_QR || !SCANNER_TOKEN) { sleep(1); return; }

  const res = http.post(
    `${BASE_URL}/api/scan/${TEST_CUSTOMER_QR}`,
    null,
    { headers: { 'X-Scanner-Token': SCANNER_TOKEN } },
  );

  scanP95.add(res.timings.duration);

  const ok = check(res, {
    'scan 200': (r) => r.status === 200,
  });

  overallSuccess.add(ok ? 1 : 0);
  if (res.status === 429) rateLimited.add(1);
}

/** New customer registration during service */
export function newRegistration() {
  const email = `day-${Date.now()}-${__VU}-${__ITER}@test.invalid`;

  const res = http.post(
    `${BASE_URL}/api/register/${RESTAURANT_SLUG}`,
    JSON.stringify({
      first_name: 'Client',
      email,
      consent_marketing: false,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  registerP95.add(res.timings.duration);

  const ok = check(res, {
    'register 201': (r) => r.status === 201,
  });

  overallSuccess.add(ok ? 1 : 0);
  if (res.status === 429) rateLimited.add(1);
}
