# Analyse Produit Complète — Rebites (Loyalty SaaS)

> **Date** : 10 mars 2026
> **Scope** : Audit complet du code source — orienté produit, features, KPIs, business, stack technique
> **Repo** : loyalty-saas (branche main, commit bf7e81c)

---

## 1. Vue d'ensemble de l'app

### Objectif principal
Plateforme SaaS B2B de **fidélisation client** et de **gestion de rendez-vous** pour commerces de proximité (restaurants, salons, cafés, spas). Un propriétaire crée son programme de fidélité, ses clients s'inscrivent via une page publique, accumulent des points/tampons en scannant un QR code, et reçoivent des récompenses.

### Problème résolu
- Les petits commerces n'ont pas d'outil simple pour fidéliser leurs clients (cartes à tamponner physiques, pas de data, pas de digital wallet)
- Pas de moyen de relancer les clients inactifs ou de segmenter leur base
- Pas d'outil de prise de rendez-vous intégré pour les métiers de service (coiffure, beauté, spa)

### Utilisateur ciblé
- **Primaire** : propriétaire de commerce non-technique (restaurateur, coiffeur, esthéticienne)
- **Secondaire** : client final du commerce (inscription, scan, wallet)

### Parcours utilisateur principal

**Propriétaire :**
1. Login par magic link (OTP email) → `dashboard/login`
2. Onboarding : nom, type, couleur, slug → `onboarding/`
3. Dashboard : configurer fidélité (points/tampons), voir KPIs, lancer campagnes, gérer RDV
4. Scanner le QR code client pour attribuer des points

**Client final :**
1. S'inscrire via `/register/[slug]` (page brandée)
2. Recevoir email de bienvenue + QR code
3. Ajouter la carte fidélité à Google Wallet / Apple Wallet
4. Scanner son QR code à chaque visite → points/tampons incrémentés
5. Recevoir sa récompense au seuil atteint

---

## 2. Fonctionnalités

### Fonctionnalités principales (core)

| # | Feature | Statut | Preuves code |
|---|---------|--------|-------------|
| 1 | **Programme de fidélité (points + tampons)** | ✅ Complet | `LoyaltyTab.tsx`, `api/scan/[token]`, `api/loyalty-settings`, DB trigger atomique |
| 2 | **QR Code scanning** | ✅ Complet | `dashboard/scanner/page.tsx`, `api/scan/[token]`, résolution triple (qr_token → id → short_code) |
| 3 | **Inscription client publique** | ✅ Complet | `register/[slug]/page.tsx`, `api/register/[slug]`, 10 pts de bienvenue, email welcome |
| 4 | **Dashboard propriétaire** | ✅ Complet | `dashboard/page.tsx` (3275 LOC), 6 onglets (Overview, Clients, Loyalty, Campaigns, Analytics, Settings) |
| 5 | **Google Wallet** | ✅ Complet | `lib/google-wallet.ts`, `api/wallet/*` (16 routes), JWT + REST API, sync auto au scan |
| 6 | **Apple Wallet** | 🟡 Partiel | `lib/apple-wallet.ts`, `.pkpass` generation via PKCS#7, mais pas de push APNS au scan |
| 7 | **Campagnes email** | ✅ Complet | `api/compaigns/route.ts`, 6 segments, templates HTML brandés, scheduling |
| 8 | **Analytics & KPIs** | ✅ Complet | `AnalyticsTab.tsx`, `OverviewTab.tsx`, score programme 0-100, insights auto |
| 9 | **Système de rendez-vous (Booking Rebites)** | 🟡 Partiel | Calendrier, CRUD, page publique multi-step, mais UI admin services/staff/settings incomplètes |
| 10 | **No-show tracking** | ✅ Complet | `client_no_show_stats`, compteur atomique, badge dans DetailModal, vérification au booking |

### Fonctionnalités secondaires

| # | Feature | Statut | Preuves code |
|---|---------|--------|-------------|
| 11 | **Email anniversaire (cron)** | ✅ Complet | `api/cron/birthdays`, daily 9h UTC |
| 12 | **Rappels RDV (cron)** | ✅ Complet | `api/cron/reminders`, hourly, 24h + 2h avant |
| 13 | **Export CSV clients** | ✅ Complet | `api/export-csv`, semicolon-delimited |
| 14 | **Upload logo** | ✅ Complet | `api/upload-logo`, Supabase Storage, MIME whitelist |
| 15 | **Page de confirmation booking** | ✅ Complet | `book/[slug]/success`, lien Google Calendar |
| 16 | **Unsubscribe RGPD** | ✅ Complet | `api/unsubscribe`, one-click via qr_token |
| 17 | **Tutoriel dashboard** | ✅ Complet | `DashboardTutorial.tsx` |
| 18 | **Rate limiting** | ✅ Complet | `lib/rate-limit.ts`, sliding window in-memory |

### Fonctionnalités suggérées mais incomplètes

| # | Feature | Indice dans le code | Statut |
|---|---------|-------------------|--------|
| 19 | **Blocage client > 3 no-shows** | Commenté dans `api/book/[slug]/book/route.ts` L132-139 | ❌ Désactivé (attend système de caution) |
| 20 | **Règles anti-fraude scan** | UI "Pro-only" dans `LoyaltyTab.tsx` section Sécurité | ❌ Placeholder UI |
| 21 | **Notifications auto (near reward, inactive)** | UI "Pro-only" dans `LoyaltyTab.tsx` section Notifications | ❌ Placeholder UI |
| 22 | **Multi-récompenses (catalogue)** | Teaser "Pro" dans LoyaltyTab section Rewards | ❌ UI teaser uniquement |
| 23 | **LTV, churn, cohortes** | Zone "Pro" dans `AnalyticsTab.tsx` | ❌ Locked UI |
| 24 | **Plans & billing** | `api/plans`, `api/select-plan`, `PlanSelection.tsx`, table `plans` + `plan_features` | 🟡 Structure en place, pas de paiement |
| 25 | **Admin super-utilisateur** | `app/admin/` (6 pages), `api/admin/*` (12+ routes) | 🟡 Fonctionnel mais usage interne |
| 26 | **Growth engine / triggers** | `lib/growth-triggers.ts`, `lib/growth-actions.ts`, `api/growth/*` | 🟡 Framework, peu utilisé |
| 27 | **KPI engine dynamique** | `lib/kpi-engine.ts`, `lib/kpi-calculators.ts`, `api/admin/kpis/*` | 🟡 Calculateurs en place, pas exposé au owner |

---

## 3. Structure produit

### Architecture générale

```
┌─────────────────────────────────────────────────────────┐
│                    PAGES PUBLIQUES                       │
│  /register/[slug]  │  /book/[slug]  │  /scan/[token]    │
└────────┬───────────┴───────┬────────┴──────┬────────────┘
         │                   │               │
┌────────▼───────────────────▼───────────────▼────────────┐
│                     API ROUTES (65)                      │
│  /api/register  │  /api/book  │  /api/scan  │  /api/*   │
└────────┬───────────────────┬───────────────┬────────────┘
         │                   │               │
┌────────▼───────────────────▼───────────────▼────────────┐
│              SUPABASE (PostgreSQL + Auth)                │
│  restaurants │ customers │ transactions │ appointments   │
│  loyalty_settings │ campaigns │ wallet_passes │ plans    │
└────────┬───────────────────┬───────────────┬────────────┘
         │                   │               │
┌────────▼──────┐  ┌────────▼──────┐  ┌─────▼───────────┐
│   Resend      │  │ Google Wallet │  │  Supabase       │
│   (Email)     │  │ (REST API)    │  │  Storage (logos) │
└───────────────┘  └───────────────┘  └─────────────────┘

┌─────────────────────────────────────────────────────────┐
│              DASHBOARD PROPRIÉTAIRE                      │
│  /dashboard (6 onglets) │ /dashboard/appointments (4p)  │
│  /dashboard/scanner     │ /dashboard/wallet             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              CRON JOBS (Vercel)                          │
│  birthdays (daily)  │  reminders (hourly)               │
│  wallet-sync (6h)   │  metrics (daily)                  │
└─────────────────────────────────────────────────────────┘
```

### Pages & modules (23 pages)

- **Dashboard** : 6 onglets dans un SPA-like (`dashboard/page.tsx` = orchestrateur)
- **Booking Rebites** : 4 sous-pages admin (`appointments/`, `services/`, `staff/`, `settings/`)
- **Admin interne** : 6 pages (`admin/`, `admin/plans/`, `admin/kpis/`, `admin/wallet/`)
- **Public** : registration, booking multi-step, success page, scan page

### Base de données (17 tables identifiées)

`restaurants`, `customers`, `transactions`, `loyalty_settings`, `campaigns`, `profiles`, `plans`, `plan_features`, `wallet_pass_templates`, `wallet_passes`, `appointments`, `services`, `staff_members`, `staff_availability`, `appointment_settings`, `appointment_reminders`, `client_no_show_stats`

### Flux principaux

```
Inscription client → Welcome email + QR code → Scan au commerce →
Points/tampons ++ → Wallet sync → Seuil atteint → Récompense

Booking public → Choix service/staff/créneau → Confirmation email →
Rappel 24h → Rappel 2h → RDV terminé/absent/annulé
```

---

## 4. KPI / Métriques produit à suivre

### Acquisition

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **Nouveaux clients / semaine** | COUNT(customers) WHERE created_at > 7d | Registration |
| **Taux de conversion page inscription** | Inscriptions / Vues page `/register/[slug]` | Registration (nécessite analytics page views — **non instrumenté**) |
| **Source d'acquisition** | Référent / UTM de la page register | Registration (**non instrumenté**) |
| **Nouveaux restaurants / mois** | COUNT(restaurants) créés par période | Onboarding |
| **Taux de complétion onboarding** | Restaurants avec ≥1 client / total restaurants | Onboarding (**non instrumenté**) |

### Activation

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **Time-to-first-scan** | Délai entre inscription client et premier scan | Scan QR |
| **Taux d'ajout wallet** | Clients avec wallet_pass active / total clients | Google/Apple Wallet (**non instrumenté**) |
| **Taux de complétion booking** | Bookings créés / sessions page booking | Booking (**non instrumenté**) |
| **Taux de setup restaurant** | Restaurants avec loyalty configuré / total | Dashboard (**non instrumenté**) |

### Rétention

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **Taux de retour client** | Clients avec ≥2 visites / total clients | Déjà calculé dans `OverviewTab.tsx` |
| **Clients actifs (30j)** | Clients avec scan dans les 30 derniers jours | Déjà calculé dans `OverviewTab.tsx` |
| **Clients inactifs (45j+)** | Clients sans scan depuis 45 jours | Déjà calculé dans `OverviewTab.tsx` |
| **Taux de churn restaurant** | Restaurants sans login > 30j / total | Admin (**non instrumenté**) |
| **Rétention cohortale** | % clients actifs M+1, M+2, M+3 par cohorte d'inscription | Analytics (**prévu mais locked "Pro"**) |

### Engagement

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **Scans / jour / restaurant** | AVG transactions par jour | Scan — déjà dans activity chart |
| **Campagnes envoyées / mois** | COUNT(campaigns WHERE status='sent') | Campaigns |
| **Taux d'ouverture email** | Opens / Sent | Campaigns (**non instrumenté — Resend le supporte**) |
| **Taux de clic email** | Clicks / Opens | Campaigns (**non instrumenté**) |
| **No-show rate** | no_show / total appointments | Booking — déjà tracked |
| **Programme Score** | Score composite 0-100 (4 dimensions) | Déjà calculé dans `OverviewTab.tsx` |

### Conversion

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **Taux de récompense** | Clients ayant atteint le seuil / total | Loyalty — déjà calculé |
| **Délai moyen pour compléter carte** | AVG(jours entre 1er scan et carte complète) | Analytics — déjà calculé (stamps mode) |
| **Taux de rédemption** | Récompenses utilisées / récompenses déclenchées | Loyalty (**non instrumenté — pas de tracking d'utilisation**) |
| **Conversion free → paid** | Restaurants passant à un plan payant / total free | Plans (**non instrumenté — pas de paiement**) |

### Revenu

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **MRR (Monthly Recurring Revenue)** | SUM(plan.price) pour restaurants actives | Plans (**pas de paiement implémenté**) |
| **ARPU** | MRR / restaurants actives | Plans |
| **Revenue par booking** | SUM(service.price) pour appointments completed | Booking — le prix est stocké |
| **LTV restaurant** | MRR × durée moyenne d'abonnement | (**hypothèse — non instrumenté**) |

### Performance technique

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **Temps de réponse API scan** | p50/p95 latence `/api/scan/[token]` | Scan (**non instrumenté — besoin APM**) |
| **Taux d'échec wallet sync** | wallet_passes.sync_error IS NOT NULL / total | Wallet — déjà dans cron |
| **Emails envoyés / échoués** | Résultat cron birthdays + reminders | Email — logged dans cron |
| **Taux d'erreur API** | 5xx responses / total requests | Global (**nécessite Vercel Analytics ou Sentry**) |

### Satisfaction

| KPI | Formule | Feature liée |
|-----|---------|-------------|
| **NPS post-booking** | Score 1-10 après rendez-vous | Booking (**non implémenté**) |
| **Taux de désabonnement email** | Unsubscribes / total emails envoyés | Unsubscribe (**partiellement — l'endpoint existe, pas de compteur**) |

---

## 5. Business / Produit

### Proposition de valeur

> "Un outil tout-en-un pour fidéliser vos clients et gérer vos rendez-vous, sans compétence technique."

Trois piliers :
1. **Fidélisation digitale** — Remplacer la carte à tamponner papier par un QR + wallet
2. **Marketing automatisé** — Campagnes email segmentées, anniversaires auto
3. **Prise de rendez-vous** — Booking public + gestion calendrier (pour les métiers de service)

### Modèle business suggéré

**SaaS freemium multi-plan** — preuves :
- Table `plans` avec clés `free`, `growth`, `pro`, `enterprise` (`lib/plan-features.ts`)
- Feature gating par plan (wallet_studio, campaigns_email, analytics, export_csv)
- UI "Pro" teaser dans LoyaltyTab et AnalyticsTab (upsell in-app)
- API `select-plan` et `PlanSelection.tsx`
- **Mais** : aucun système de paiement intégré (pas de Stripe, pas de webhook billing)

### Éléments SaaS confirmés

- Multi-tenant strict (`restaurant_id` isolation sur toutes les requêtes)
- Onboarding self-service (création restaurant automatisée)
- Dashboard par restaurant (pas de données partagées entre tenants)
- Plans + feature flags (architecture en place)
- Cron jobs pour automation (birthdays, reminders, metrics, wallet-sync)
- Admin super-utilisateur (gestion plans, KPIs, restaurants)

### Points forts produit

1. **Expérience wallet digitale complète** — Google Wallet (REST API + JWT) + Apple Wallet (.pkpass signé PKCS#7), sync automatique au scan
2. **Deux modes de fidélité** — Points et tampons, transition possible entre modes
3. **Booking module intégré** — Rare pour un outil de fidélité, différenciant pour salons/spas
4. **Automatisation email** — Birthday cron, rappels RDV, campagnes segmentées
5. **No-show prevention** — Tracking par client, badge visuel, architecture prête pour caution
6. **Programme Score 0-100** — Métrique composite unique, compréhensible par un non-technique
7. **Page publique brandée** — Registration et booking aux couleurs du commerce
8. **Architecture solide** — DB triggers atomiques pour la fidélité, fire-and-forget pour le wallet, rate limiting

### Limites et zones floues

1. **Pas de paiement** — Aucune intégration Stripe/billing → impossible de monétiser
2. **Apple Wallet incomplet** — Pas de push APNS (le pass ne se met pas à jour automatiquement au scan)
3. **Analytics côté client uniquement** — Tout est calculé en JS à partir des transactions fetched → ne scale pas au-delà de ~10k clients
4. **Campaign email séquentiel** — Boucle séquentielle sur les destinataires → timeout Vercel au-delà de ~500 recipients
5. **Pas de tracking d'ouverture/clic email** — Resend le supporte mais non instrumenté
6. **Booking admin incomplet** — Les APIs staff/services/settings existent mais les pages admin sont des stubs
7. **Pas de SMS** — Rappels uniquement par email, pas de canal SMS
8. **Rate limiting in-memory** — Reset au cold start Vercel (acceptable en pré-scale)
9. **TypeScript errors ignorés** — `ignoreBuildErrors: true` dans next.config → dette technique
10. **Pas de tests automatisés** — Aucun fichier de test trouvé dans le repo

---

## 6. Stack technique

### Langages & frameworks

- **Next.js 16** (App Router) — framework fullstack
- **TypeScript 5** — typage (mais errors ignorés au build)
- **React 19** — UI
- **TailwindCSS 4** — styling (via PostCSS plugin)

### Librairies clés

| Lib | Usage |
|-----|-------|
| `@supabase/supabase-js` + `@supabase/ssr` | BDD + auth (cookie sessions) |
| `resend` | Email transactionnel |
| `recharts` | Graphiques (AreaChart, BarChart, PieChart) |
| `zod` | Validation d'entrées API |
| `lucide-react` | Icônes |
| `google-auth-library` + `jsonwebtoken` | Google Wallet JWT |
| `node-forge` + `jszip` | Apple Wallet .pkpass signing |
| `sharp` | Traitement d'images (logos) |
| `jsqr` | Décodage QR code caméra |
| `date-fns` | Manipulation de dates |
| `react-qr-code` | Génération QR code côté client |

### Organisation repo

```
app/                    # 23 pages + 65 API routes
components/             # 17 composants (tabs, modals, UI primitives)
lib/                    # 19 modules (auth, email, wallet, KPI engine, rate-limit)
types/                  # Types TypeScript (appointments)
docs/migrations/        # 11 fichiers SQL (schema Supabase)
public/                 # Assets statiques (favicon, SVGs, wallet assets)
```

### Infrastructure

- **Hosting** : Vercel (serverless)
- **BDD** : Supabase (PostgreSQL managé)
- **Storage** : Supabase Storage (logos)
- **Email** : Resend
- **Cron** : Vercel Cron (5 jobs configurés dans `vercel.json`)
- **Wallet** : Google Wallet API + Apple PassKit (signing local)

---

## 7. Manques et opportunités

### Manques critiques (bloquants pour la monétisation)

| # | Manque | Impact | Priorité |
|---|--------|--------|----------|
| 1 | **Intégration paiement (Stripe)** | Impossible de facturer → 0 revenu | 🔴 Critique |
| 2 | **Apple Wallet push (APNS)** | Pass pas à jour après scan sur iPhone | 🔴 Critique |
| 3 | **Tests automatisés** | Risque de régressions à chaque déploiement | 🔴 Critique |
| 4 | **Tracking email (open/click)** | Impossible de mesurer l'efficacité des campagnes | 🟠 Haut |

### Manques importants (valeur produit)

| # | Manque | Impact |
|---|--------|--------|
| 5 | **SMS reminders** | Canal principal pour les rappels RDV (taux d'ouverture 98% vs 20% email) |
| 6 | **Analytics server-side** | Le calcul client-side ne scale pas au-delà de ~10k clients |
| 7 | **Booking admin complet** | Les propriétaires ne peuvent pas gérer services/staff depuis l'UI |
| 8 | **Page analytics (Vercel/Plausible)** | Aucune donnée sur les visites des pages publiques |
| 9 | **Webhook Resend** | Capturer bounces, complaints, delivery status |
| 10 | **Multi-langue** | Tout est en français — pas d'i18n |

### Opportunités de croissance

| # | Opportunité | Rationale |
|---|------------|-----------|
| 1 | **Referral program** | Un client recommande → bonus points pour les deux |
| 2 | **Avis Google automatisés** | Après scan/RDV, rediriger vers Google Reviews |
| 3 | **Programme VIP / niveaux** | Bronze/Silver/Gold avec multiplicateurs de points |
| 4 | **Intégration caisse (POS)** | Scan auto au paiement sans action manuelle |
| 5 | **App mobile propriétaire** | Scanner + notifications push (PWA possible) |
| 6 | **Marketplace de templates wallet** | Templates wallet personnalisés comme upsell |
| 7 | **API publique / webhooks** | Permettre l'intégration avec d'autres outils |
| 8 | **Multi-site** | Un propriétaire avec plusieurs établissements (chaîne) |

### KPI manquants à instrumenter en priorité

1. **Taux de conversion page register** → Ajouter event tracking (page view → submit)
2. **Taux d'adoption wallet** → Compter wallet_passes actives / total customers
3. **Taux d'ouverture email** → Activer webhooks Resend
4. **Time-to-first-scan** → Calculer délai inscription → 1er scan
5. **Taux de churn restaurant** → Tracker last_login_at sur restaurants

---

## A. Résumé exécutif

**Rebites** est un SaaS freemium de fidélisation client + prise de rendez-vous pour commerces de proximité. L'app est **fonctionnellement riche** : double mode fidélité (points/tampons), wallet digital (Google + Apple), campagnes email segmentées, booking public multi-step, no-show tracking, dashboard analytique avec score programme 0-100.

**Forces** : architecture multi-tenant solide, wallet digital complet (rare sur le marché), UX brandée par commerce, automatisation email (birthday, rappels), score programme innovant.

**Faiblesse principale** : **aucun système de paiement** → l'app ne peut pas générer de revenu. C'est le bloquant #1 avant le lancement commercial. Les autres manques (Apple push APNS, tests, analytics server-side) sont importants mais secondaires.

**Maturité estimée** : ~70% pour un MVP, ~45% pour un produit commercial. L'effort restant est concentré sur la monétisation (Stripe), la fiabilité (tests, monitoring) et le scaling (analytics server-side, batched emails).

---

## B. Liste des features clés

| # | Feature | Statut | Pilier |
|---|---------|--------|--------|
| 1 | Programme fidélité (points) | ✅ | Loyalty |
| 2 | Programme fidélité (tampons) | ✅ | Loyalty |
| 3 | QR Code scanning (caméra + manuel) | ✅ | Loyalty |
| 4 | Google Wallet (REST + JWT + sync auto) | ✅ | Wallet |
| 5 | Apple Wallet (.pkpass signé) | 🟡 | Wallet |
| 6 | Inscription client publique brandée | ✅ | Acquisition |
| 7 | Dashboard propriétaire (6 onglets) | ✅ | Core |
| 8 | Vue d'ensemble + Score programme 0-100 | ✅ | Analytics |
| 9 | Analytics détaillées + insights auto | ✅ | Analytics |
| 10 | Campagnes email segmentées | ✅ | Marketing |
| 11 | Email anniversaire automatique (cron) | ✅ | Marketing |
| 12 | Booking public multi-step | ✅ | Booking |
| 13 | Calendrier RDV (jour + semaine) | ✅ | Booking |
| 14 | Rappels RDV (24h + 2h, cron) | ✅ | Booking |
| 15 | No-show tracking + badge | ✅ | Booking |
| 16 | Export CSV clients | ✅ | Data |
| 17 | Plans & feature gating | 🟡 | Business |
| 18 | Admin super-utilisateur | 🟡 | Ops |
| 19 | Growth engine / triggers | 🟡 | Growth |
| 20 | Paiement / billing | ❌ | Business |
| 21 | Apple Wallet push (APNS) | ❌ | Wallet |
| 22 | SMS reminders | ❌ | Marketing |
| 23 | Tests automatisés | ❌ | Qualité |

**Légende** : ✅ Complet | 🟡 Partiel | ❌ Non implémenté
