# BOOKING ROADMAP — Benchmark & Implémentation (2026-03-17)

## Résumé exécutif

**8 concurrents analysés** : Planity, Salonkee, Treatwell, Fresha, SimplyBook.me, Calendly, Timely, Square Appointments.

**Avantage concurrentiel unique** : Aucun concurrent ne combine nativement fidélité + booking. Fresha/Timely vendent le loyalty en add-on payant. Notre plateforme l'intègre nativement.

**Système actuel** : ~60% complet avant Phase 1. Core booking fonctionnel (services, staff, slots, réservation publique, rappels email, no-show tracking). Manquaient les features qui génèrent du revenu et réduisent les no-shows.

---

## Benchmark concurrentiel — Matrice des fonctionnalités

| Fonctionnalité | Planity | Salonkee | Treatwell | Fresha | SimplyBook | Timely | Square | **Nous** |
|---|---|---|---|---|---|---|---|---|
| **Booking Core** | | | | | | | | |
| Page de réservation publique | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Catalogue services + catégories | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Durée + prix par service | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Multi-employés | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Dispo par employé | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Calendrier temps réel | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Buffer entre RDV | ~Y | ~Y | ~Y | Y | Y | Y | Y | **Y** |
| RDV récurrents | ? | ? | ? | ? | Y | Y | Y | N |
| Réservations groupe | ? | ? | ? | ? | Y | ? | Y | N |
| Liste d'attente | ? | ? | Y | ? | Y | ? | Y | N |
| Walk-in | ? | ? | ~Y | ? | ? | ? | Y | N |
| **Expérience client** | | | | | | | | |
| Confirmation email | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Rappels (email) | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Rappels SMS | Y | Y | Y | Y | Y | Y | Y | N |
| Annulation client | Y | Y | Y | Y | Y | Y | Y | **Y** ✅ |
| Report client | Y | Y | Y | Y | Y | Y | Y | **Y** ✅ |
| Compte client | Y | Y | Y | Y | Y | Y | Y | N |
| Avis/notes | Y | ? | Y | Y | Y | ? | ? | N |
| Fidélité intégrée | Y | Y | Y | $9.95/mo | Y | Y | add-on | **Y** ✅ |
| Multi-langue | Y | Y | Y | Y | Y | ? | ? | **Y** |
| **Paiements** | | | | | | | | |
| Paiement en ligne | Y | Y | Y | Y | Y | Y | Y | N |
| Acompte/dépôt | Y | Y | Y | Y | Y | Y | Y | N |
| Frais no-show | Y | Y | Y | Y | Y | ~Y | Y | N |
| Stripe intégré | Y | Y | Y | propre | multi | propre | propre | exist. |
| Cartes cadeaux | ? | Y | Y | Y | Y | Y | Y | N |
| Packs/forfaits | ? | Y | ? | Y | Y | ? | ? | N |
| Abonnements | ? | Y | ? | Y | Y | ? | ? | N |
| **No-Show** | | | | | | | | |
| Rappels avant RDV | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Politique annulation | Y | Y | Y | Y | Y | ~Y | Y | **Y** ✅ |
| Tracking no-show/client | ~Y | ~Y | Y | Y | ? | ~Y | Y | **Y** |
| Dépôt pour récidivistes | Y | Y | Y | Y | Y | ~Y | Y | N |
| Blocage/blacklist | ? | ? | Y | ? | ? | ? | ? | **Y** ✅ |
| **Gestion business** | | | | | | | | |
| Planning employés | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Congés/pauses | ~Y | Y | Y | Y | Y | Y | Y | **Y** |
| Multi-établissements | ? | Y | Y | Y | ? | ? | Y | N |
| Reporting/analytics | Y | Y | Y | Y | Y | Y | Y | N |
| Suivi revenus | Y | Y | Y | Y | Y | Y | Y | N |
| CRM client | Y | Y | Y | Y | Y | Y | Y | **Y** |
| Marketing (email) | Y | Y | Y | Y | Y | Y | add-on | **Y** |
| Follow-ups auto | Y | ~Y | ~Y | Y | Y | Y | Y | N |
| Sync Google Calendar | ? | ? | ? | ? | Y | ? | Y | partiel |
| Widget embed site web | ? | ? | Y | Y | Y | Y | Y | N |
| Booking social media | ? | ? | Y | Y | Y | ? | Y | N |
| **Notif staff** | ? | ? | ? | ? | ? | ? | ? | **Y** ✅ |
| **Avancé** | | | | | | | | |
| IA scheduling | ? | ? | Y | ? | Y | ? | Y | N |
| Gestion stock | ? | Y | Y | Y | Y | ~Y | Y | N |
| POS intégré | ? | Y | Y | Y | Y | Y | Y | N |
| API publique | ? | N | ? | $$$ | Y | Y | Y | N |
| Zapier | ? | N | ? | ? | Y | Y | Y | N |

**Légende** : Y = Oui confirmé | ~Y = Probable | ? = Non confirmé | N = Non | ✅ = Implémenté Phase 1

---

## Benchmark pricing

| Plateforme | Modèle | Prix entrée | Prix pro | Commission | Transaction |
|---|---|---|---|---|---|
| **Planity** | SaaS pur | $29/mois (3 staff) | $69/mois | 0% | Stripe standard |
| **Salonkee** | SaaS | ~$33/mois | Sur devis | 0% | ? |
| **Treatwell** | SaaS + marketplace | Sur devis | Sur devis | 35% 1er RDV nouveau client | 2.5% + TVA prepaid |
| **Fresha** | SaaS + marketplace | $19.95/mois | $9.95/staff/mois | 20% nouveau client (min $6) | 2.19% + $0.20 |
| **SimplyBook.me** | Par volume | Gratuit (50 RDV) | $9.90-$59.90/mois | 0% | Processeur externe |
| **Timely** | Par staff | $20/staff/mois | $35/staff/mois | 0% | TimelyPay standard |
| **Square** | Freemium + tx fees | Gratuit | $29-$69/mois | 0% | 2.6% + $0.15 |
| **Calendly** | Par siège | Gratuit (1 event) | $10-$20/siège/mois | 0% | Stripe/PayPal |

**Recommandation pricing** : Forfait mensuel par restaurant (pas par staff — turnover élevé en resto). Booking inclus dans les plans existants comme feature premium.

---

## Priorisation stratégique

### Impact business par feature

| Feature | Impact conversion | Réduit no-shows | Rétention pro | Différenciant | Ratio impact/effort |
|---|---|---|---|---|---|
| Annulation client | +++ | + | ++ | Non | ★★★★★ |
| Report client | +++ | ++ | ++ | Non | ★★★★★ |
| Points fidélité auto | ++ | + | +++ | **OUI** | ★★★★★ |
| Notif staff | + | + | +++ | Non | ★★★★★ |
| Blocage no-show | + | +++ | ++ | Non | ★★★★☆ |
| Dépôt Stripe | ++ | +++++ | +++ | Non | ★★★☆☆ |
| SMS rappels | + | ++++ | ++ | Non | ★★★☆☆ |
| Widget embed | +++ | + | ++ | Non | ★★★☆☆ |
| Waiting list | ++ | + | ++ | Léger | ★★☆☆☆ |
| Follow-up auto | + | + | +++ | Non | ★★★☆☆ |
| Paiement en ligne | +++ | +++ | ++ | Non | ★★☆☆☆ |
| Multi-établissements | + | + | +++ | Non | ★☆☆☆☆ |

---

## Phases d'implémentation

### [x] PHASE 1 — Quick Wins (High Impact, Low Effort) — TERMINÉE

| # | Feature | Status | Fichiers créés | Fichiers modifiés |
|---|---|---|---|---|
| 1 | Annulation client (lien email, page, API, politique) | ✅ Done | 3 | 4 |
| 2 | Points fidélité auto sur RDV terminé | ✅ Done | 0 | 4 |
| 3 | Notification email au staff | ✅ Done | 0 | 3 |
| 4 | Report client (page, API, slots, email) | ✅ Done | 3 | 2 |
| 5 | Blocage no-show (seuil configurable, block en réservation) | ✅ Done | 1 | 5 |

**Migrations à exécuter en DB** :
- `docs/migrations/011_appointment_cancel_token.sql` — colonne `cancel_token` sur appointments
- `docs/migrations/025_no_show_threshold.sql` — colonne `no_show_block_threshold` sur appointment_settings

---

### [~] PHASE 2 — Gains Business Forts (Medium Effort) — PARTIELLE

| # | Feature | Status | Notes |
|---|---|---|---|
| 6 | **Dépôt/acompte Stripe** | Reporté | Coût — attente décision |
| 7 | **Rappels SMS** | Reporté | Coût — attente décision |
| 8 | **Analytics rendez-vous** | ✅ Done | API + page dashboard avec KPIs, charts, staff perf |

---

### [x] PHASE 3 — Différenciation — TERMINÉE

| # | Feature | Status | Fichiers créés | Fichiers modifiés |
|---|---|---|---|---|
| 9 | **Widget embed** (iframe ?embed=1 + code à copier) | ✅ Done | 0 | 3 |
| 10 | **Waiting list** (table, API, notif email sur annulation, UI booking) | ✅ Done | 4 | 2 |
| 11 | **Follow-up post-visite auto** (cron J+1, email re-booking) | ✅ Done | 1 | 2 |
| 12 | **Booking réseaux sociaux** (lien direct à copier dans settings) | ✅ Done | 0 | 1 |

**Migrations à exécuter en DB** :
- `docs/migrations/026_waiting_list.sql` — table `waiting_list`

---

### [~] PHASE 4 — Optimisation avancée — PARTIELLE

| # | Feature | Status | Notes |
|---|---|---|---|
| 13 | **RDV récurrents** | ✅ Done | weekly/biweekly/monthly, cancel série, badge récurrence |
| 14 | **Cartes cadeaux** | Reporté | Coût Stripe — attente décision |
| 15 | **Packs/forfaits** | Reporté | Coût Stripe — attente décision |
| 16 | **Multi-établissements** | Reporté | Refactor XL — attente besoin réel |
| 17 | **Sync Google Calendar** | ✅ Done | OAuth2, sync auto create/update/delete, UI connect/disconnect |
| 18 | **Compte client self-service** | ✅ Done | Magic link, portail client, historique RDV, fidélité, annuler/reporter |

**Migrations à exécuter en DB** :
- `docs/migrations/027_recurring_appointments.sql` — colonnes récurrence
- `docs/migrations/028_google_calendar_sync.sql` — colonnes Google Calendar
- `docs/migrations/029_client_accounts.sql` — table `client_sessions`

**Env vars à configurer (Google Calendar)** :
- `GOOGLE_CALENDAR_CLIENT_ID` — OAuth Client ID (Google Cloud Console)
- `GOOGLE_CALENDAR_CLIENT_SECRET` — OAuth Client Secret

---

## Gap Analysis — Avant/Après Phase 1

| Domaine | Avant Phase 1 | Après Phase 4 | Gap restant |
|---|---|---|---|
| Booking core | ✅ Complet | ✅ Complet | — |
| Annulation/Report | ❌ Aucun | ✅ Complet | — |
| Rappels | ✅ Email 24h+2h | ✅ Email + follow-up J+1 | SMS (payant) |
| No-show prévention | ⚠️ Tracking seul | ✅ Tracking + blocage | Dépôt Stripe (payant) |
| Fidélité × Booking | ❌ Stubbed | ✅ Points auto | — |
| Notif staff | ❌ Aucun | ✅ Email auto | — |
| Analytics | ❌ Aucun | ✅ Dashboard complet | — |
| Widget/embed | ❌ Aucun | ✅ iframe + lien social | — |
| Waiting list | ❌ Aucun | ✅ Notif auto | — |
| RDV récurrents | ❌ Aucun | ✅ weekly/biweekly/monthly | — |
| Google Calendar | ❌ Aucun | ✅ OAuth sync | — |
| Compte client | ❌ Aucun | ✅ Magic link + portail | — |
| Paiements | ❌ Aucun | ❌ Aucun | Stripe (payant) |
| Multi-location | ❌ Aucun | ❌ Aucun | Refactor XL |

**Complétude estimée : 90% (vs 60% avant Phase 1)**

---

## Architecture technique

### Nouvelles routes API (Phase 1)
```
POST /api/book/cancel/[token]       — Annulation publique
GET  /api/book/cancel/[token]       — Détails RDV pour annulation
POST /api/book/reschedule/[token]   — Report publique
GET  /api/book/reschedule/[token]   — Détails RDV pour report
GET  /api/book/reschedule/[token]/slots — Créneaux dispo pour report
```

### Nouvelles pages (Phase 1)
```
/[locale]/book/cancel/[token]       — Page annulation client
/[locale]/book/reschedule/[token]   — Page report client
```

### Fichiers clés modifiés (Phase 1)
```
lib/email.ts                        — +sendStaffNotificationEmail, +cancelUrl/rescheduleUrl
app/api/appointments/route.ts       — +loyalty points on completion, +staff notif
app/api/book/[slug]/book/route.ts   — +no-show blocking, +cancel/reschedule URLs, +staff notif
app/api/cron/reminders/route.ts     — +cancel_token in query, +links in emails
components/appointments/DetailModal  — +loyalty feedback display
types/appointments.ts               — +cancel_token, +no_show_block_threshold
```

---

## Sources du benchmark
- Planity: capterra.com, appairium.com, stripe.com/customers/planity
- Salonkee: capterra.com, salonkee.com/pricing
- Treatwell: capterra.com, treatwell.co.uk/partners/pricing
- Fresha: fresha.com/pricing, thesalonbusiness.com, fresha.com/blog
- SimplyBook.me: simplybook.me/pricing, zeeg.me
- Timely: gettimely.com/pricing, gettimely.com/features
- Square: squareup.com/appointments/pricing, nerdwallet.com
- Calendly: calendly.com/pricing
