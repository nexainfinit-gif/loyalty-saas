# Deployment Runbook — Loyalty SaaS (Rebites)

## Prerequisites

| Service | Purpose |
|---------|---------|
| **Vercel** account | Hosting, serverless functions, cron jobs |
| **Supabase** project | PostgreSQL database + authentication |
| **Resend** account | Transactional & campaign emails |
| **Stripe** account | Billing & subscription management |
| **Google Cloud** service account | Google Wallet pass generation |
| **Apple Developer** account *(optional)* | Apple Wallet pass generation |

---

## 1. Environment Variables

Set all of the following in **Vercel > Project > Settings > Environment Variables**.

### Core

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g., `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, never expose to client) |
| `NEXT_PUBLIC_APP_URL` | Production URL (e.g., `https://app.rebites.be`) |

### Email

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key (starts with `re_`) |

### Cron Security

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Secret token to authenticate cron job requests |

### Google Wallet

| Variable | Description |
|----------|-------------|
| `GOOGLE_WALLET_ISSUER_ID` | Google Pay & Wallet Console issuer ID |
| `GOOGLE_WALLET_CLIENT_EMAIL` | Service account email from Google Cloud |
| `GOOGLE_WALLET_PRIVATE_KEY` | PEM private key (with literal `\n` newlines, wrapped in quotes) |

### Apple Wallet (optional)

| Variable | Description |
|----------|-------------|
| `APPLE_PASS_TYPE_IDENTIFIER` | Pass Type ID (e.g., `pass.com.yourcompany.loyalty`) |
| `APPLE_TEAM_IDENTIFIER` | Apple Developer Team ID (10-char alphanumeric) |
| `APPLE_PASS_CERT_P12_BASE64` | Base64-encoded `.p12` signing certificate |
| `APPLE_PASS_CERT_PASSPHRASE` | Passphrase for the `.p12` certificate |
| `APPLE_WWDR_PEM` | Base64-encoded Apple WWDR G4 intermediate certificate |

### Stripe

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` for production) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...`) |

### Cloudflare Turnstile (optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (anti-spam CAPTCHA) |
| `TURNSTILE_SECRET_KEY` | Turnstile server-side secret key |

---

## 2. Supabase Setup

### Run migrations

Execute the following migrations **in order** against your Supabase SQL editor or via the CLI. If deploying fresh, run all migrations. If upgrading from a prior version, run only the ones not yet applied.

Key recent migrations (013-016):

```bash
# From the project root:
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"

# Or manually in Supabase SQL Editor, run each file in order:
# docs/migrations/013_indexes_rls_serial.sql   — Performance indexes + RLS policies
# docs/migrations/014_consent_ip.sql           — GDPR consent IP tracking
# docs/migrations/015_audit_log.sql            — Audit log table
# docs/migrations/016_email_verification.sql   — Email verification flow
```

Full migration list (run all for fresh deployment):

| # | File | Purpose |
|---|------|---------|
| 001 | `001_scan_persistence_trigger.sql` | Scan persistence triggers |
| 001b | `001b_hotfix_double_increment.sql` | Hotfix for double increment bug |
| 002 | `002_stamps_completion.sql` | Stamps card completion logic |
| 003 | `003_scanner_token.sql` | Scanner authentication token |
| 004 | `004_growth_metrics.sql` | Growth metrics columns |
| 005 | `005_dynamic_plans.sql` | Dynamic plans table |
| 006 | `006_kpi_engine.sql` | KPI engine functions |
| 007 | `007_restaurant_metrics.sql` | Restaurant metrics materialization |
| 008 | `008_growth_actions.sql` | Growth action tracking |
| 009 | `009_appointments.sql` | Appointments / booking module |
| 010 | `010_no_show_tracking.sql` | No-show tracking |
| 011 | `011_stripe_billing.sql` | Stripe billing integration |
| 012 | `012_tutorial_tracking.sql` | Tutorial completion tracking |
| 013 | `013_indexes_rls_serial.sql` | Performance indexes + RLS |
| 014 | `014_consent_ip.sql` | GDPR consent IP |
| 015 | `015_audit_log.sql` | Audit log |
| 016 | `016_email_verification.sql` | Email verification |

### Enable RLS

Ensure Row Level Security is enabled on all tables. Migration 013 sets this up, but verify in the Supabase dashboard under **Authentication > Policies**.

---

## 3. Vercel Configuration

### Deploy

```bash
# Link project (first time)
vercel link

# Deploy to production
vercel --prod
```

### Cron Jobs

Add the following to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/birthdays",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/cert-check",
      "schedule": "0 8 * * 1"
    }
  ]
}
```

| Cron | Schedule | Description |
|------|----------|-------------|
| `/api/cron/birthdays` | Daily at 09:00 UTC | Sends birthday reward emails |
| `/api/cron/cert-check` | Weekly on Monday at 08:00 UTC | Checks Apple Wallet certificate expiry |

Both endpoints are secured with the `CRON_SECRET` header.

---

## 4. Apple Wallet Setup (Optional)

1. **Apple Developer Portal**: Create a Pass Type ID at [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list/passTypeId).
2. **Generate Certificate**: Create a pass signing certificate for the Pass Type ID. Download the `.cer` file.
3. **Export .p12**: Import the `.cer` into Keychain Access, then export as `.p12` with a passphrase.
4. **Base64 encode**: `base64 -i certificate.p12 | tr -d '\n'` — use this as `APPLE_PASS_CERT_P12_BASE64`.
5. **WWDR Certificate**: Download [Apple WWDR G4 certificate](https://www.apple.com/certificateauthority/). Base64-encode the PEM: `base64 -i AppleWWDRCAG4.pem | tr -d '\n'`.
6. **Set env vars**: Add all `APPLE_PASS_*` variables to Vercel.
7. **Verify**: Open your app, navigate to a customer, and test "Add to Apple Wallet".

---

## 5. Rollback Steps

### Application rollback

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-url>
```

### Database rollback

Supabase does not support automatic migration rollback. To roll back:

1. Identify the migration that caused the issue.
2. Write and execute a **reverse migration** SQL script manually.
3. Test thoroughly in a staging environment before applying to production.
4. Keep backups: enable Supabase Point-in-Time Recovery (PITR) on the Pro plan.

### Emergency procedures

- **App is down**: Check Vercel dashboard for deployment errors. Promote last known good deployment.
- **Database issue**: Use Supabase dashboard to inspect logs. Restore from backup if needed.
- **Email not sending**: Verify `RESEND_API_KEY` is valid and check Resend dashboard for bounces/errors.
- **Wallet passes broken**: Check Google/Apple credential env vars. Verify certificates have not expired.

---

## 6. Post-Deployment Verification Checklist

Run through these checks after every production deployment:

### Authentication & Access
- [ ] Owner can sign up and complete onboarding
- [ ] Owner can log in and see the dashboard
- [ ] Unauthenticated users are redirected to login

### Core Features
- [ ] Customer registration page loads (`/register/<slug>`)
- [ ] QR code scanning works (`/api/scan/<token>`)
- [ ] Points/stamps increment correctly after scan
- [ ] Dashboard displays correct KPIs and customer list

### Wallet
- [ ] Google Wallet pass generates and downloads
- [ ] Apple Wallet pass generates and downloads (if configured)
- [ ] Pass data reflects current loyalty balance

### Email
- [ ] Welcome email is sent on customer registration
- [ ] Campaign email can be composed and sent
- [ ] Birthday cron endpoint responds with 200 (`curl -H "Authorization: Bearer $CRON_SECRET" https://app.rebites.be/api/cron/birthdays`)

### Billing
- [ ] Stripe checkout flow works for plan upgrades
- [ ] Webhook receives events and updates subscription status
- [ ] Plan-gated features are correctly locked/unlocked

### Security
- [ ] All API routes validate authentication
- [ ] Cross-restaurant data access is blocked (test with two accounts)
- [ ] Service role key is not exposed in client bundle
- [ ] HTTPS is enforced on all routes

### Performance
- [ ] Dashboard loads in under 3 seconds
- [ ] No console errors in production build
- [ ] Vercel function execution stays under timeout limits
