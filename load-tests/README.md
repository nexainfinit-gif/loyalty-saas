# Load Tests — ReBites Loyalty SaaS

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Windows (winget)
winget install k6

# Docker
docker pull grafana/k6
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BASE_URL` | Yes | Target URL (e.g. `http://localhost:3000`) |
| `RESTAURANT_SLUG` | For registration tests | Slug of a test restaurant |
| `SCANNER_TOKEN` | For scan tests | `X-Scanner-Token` value from scanner page |
| `OWNER_TOKEN` | For auth tests | Supabase `access_token` from a logged-in session |
| `CRON_SECRET` | For cron tests | `CRON_SECRET` env var value |
| `TEST_CUSTOMER_QR` | For scan tests | A customer's `qr_token` UUID |
| `TEST_PASS_ID` | For pkpass tests | A `wallet_passes.id` UUID |

### Getting tokens

**OWNER_TOKEN**: Sign in to dashboard, open browser DevTools > Application > Cookies > find `sb-*-auth-token`, or run in console:
```js
const { data } = await supabase.auth.getSession();
console.log(data.session.access_token);
```

**SCANNER_TOKEN**: Found in the scanner page source or via the restaurant's scanner config.

**TEST_CUSTOMER_QR**: Query Supabase: `SELECT qr_token FROM customers WHERE restaurant_id = '...' LIMIT 1`

## Test Scripts

### 1. Public routes (no auth needed for restaurant lookup)
```bash
k6 run -e BASE_URL=http://localhost:3000 \
       -e RESTAURANT_SLUG=le-petit-bistro \
       -e TEST_PASS_ID=<uuid> \
       load-tests/public-routes.js
```

### 2. Scan route (most critical)
```bash
k6 run -e BASE_URL=http://localhost:3000 \
       -e SCANNER_TOKEN=<token> \
       -e TEST_CUSTOMER_QR=<qr_token> \
       load-tests/scan-route.js
```

### 3. Authenticated dashboard routes
```bash
k6 run -e BASE_URL=http://localhost:3000 \
       -e OWNER_TOKEN=<token> \
       load-tests/authenticated-routes.js
```

### 4. Full day simulation (comprehensive)
```bash
k6 run -e BASE_URL=http://localhost:3000 \
       -e RESTAURANT_SLUG=le-petit-bistro \
       -e SCANNER_TOKEN=<token> \
       -e OWNER_TOKEN=<token> \
       -e TEST_CUSTOMER_QR=<qr_token> \
       load-tests/realistic-day.js
```

## What Each Test Covers

| Script | Routes | Duration | Peak RPS |
|---|---|---|---|
| `public-routes.js` | register, restaurant lookup, pkpass | 2 min | ~30 |
| `scan-route.js` | scan (steady + rush + double-tap) | ~5 min | ~10 |
| `authenticated-routes.js` | campaigns, csv export, cron | ~3 min | ~10 |
| `realistic-day.js` | all of the above combined | ~5 min | ~22 |

## Thresholds & SLAs

All scripts enforce these defaults:
- **p95 response time** < 500ms
- **p99 response time** < 1500ms
- **Error rate** < 5%

Route-specific:
- Scan p95 < 300ms (must be fast for cashier UX)
- Registration p95 < 800ms
- CSV export p95 < 2000ms (large dataset)

## Important Notes

- **Test data**: Scans add real points. Use a dedicated test restaurant.
- **Rate limits**: Tests intentionally push against rate limits to verify they work. Some 429s are expected.
- **Double-tap test**: Documents the current double-point bug (no idempotency). Will be fixed by TODO-01.
- **Cleanup**: After testing, you may want to delete test customers: `DELETE FROM customers WHERE email LIKE '%@test.invalid'`
