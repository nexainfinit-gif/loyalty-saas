# CLAUDE.md — Loyalty SaaS

## Project Overview
A loyalty program SaaS for restaurants & local businesses (brand: Rebites). Owners manage customer rewards (points or stamps), send email campaigns, issue Google & Apple Wallet passes, and (for eligible business types) manage appointments/booking. Customers self-register via a public page and accumulate points by scanning QR codes. Stripe-billed subscription plans, super-admin platform panel, i18n (fr/en/nl/it/es).

> Doc refreshed 2026-07-05 from a full codebase audit. See `docs/DEPLOYMENT.md` for the deploy runbook and `docs/migrations/` for the full data model.

---

## Tech Stack
- **Framework**: Next.js (App Router, TypeScript)
- **UI**: React 19, TailwindCSS 4, Recharts, React-QR-Code
- **Database/Auth**: Supabase (PostgreSQL + JWT auth), no ORM — raw SDK
- **Billing**: Stripe (checkout, webhook, customer portal, dynamic plans in DB)
- **Email**: Resend
- **Digital Wallet**: Google Wallet API (JWT) + Apple Wallet (pkpass, APNS push, web service v1)
- **Observability**: Sentry (env-gated), structured logger (`lib/logger.ts`)
- **Tests**: Vitest (`__tests__/`), Playwright configured (no specs yet), k6 load tests (`load-tests/`)
- **i18n**: 5 locales via `[locale]` routing (`proxy.ts` middleware + `lib/i18n*.ts`)
- **Deployment**: Vercel (7 cron jobs — see `vercel.json`)

---

## Commands
```bash
npm run dev      # Development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint (47 known errors — non-blocking in CI for now)
npm run typecheck # tsc --noEmit (clean — MUST stay clean, CI gate)
npm run test     # Vitest (CI gate)
```

---

## Environment Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY
CRON_SECRET
GOOGLE_WALLET_ISSUER_ID
GOOGLE_WALLET_CLIENT_EMAIL
GOOGLE_WALLET_PRIVATE_KEY
```

---

## Project Structure
```
app/
├── [locale]/               # ALL pages are locale-prefixed (fr/en/nl/it/es)
│   ├── page.tsx            # Root = auth redirector (NO landing page yet)
│   ├── dashboard/          # Owner dashboard (page.tsx ~2300 lines) + scanner,
│   │                       #   wallet studio, appointments/*, billing, login
│   ├── admin/              # Super-admin panel (restaurants, plans, KPIs,
│   │                       #   impersonation, wallet-preview ~2100 lines)
│   ├── register/[slug]/    # Public customer registration (THE live flow)
│   ├── book/[slug]/        # Public booking + cancel/reschedule by token
│   ├── client/[slug]/      # Customer self-service portal (magic-link)
│   └── onboarding/ choose-plan/ support/ privacy/ auth/confirm/
├── api/                    # ~99 route.ts — domains: wallet (27), admin (18),
│   │                       #   appointments/book (15), cron (7), stripe (3),
│   │                       #   register, scan, team, referral, client, gcal…
│   ├── scan/[token]/       # Core loyalty scan (idempotency, anti-fraud)
│   ├── compaigns/          # (!) typo baked into API contract — do not rename
│   └── Restaurant/Create/  # (!) PascalCase baked in — do not rename

components/                 # Dashboard tabs (Overview/Loyalty/Wallet/Analytics),
                            #   appointments/, ui/ (Badge, Card), mobile nav
                            # (!) RegisterForm.tsx is DEAD code (imported nowhere)
lib/                        # 30+ modules: supabase{,-admin,-server,-browser},
                            #   server-auth (ALL route guards), google-wallet,
                            #   apple-wallet, apns, email, validation (Zod),
                            #   rate-limit, plan-limits, kpi-*, growth-*, referral
proxy.ts (root)             # Next middleware: locale routing + server auth gate
                            #   for /dashboard & /admin + security headers
docs/migrations/            # 001→033 numbered SQL (source of truth for schema)
__tests__/                  # Vitest: 200+ tests, helpers/fake-db.ts (filter-aware
                            #   Supabase mock for tenant-isolation tests)
```

---

## Database Tables (Supabase/PostgreSQL)
~25 tables. Source of truth: `docs/migrations/` (001→033). Core ones:
- **restaurants** — tenant root: `id, name, slug, owner_id, plan, plan_id, scanner_token, stripe_customer_id, is_demo`
- **customers** — `id, restaurant_id, first_name, last_name, email, qr_token, total_points, stamps_count, completed_cards, reward_pending, consent_marketing, consent_ip, email_verified, referral_code`
  (!) The consent column is **`consent_marketing`** (NOT `marketing_consent` — verified against live DB 2026-07-05).
- **transactions** — ledger; a Postgres trigger updates customer + pass counters on insert
- **loyalty_settings** — program config incl. anti-fraud (`max_scans_per_day`, `min_scan_delay_minutes`)
- **wallet_passes / wallet_pass_templates** — Apple+Google passes, per-pass counters (031)
- **scan_events / wallet_sync_queue** — scan audit + idempotency (018)
- **plans / plan_features / plan_kpis** — DB-driven plan catalog ((!) coexists with hardcoded `lib/plan-limits.ts` — known drift, consolidation pending)
- Appointments domain: **services, staff_members, appointments, appointment_settings, waiting_list, client_no_show_stats…** (009–010, 025–028)
- **team_invites/team_members, referrals, audit_log, client_sessions**

No ORM — raw Supabase SDK queries throughout.

---

## Key Patterns & Conventions
- **Supabase clients**: Use `supabase-server.ts` for server components/routes, `supabase-admin.ts` for privileged ops, `supabase.ts` for client components.
- **Auth**: Cookie-based session via `@supabase/ssr`. Authenticated user = restaurant owner.
- **Loyalty modes**: `points` (scan = N points) or `stamps` (scan = 1 stamp toward reward).
- **QR codes**: Each customer gets a unique `qr_token`. Scanning hits `/api/scan/[token]`.
- **Auth guards**: ALWAYS use `lib/server-auth.ts` (`requireAuth`, `requireOwner`, `requireScannerAuth`, `requireWalletAccess`) — never inline auth.
- **Validation**: Zod schemas via `lib/validation.ts` + `parseBody()` (French error messages). Extend this pattern to new mutation routes.
- **Emails**: HTML templates in `lib/email.ts` — all dynamic values MUST go through `esc()`/`safeCssColor()`.
- **Google Wallet**: JWT generated in `lib/google-wallet.ts`. Apple Wallet: `lib/apple-wallet.ts` + `lib/apns.ts` (see memory notes — curl-based APNS on Vercel, production only).
- **Typecheck is clean** — keep it that way (`npm run typecheck` is a CI gate since 2026-07-05).
- **Multi-tenant**: every query MUST be scoped `.eq('restaurant_id', …)` at the query level, even with an auth guard (defence-in-depth). Tested in `__tests__/api/scan` + `__tests__/api/customers`.

---

## Deployment
- Hosted on **Vercel** — full runbook in `docs/DEPLOYMENT.md`
- **7 cron jobs** in `vercel.json`: birthdays, wallet-sync, metrics-daily, metrics, reminders, cert-check, followup — all secured with `CRON_SECRET` (timing-safe)
- CI: GitHub Actions (`.github/workflows/ci.yml`) — typecheck + tests are blocking gates
- All env vars must be set in Vercel project settings (see `.env.example`)

---

## Critical Protection Rules

- NEVER modify business logic without explicit request.
- NEVER change database schema without confirmation.
- NEVER change API contracts without confirmation.
- NEVER modify authentication flow unless requested.
- Do not remove security checks.
- Do not expose service role keys in client code.

---

## UI & Design System Rules

- Use TailwindCSS only (avoid inline styles unless strictly necessary).
- Avoid mixing inline styles and Tailwind.
- Follow an 8px spacing system.
- Use rounded-xl or rounded-2xl consistently.
- Use soft shadows only.
- Avoid heavy gradients.
- Keep color palette minimal.
- Use restaurant primary_color consistently.
- Dashboard must feel calm and professional.

Target user: non-technical restaurant owner.
Clarity > creativity.

---

## UX Principles

- Actions must be obvious.
- No hidden actions.
- Clear CTA buttons.
- Large clickable areas.
- Clear success and error states.
- All errors must be human-readable.

---

## Performance Rules

- Avoid unnecessary re-renders.
- Avoid heavy dependencies.
- Keep API responses lightweight.
- Optimize dashboard performance.
- Consider multi-tenant scalability.

---

## Security Rules

- Validate all inputs in API routes.
- Never trust client data.
- Ensure restaurant_id isolation in all queries.
- Prevent cross-restaurant data access.
- Protect all cron endpoints with secrets.

---

## UI Freeze Rules (locked March 2026)

The current UI is the **frozen design baseline**. Do not deviate from it without explicit instruction.

- **NEVER** redesign the layout (sidebar + top navbar + content area is final).
- **NEVER** change the spacing system. Current paddings, gaps, and grid structure are locked.
- **NEVER** change the navigation structure (sidebar items, tab order, routes).
- **NEVER** restyle components globally (Card, Badge, KPI cards, tables, buttons, inputs).
- **NEVER** change typography scale, radius scale (`rounded-xl`/`rounded-2xl`), or shadow system.
- **ONLY** allowed: incremental polish and consistency fixes on explicitly requested elements.

### Frozen design tokens (do not change)
- Background: `#F6F8FB` (`bg-surface`)
- Card: `#FFFFFF` with `border-gray-100` and `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Primary: `#4F6BED` (`bg-primary-600`, `text-primary-600`)
- Sidebar: white bg, `border-r border-gray-100`, active = `bg-primary-50 text-primary-600`
- Text primary: `text-gray-900` | secondary: `text-gray-500` | tertiary: `text-gray-400`
- Radius: `rounded-xl` (inputs/buttons) · `rounded-2xl` (cards)
- Defined in: `app/globals.css` @theme block
- UI primitives: `components/ui/Badge.tsx`, `components/ui/Card.tsx`
