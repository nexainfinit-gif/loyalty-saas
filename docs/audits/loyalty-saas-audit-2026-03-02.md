# Loyalty SaaS — Full Functional Audit
**Date**: 2026-03-02
**Auditor**: Claude Sonnet 4.6 (Senior SaaS Product Auditor / QA Lead)
**Version audited**: commit `410bb98` + Phase 3 wallet additions (pre-Step-1 patch)

---

## Executive Summary

The platform is a **multi-tenant loyalty SaaS** for restaurants with four main pillars:
customer self-registration, scan-based points/stamps accumulation, digital wallet issuance
(Google + Apple), and email campaigns. Core registration and scanning flows are functionally
present but carry a **critical data-integrity bug** that makes the entire loyalty mechanic
unreliable in production. Wallet issuance is functional but partially disconnected from live
customer data. Email campaigns work. The dashboard UI is well-structured.

**Launch readiness**: ~35%
**Critical blockers**: 3
**High-priority issues**: 7

---

## Feature Map

### 1. Customer Self-Registration

| Sub-feature | Status | Notes |
|---|---|---|
| Public registration page (`/register/[slug]`) | ✅ Working | Branded with restaurant color/logo |
| Form validation (required fields) | ✅ Working | Email, first/last name required |
| GDPR consent checkbox | ✅ Working | Stored in `marketing_consent` |
| Duplicate email handling | ✅ Working | Returns existing customer |
| QR token generation | ✅ Working | UUID stored in `customers.qr_token` |
| Welcome email | ✅ Working | Sent via Resend on registration |
| Restaurant discovery by slug | ✅ Working | Public page uses restaurant.slug |
| Short code on wallet pass | ✅ Working | Generated from `passId.slice(0,8)` |

### 2. Scan & Points/Stamps System

| Sub-feature | Status | Notes |
|---|---|---|
| QR camera scan (Chrome/Edge) | ✅ Working | BarcodeDetector API |
| QR camera scan (Firefox/Safari/iOS) | ✅ Working | jsqr canvas fallback |
| Manual code entry | ✅ Working | 3-step resolution (qr_token→id→short_code) |
| Token resolution (qr_token) | ✅ Working | Primary scan path |
| Token resolution (short_code) | ✅ Working | Manual entry path |
| Transaction record insert | ✅ Working | `transactions` table |
| **`customers.total_points` update** | ❌ **CRITICAL BUG** | **Never updated — stale forever** |
| **`customers.stamps_count` update** | ❌ **CRITICAL BUG** | **Never updated — stale forever** |
| `customers.last_visit_at` update | ❌ Bug | Never set by scan route |
| `customers.total_visits` update | ❌ Bug | Never incremented |
| Reward threshold detection | ⚠️ Broken | Reads stale `total_points` → never triggers |
| Points mode (scan = N points) | ⚠️ Partial | Config read OK, persistence broken |
| Stamps mode (scan = 1 stamp) | ⚠️ Partial | Config read OK, persistence broken |
| Stamps reset after reward | ❌ Missing | Not implemented in scan route |
| Restaurant-scoped isolation | ✅ Working | `restaurant_id` filter on all queries |

### 3. Google Wallet

| Sub-feature | Status | Notes |
|---|---|---|
| JWT generation | ✅ Working | `generateSaveJwt()` |
| LoyaltyClass create (`ensureLoyaltyClass`) | ✅ Working | Idempotent GET-then-POST |
| LoyaltyClass update | ✅ Working | PATCH on name/color/logo |
| LoyaltyObject create | ✅ Working | `createLoyaltyObject()` |
| LoyaltyObject update on scan | ✅ Working | Fire-and-forget in scan route |
| LoyaltyObject revoke | ✅ Working | Sets state=EXPIRED |
| Pass issuance with `object_id` stored | ✅ Working | `/api/wallet/passes/issue` |
| `short_code` on passes | ✅ Working | 8-char from passId |
| Barcode encodes `short_code` | ✅ Working | For new passes; old passes need Sync |
| Object recovery (`recoverLoyaltyObject`) | ✅ Working | GET→PATCH/CREATE strategy |
| Backward compat (`generateWalletUrl`) | ✅ Working | Legacy wrapper kept |
| Google Wallet balance reflects real points | ❌ Bug | Tied to scan persistence bug above |

### 4. Apple Wallet

| Sub-feature | Status | Notes |
|---|---|---|
| `.pkpass` generation | ✅ Working | `lib/apple-wallet.ts` |
| Download endpoint | ✅ Working | `/api/wallet/passes/[id]/download` |
| Pass fields (points, stamps, name) | ✅ Working | Rendered from live DB read |
| `short_code` on passes | ✅ Working | Generated at issuance |
| Revoke action | ✅ Working | Via `/api/wallet/passes/[id]` PATCH |
| APNS push on scan | ❌ Missing | Pass updates require re-download |
| `pass_version` increment | ✅ Working | On revoke/sync mutations |

### 5. Wallet Templates

| Sub-feature | Status | Notes |
|---|---|---|
| Create template | ✅ Working | Name, pass_kind, config_json |
| Set default template | ✅ Working | is_default toggle with single-default guard |
| Edit template (full fields) | ✅ Working | PATCH accepts name/color/config/status |
| Archive template | ✅ Working | Blocks if active passes exist |
| Template list in dashboard | ✅ Working | Filtered to non-archived |
| Issue pass from template | ✅ Working | Uses template config merged with loyalty_settings |

### 6. Email Campaigns

| Sub-feature | Status | Notes |
|---|---|---|
| Campaign creation UI | ✅ Working | Name, type, recipient filter |
| Send to all customers | ✅ Working | |
| Send to inactive customers | ✅ Working | 30-day threshold |
| Send to top customers | ✅ Working | Top 20% by points |
| Birthday email (cron) | ✅ Working | Daily at 9 AM UTC, CRON_SECRET protected |
| Resend API integration | ✅ Working | `lib/email.ts` |
| HTML injection in email | ⚠️ Security | Restaurant name not escaped in templates |
| Campaign history / analytics | ❌ Missing | No open/click tracking |
| Unsubscribe link | ❌ Missing | GDPR requirement |

### 7. Dashboard

| Sub-feature | Status | Notes |
|---|---|---|
| KPI cards (customers, points, visits) | ✅ Working | But reads stale DB values |
| Customer list with search | ✅ Working | |
| Customer detail / edit | ✅ Working | |
| Points adjustment (manual) | ✅ Working | |
| CSV export | ✅ Working | Auth enforced |
| QR scanner page | ✅ Working | Cross-browser (BarcodeDetector + jsqr) |
| Wallet management tab | ✅ Working | Templates, pass list, issue modal |
| Google Wallet class sync | ✅ Working | POST /api/wallet/classes/sync |
| Loyalty settings (mode/thresholds) | ✅ Working | |
| Onboarding flow | ✅ Working | |
| Logo upload | ✅ Working | |

---

## Critical Bugs (Must Fix Before Launch)

### BUG-01 — Scan Persistence: `customers.total_points` Never Updated
**Severity**: CRITICAL
**File**: `app/api/scan/[token]/route.ts`
**Impact**: Every scan computes `newBalance = customer.total_points + pointsToAdd` from a stale DB value. The computed balance is inserted into `transactions.balance_after` but **never written back to `customers`**. After N scans, `customers.total_points` still reads 0 (or whatever it was at registration). All loyalty logic — reward triggers, campaign filters, KPI totals — is broken.

```
Current flow:
  1. READ  customers.total_points = 0   (stale)
  2. COMPUTE newBalance = 0 + 1 = 1
  3. INSERT transactions(balance_after=1)    ← only this persists
  4. RETURN { total_points: 1 }              ← correct in response
  5. Next scan: READ customers.total_points = 0  ← still stale!
```

**Fix**: Postgres trigger `trg_update_customer_after_transaction` fires on every `transactions` INSERT.
Run `docs/migrations/001_scan_persistence_trigger.sql` in Supabase SQL editor.
**Status**: ✅ Fixed (migration file committed; trigger must be run in Supabase)

### BUG-02 — `customers.stamps_count` Never Updated
**Severity**: CRITICAL
**File**: `app/api/scan/[token]/route.ts`
**Impact**: Same root cause as BUG-01. `stamps_count` is read for display only; computed `newStampsCount` is never persisted. Stamps mode is completely broken in production.
**Status**: ✅ Fixed (trigger handles `stamps_count = stamps_count + NEW.stamps_delta`)

### BUG-03 — `customers.last_visit_at` and `total_visits` Never Updated
**Severity**: HIGH
**File**: `app/api/scan/[token]/route.ts`
**Impact**: "Inactive customers" campaign filter uses `last_visit_at` — if never set, all customers appear inactive. `total_visits` in KPIs always reads 0.
**Status**: ✅ Fixed (trigger updates `last_visit_at = NOW()` and `total_visits = total_visits + 1` on `type = 'visit'`)

---

## High-Priority Issues

### HIGH-01 — Reward Trigger Never Fires
Depends on BUG-01. Since `customer.total_points` never updates, `rewardTriggered` always evaluates to false.

### HIGH-02 — Stamps Reset Not Implemented ✅ Fixed
After `stamps_count >= stamps_total`, there is no reset to 0. Stamps accumulate indefinitely.
**Fix**: `stamps_delta = 1 - stampsTotal` encoding in scan route; trigger auto-resets to 0.
`completed_cards` counter added to `customers` (migration 002).
Files: `app/api/scan/[token]/route.ts`, `docs/migrations/002_stamps_completion.sql`

### HIGH-03 — Apple Wallet: No APNS Push
Customers must re-download their pass to see updated points. Acceptable for MVP if communicated clearly, but blocks full feature parity with Google Wallet (which updates in-app).

### HIGH-04 — Email Templates: HTML Injection ✅ Fixed
Restaurant name is interpolated unescaped in HTML email templates (`lib/email.ts`). A malicious actor creating a restaurant named `<script>` could inject into emails.
**Fix**: `esc()` + `safeCssColor()` helpers added to both `lib/email.ts` and `app/api/compaigns/route.ts`. All user-controlled strings (restaurantName, firstName, bodyText) are escaped before HTML interpolation.

### HIGH-05 — No Rate Limiting on Public Endpoints ✅ Fixed
`/api/register/[slug]` and `/api/register` have no rate limiting. A bot could spam registrations,
exhaust Resend email quota, and pollute the customer database.
**Fix**: DB-level sliding-window rate limit added to both public registration POST endpoints.
- Window: 60 seconds per restaurant
- Threshold: 20 registrations → HTTP 429 "Trop d'inscriptions récentes"
- Implementation: `COUNT(*) WHERE restaurant_id = X AND created_at >= (now - 60s)` using existing `supabaseAdmin` — no new dependencies, no new tables, globally consistent across serverless instances.
- `/api/scan/[token]` requires `requireAuth` (owner session) — already protected.
- `/api/wallet/passes/issue` requires `requireOwner` — already protected.

### HIGH-06 — No Unsubscribe Link in Marketing Emails ✅ Fixed
Campaign emails lack a one-click unsubscribe mechanism. Required for GDPR/CAN-SPAM compliance.
**Fix**:
- New public endpoint: `app/api/unsubscribe/route.ts` — `GET /api/unsubscribe?token={qrToken}`
  Sets `consent_marketing = false`; returns HTML confirmation page. Idempotent, token-gated.
- `app/api/compaigns/route.ts` — added `qr_token` to customer select; unsubscribe URL injected into `buildEmailHtml()` footer.
- `lib/email.ts` — unsubscribe link added to welcome email footer (qrToken already available).
  `sendBirthdayEmail()` accepts optional `qrToken` param; link added to footer when present.
- `app/api/cron/birthdays/route.ts` — bonus: fixed `supabase` → `supabaseAdmin` (cron had no user session; was silently failing). Fixed column name `marketing_consent` → `consent_marketing`. Now passes `qr_token` to `sendBirthdayEmail()`.

### HIGH-07 — Scanner Uses `requireAuth` (Owner Only) ✅ Fixed
Scanner page requires owner Supabase session. A cashier/employee cannot scan without owner credentials.
**Fix**: Token-based public cashier scanner.
- DB: `restaurants.scanner_token UUID NOT NULL DEFAULT gen_random_uuid()` (migration 003)
- New guard `requireScannerAuth()` in `lib/server-auth.ts`: accepts `X-Scanner-Token` header (public cashier) OR Supabase session (owner dashboard) — backward compatible
- `POST /api/scan/[token]` switched from `requireAuth` to `requireScannerAuth`
- New public endpoint: `GET /api/scanner-info/[token]` — validates scanner_token, returns restaurant name/color
- New public page: `/scan/[scannerToken]` — full camera+manual scanner, no login required. Auth via `X-Scanner-Token` header
- Dashboard scanner page (`/dashboard/scanner`): fetches `scanner_token`, shows "Lien scanner caissier" banner with one-click copy

---

## Architectural Risks

### RISK-01 — Dual Loyalty Config Systems
`loyalty_settings` table exists alongside `wallet_pass_templates.config_json`. Scan route reads from `loyalty_settings`; wallet issue reads merged config. Risk of divergence if settings change after pass issuance.

### RISK-02 — Fire-and-Forget Google Wallet Sync Has No Retry
`void (async () => { ... })().catch(() => {})` — sync failures are silently swallowed. If Google API is down during a scan, the pass silently shows stale data with no queue or retry mechanism.

### RISK-03 — `newBalance` Response Is Optimistic
Scan route returns `total_points: newBalance` (computed client-side) without confirming the DB write succeeded. If the transaction insert fails, the customer sees "10 points" on screen but DB still has 9.

### RISK-04 — Google Wallet Class/Object ID Collision
ClassId uses `restaurantId` (UUID, collision-safe). Legacy `generateWalletUrl` uses `restaurantSlug` (mutable). If a restaurant renames its slug, the legacy class ID becomes orphaned.

---

## Step 1 Patch — Scan Persistence Fix

### Analysis: Option A vs Option B

**Option A — Postgres Trigger (recommended)**
A `AFTER INSERT ON transactions` trigger atomically updates `customers.total_points`,
`stamps_count`, `last_visit_at`, and `total_visits` in the same DB transaction as the insert.

```
Pros:
  ✅ Atomically consistent — no window between insert and update
  ✅ Concurrency-safe — DB handles row locking; `total_points = total_points + delta`
     is safe under concurrent scans (no read-modify-write race)
  ✅ Always fires — regardless of which code path inserts a transaction
  ✅ Future-proof — any new transaction type (redemption, adjustment) auto-updates customer
  ✅ No additional API roundtrip

Cons:
  ⚠️ Requires separate SQL migration in Supabase SQL editor (outside codebase)
  ⚠️ Requires `stamps_delta` column on transactions to pass stamp increment through trigger
  ⚠️ Trigger logic is invisible to app code reviewers (hidden behavior)
```

**Option B — App-Level Incremental UPDATE**
After transaction insert, explicitly run:
`UPDATE customers SET total_points = total_points + delta WHERE id = customer_id`

```
Pros:
  ✅ No DB infra changes beyond this one UPDATE
  ✅ Visible in app code — no hidden behavior
  ✅ Still concurrency-safe via incremental UPDATE (not absolute value)

Cons:
  ⚠️ Two DB roundtrips (insert + update) — not truly atomic
  ⚠️ If network fails between insert and update, transaction exists but customer row not updated
  ⚠️ Other future code paths that insert transactions must remember to update customer manually
```

**Decision: Option A** — Chosen for production-grade correctness. The trigger ensures the
customer row is always in sync with the transaction log, regardless of which code path fires.
The `stamps_delta` column also serves as part of the audit trail. SQL migration must be run
manually in Supabase SQL editor.

### SQL Migration (run in Supabase SQL editor)

See: `docs/migrations/001_scan_persistence_trigger.sql`

### Code Change

`app/api/scan/[token]/route.ts` — pass `stamps_delta` in transaction insert. No explicit
customer UPDATE needed (trigger handles it).

**Status**: ✅ Fixed — see commit after this patch

---

## Patch Log

| Step | Issue | Status | Files |
|---|---|---|---|
| Step 1 | BUG-01/02/03 — Scan persistence (total_points, stamps_count, last_visit_at never updated) | ✅ Fixed | `docs/migrations/001_scan_persistence_trigger.sql`, `app/api/scan/[token]/route.ts` |
| Step 2 | HIGH-02 — Stamps reset after reward; completed_cards metric | ✅ Fixed | `docs/migrations/002_stamps_completion.sql`, `app/api/scan/[token]/route.ts`, `app/dashboard/scanner/page.tsx`, `app/dashboard/page.tsx` |
| Step 3 | HIGH-04 — HTML injection in email templates | ✅ Fixed | `lib/email.ts`, `app/api/compaigns/route.ts` |
| Step 4 | HIGH-06 — Unsubscribe link in marketing emails (GDPR) + cron fixes | ✅ Fixed | `app/api/unsubscribe/route.ts` (NEW), `app/api/compaigns/route.ts`, `lib/email.ts`, `app/api/cron/birthdays/route.ts` |
| Step 5 | HIGH-05 — Rate limiting on public endpoints | ✅ Fixed | `app/api/register/route.ts`, `app/api/register/[slug]/route.ts` |
| Step 6 | HIGH-07 — Scanner requires owner session (cashier cannot scan) | ✅ Fixed | `docs/migrations/003_scanner_token.sql`, `lib/server-auth.ts`, `app/api/scan/[token]/route.ts`, `app/api/scanner-info/[token]/route.ts` (NEW), `app/scan/[scannerToken]/page.tsx` (NEW), `app/dashboard/scanner/page.tsx` |
| Step 7 | RISK-03 — Optimistic scan response (insert error not checked) | ✅ Fixed | `app/api/scan/[token]/route.ts` |
| Step 8 | RISK-01 — Dual config systems: program_type missing from loyalty_settings override | ✅ Fixed | `app/api/wallet/passes/issue/route.ts` |
| Step 9 | RISK-04 — Slug-based classId/objectId in legacy wrapper (mutable, orphan risk) + existing-pass JWT embedded wrong objectId | ✅ Fixed | `lib/google-wallet.ts`, `app/api/wallet/[customerId]/route.ts`, `app/api/register/route.ts` |
| Step 10 | RISK-02 — No retry for failed Google Wallet syncs | ✅ Fixed | `app/api/cron/wallet-sync/route.ts` (NEW), `vercel.json` |

---

## Appendix: Data Flow Diagram

```
Customer scans QR
    │
    ▼
POST /api/scan/[token]
    │
    ├── resolveScanToken(token, restaurantId)
    │     1. customers WHERE qr_token = token
    │     2. customers WHERE id = token  (legacy)
    │     3. wallet_passes WHERE short_code = token (manual)
    │
    ├── Fetch loyalty_settings (points_per_scan, reward_threshold, program_type)
    │
    ├── Compute newBalance = customer.total_points + pointsToAdd  [stale read]
    │
    ├── INSERT transactions(points_delta, stamps_delta, balance_after)
    │         └── TRIGGER: UPDATE customers SET total_points = total_points + delta
    │                                            stamps_count = stamps_count + stamps_delta
    │                                            last_visit_at = NOW()
    │                                            total_visits = total_visits + 1
    │
    ├── FIRE-AND-FORGET: updateLoyaltyObject (Google Wallet)
    │
    └── RETURN { success, customer, points_added, reward_triggered }
```
