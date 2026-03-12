/**
 * k6 load test — Authenticated dashboard routes
 *
 * Simulates a restaurant owner using the dashboard:
 *   - Loading campaigns list
 *   - Exporting CSV
 *   - Listing passes for a customer
 *   - Sending a campaign
 *
 * Run:
 *   k6 run -e BASE_URL=http://localhost:3000 \
 *          -e OWNER_TOKEN=<supabase_access_token> \
 *          load-tests/authenticated-routes.js
 *
 * Get OWNER_TOKEN: sign in via Supabase, grab the access_token from the session.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, OWNER_TOKEN, THRESHOLDS, authHeaders } from './config.js';

/* ── Custom metrics ─────────────────────────────────────────────────────── */

const campaignsListDuration = new Trend('campaigns_list_duration', true);
const csvExportDuration = new Trend('csv_export_duration', true);

/* ── Scenarios ──────────────────────────────────────────────────────────── */

export const options = {
  scenarios: {
    // Single owner browsing the dashboard
    dashboard_session: {
      executor: 'per-vu-iterations',
      exec: 'dashboardSession',
      vus: 3,
      iterations: 10,
    },

    // Multiple owners hitting the platform concurrently
    multi_tenant: {
      executor: 'constant-vus',
      exec: 'dashboardSession',
      vus: 10,
      duration: '2m',
      startTime: '1m',
    },
  },

  thresholds: {
    ...THRESHOLDS,
    campaigns_list_duration: ['p(95)<400'],
    csv_export_duration: ['p(95)<2000'],
  },
};

/* ── Test functions ─────────────────────────────────────────────────────── */

export function dashboardSession() {
  if (!OWNER_TOKEN) {
    console.warn('Missing OWNER_TOKEN — skipping authenticated tests');
    sleep(1);
    return;
  }

  const headers = authHeaders();

  group('campaigns', () => {
    // List campaigns
    const listRes = http.get(`${BASE_URL}/api/compaigns`, { headers });
    campaignsListDuration.add(listRes.timings.duration);

    check(listRes, {
      'campaigns list 200': (r) => r.status === 200,
      'campaigns is array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).campaigns); }
        catch { return false; }
      },
    });
  });

  group('csv_export', () => {
    const csvRes = http.get(`${BASE_URL}/api/export-csv`, { headers });
    csvExportDuration.add(csvRes.timings.duration);

    check(csvRes, {
      'csv export 200': (r) => r.status === 200,
      'csv content-type': (r) =>
        (r.headers['Content-Type'] || '').includes('text/csv'),
    });
  });

  group('cron_birthdays', () => {
    // Only test if we have a cron secret — otherwise skip
    const cronSecret = __ENV.CRON_SECRET;
    if (!cronSecret) return;

    const res = http.get(`${BASE_URL}/api/cron/birthdays`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    check(res, {
      'cron birthdays 200': (r) => r.status === 200,
    });
  });

  // Simulate think time between actions
  sleep(2 + Math.random() * 3);
}
