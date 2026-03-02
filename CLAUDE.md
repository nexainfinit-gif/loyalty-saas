# CLAUDE.md — Loyalty SaaS

## Project Overview
A loyalty program SaaS for restaurants. Owners manage customer rewards (points or stamps), send email campaigns, and issue Google Wallet cards & Apple wallet. Customers self-register via a public page and accumulate points by scanning QR codes.

---

## Tech Stack
- **Framework**: Next.js (App Router, TypeScript)
- **UI**: React 19, TailwindCSS 4, Recharts, React-QR-Code
- **Database/Auth**: Supabase (PostgreSQL + JWT auth)
- **Email**: Resend
- **Digital Wallet**: Google Wallet API (JWT-based)
- **Deployment**: Vercel (with Cron jobs)

---

## Commands
```bash
npm run dev      # Development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint
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
├── api/                    # API routes
│   ├── auth/callback/      # Supabase OAuth callback
│   ├── register/           # Customer registration
│   ├── scan/[token]/       # QR code scanning (points redemption)
│   ├── wallet/[customerId] # Google Wallet card management
│   ├── compaigns/          # Email campaign dispatch
│   ├── cron/birthdays/     # Daily birthday email (Vercel Cron, 9 AM UTC)
│   ├── export-csv/         # Customer data export
│   ├── upload-logo/        # Restaurant logo upload
│   └── Restaurant/Create/  # Restaurant creation
├── dashboard/              # Protected owner dashboard
│   ├── page.tsx            # Main dashboard (large client component)
│   └── scanner/            # QR code scanner
├── register/[slug]/        # Public customer registration form
├── onboarding/             # Restaurant onboarding flow
└── auth/confirm/           # Email confirmation

components/
└── RegisterForm.tsx         # Branded customer registration form

lib/
├── supabase.ts             # Client-side Supabase instance
├── supabase-admin.ts       # Admin Supabase (service role key)
├── supabase-server.ts      # Server-side Supabase (cookie session)
├── google-wallet.ts        # Google Wallet JWT generation
└── email.ts                # Resend email templates (welcome + birthday)
```

---

## Database Tables (Supabase/PostgreSQL)
- **restaurants** — `id, name, slug, color, primary_color, logo_url, owner_id, plan`
- **customers** — `id, restaurant_id, first_name, last_name, email, birth_date, postal_code, marketing_consent, consent_date, qr_token, total_points, total_visits, stamps_count, last_visit_at, created_at`
- **loyalty_settings** — `points_per_scan, reward_threshold, reward_message, program_type, stamps_total`
- **transactions** — `id, customer_id, points_delta, type, created_at`
- **campaigns** — `id, name, type, recipients_count, status, sent_at, scheduled_at`

No ORM — raw Supabase SDK queries throughout.

---

## Key Patterns & Conventions
- **Supabase clients**: Use `supabase-server.ts` for server components/routes, `supabase-admin.ts` for privileged ops, `supabase.ts` for client components.
- **Auth**: Cookie-based session via `@supabase/ssr`. Authenticated user = restaurant owner.
- **Loyalty modes**: `points` (scan = N points) or `stamps` (scan = 1 stamp toward reward).
- **QR codes**: Each customer gets a unique `qr_token`. Scanning hits `/api/scan/[token]`.
- **Emails**: HTML templates in `lib/email.ts`. QR code images via QuickChart API.
- **Google Wallet**: JWT generated in `lib/google-wallet.ts`, served via `/api/wallet/[customerId]`.
- **TypeScript errors ignored** in build (`next.config.ts` — `ignoreBuildErrors: true`).
- **Inline styles** are used extensively alongside Tailwind (especially in dashboard).

---

## Deployment
- Hosted on **Vercel**
- Cron job: `/api/cron/birthdays` daily at 9 AM UTC (secured with `CRON_SECRET`)
- All env vars must be set in Vercel project settings

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
