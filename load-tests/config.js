/**
 * Shared config for all k6 load test scripts.
 *
 * Usage:
 *   BASE_URL=https://staging.rebites.be k6 run load-tests/public-routes.js
 *
 * Env vars (pass via -e or export):
 *   BASE_URL          — target host (default: http://localhost:3000)
 *   RESTAURANT_SLUG   — slug used for registration tests
 *   SCANNER_TOKEN     — X-Scanner-Token for scan route
 *   OWNER_TOKEN       — Supabase access_token for authenticated routes
 *   CRON_SECRET       — secret for cron endpoints
 *   TEST_CUSTOMER_QR  — a real qr_token for scan tests
 *   TEST_PASS_ID      — a real wallet_pass UUID for pkpass download tests
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const RESTAURANT_SLUG = __ENV.RESTAURANT_SLUG || 'le-petit-bistro';
export const SCANNER_TOKEN = __ENV.SCANNER_TOKEN || '';
export const OWNER_TOKEN = __ENV.OWNER_TOKEN || '';
export const CRON_SECRET = __ENV.CRON_SECRET || '';
export const TEST_CUSTOMER_QR = __ENV.TEST_CUSTOMER_QR || '';
export const TEST_PASS_ID = __ENV.TEST_PASS_ID || '';

/** Standard thresholds — adjust for your SLA */
export const THRESHOLDS = {
  http_req_duration: ['p(95)<500', 'p(99)<1500'],
  http_req_failed: ['rate<0.05'],
};

/** Standard headers */
export function authHeaders() {
  return {
    Authorization: `Bearer ${OWNER_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export function scannerHeaders() {
  return {
    'X-Scanner-Token': SCANNER_TOKEN,
    'Content-Type': 'application/json',
  };
}

export function cronHeaders() {
  return {
    Authorization: `Bearer ${CRON_SECRET}`,
  };
}
