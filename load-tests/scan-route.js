/**
 * k6 load test — Scan route (most critical for production)
 *
 * Simulates a busy restaurant with cashiers scanning QR codes.
 * This is the highest-throughput route during service hours.
 *
 * Run:
 *   k6 run -e BASE_URL=http://localhost:3000 \
 *          -e SCANNER_TOKEN=<token> \
 *          -e TEST_CUSTOMER_QR=<qr_token> \
 *          load-tests/scan-route.js
 *
 * NOTE: Each scan adds real points. Use a test restaurant + test customer.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { BASE_URL, SCANNER_TOKEN, TEST_CUSTOMER_QR, THRESHOLDS } from './config.js';

/* ── Custom metrics ─────────────────────────────────────────────────────── */

const scanDuration = new Trend('scan_duration', true);
const scanSuccess = new Rate('scan_success_rate');
const rateLimited = new Counter('rate_limited_responses');
const rewardTriggered = new Counter('rewards_triggered');

/* ── Scenarios ──────────────────────────────────────────────────────────── */

export const options = {
  scenarios: {
    // Normal service: ~2 scans/second (one cashier scanning steadily)
    steady_scanning: {
      executor: 'constant-arrival-rate',
      exec: 'scanQr',
      rate: 2,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },

    // Rush hour: ramp to 10 scans/second (multiple staff, busy period)
    rush_hour: {
      executor: 'ramping-arrival-rate',
      exec: 'scanQr',
      startRate: 2,
      timeUnit: '1s',
      stages: [
        { target: 10, duration: '30s' },
        { target: 10, duration: '1m' },
        { target: 2, duration: '30s' },
      ],
      preAllocatedVUs: 15,
      maxVUs: 50,
      startTime: '2m',  // starts after steady_scanning
    },

    // Double-tap stress: rapid-fire same token (simulates accidental re-scans)
    double_tap: {
      executor: 'per-vu-iterations',
      exec: 'doubleTapScan',
      vus: 5,
      iterations: 10,
      startTime: '4m',
    },
  },

  thresholds: {
    ...THRESHOLDS,
    scan_duration: ['p(95)<300', 'p(99)<600'],
    scan_success_rate: ['rate>0.90'],
  },
};

/* ── Test functions ─────────────────────────────────────────────────────── */

/** Single QR scan */
export function scanQr() {
  if (!TEST_CUSTOMER_QR || !SCANNER_TOKEN) {
    console.warn('Missing TEST_CUSTOMER_QR or SCANNER_TOKEN — skipping');
    sleep(1);
    return;
  }

  const res = http.post(
    `${BASE_URL}/api/scan/${TEST_CUSTOMER_QR}`,
    null,
    { headers: { 'X-Scanner-Token': SCANNER_TOKEN } },
  );

  scanDuration.add(res.timings.duration);

  const ok = check(res, {
    'scan 200': (r) => r.status === 200,
    'scan has points_added': (r) => {
      try { return JSON.parse(r.body).points_added !== undefined; }
      catch { return false; }
    },
  });

  scanSuccess.add(ok ? 1 : 0);

  if (res.status === 429) rateLimited.add(1);

  // Track reward triggers
  try {
    const body = JSON.parse(res.body);
    if (body.reward_triggered || body.stamp_card_completed) {
      rewardTriggered.add(1);
    }
  } catch { /* ignore */ }
}

/**
 * Double-tap scenario: 2 rapid scans of the same token with <100ms gap.
 * Without idempotency (TODO-01), both will succeed and award double points.
 * This test documents that behavior for baseline measurement.
 */
export function doubleTapScan() {
  if (!TEST_CUSTOMER_QR || !SCANNER_TOKEN) {
    sleep(1);
    return;
  }

  const headers = { 'X-Scanner-Token': SCANNER_TOKEN };
  const url = `${BASE_URL}/api/scan/${TEST_CUSTOMER_QR}`;

  // Fire two scans back-to-back (no sleep between)
  const res1 = http.post(url, null, { headers, tags: { name: 'double_tap_first' } });
  const res2 = http.post(url, null, { headers, tags: { name: 'double_tap_second' } });

  check(res1, { 'double-tap first 200': (r) => r.status === 200 });
  check(res2, { 'double-tap second 200|429': (r) => r.status === 200 || r.status === 429 });

  // Both returning 200 = double-point bug (expected until TODO-01 is implemented)
  if (res1.status === 200 && res2.status === 200) {
    try {
      const b1 = JSON.parse(res1.body);
      const b2 = JSON.parse(res2.body);
      if (b1.points_added > 0 && b2.points_added > 0) {
        console.warn(`DOUBLE POINTS: scan1=${b1.customer.total_points} scan2=${b2.customer.total_points}`);
      }
    } catch { /* ignore */ }
  }

  sleep(1);
}
