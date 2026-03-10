# Rebites — Roadmap d'implémentation complète

> **Date** : 10 mars 2026
> **Base** : Product Audit `docs/audits/product-audit-2026-03-10.md`
> **Durée estimée** : ~26 semaines (9 phases)
> **31 items** — 6 S, 12 M, 9 L, 4 XL

---

## Graphe de dépendances

```
Tests (3) + Fix TS (10) ──────── Phase 0 (fondation pour tout le reste)
       │
       ▼
Stripe (1) ────────────────┬──── No-show deposits (11) [Phase 4]
                           ├──── Plan enforcement
                           └──── Monetisation

Apple APNS (2) ────────────────── Standalone (pas de bloqueur)

Resend webhooks (9) ──────────── Email tracking (4)

Server-side analytics (6) ────┬── Advanced analytics (15) [Phase 7]
                              └── KPI engine owners (17) [Phase 5]

Booking admin UI (7) ─────────── SMS reminders (5)

Growth engine (16) ───────────── Auto notifications (13)

Stripe (1) + VIP (20) ────────── Multi-reward catalog (14)

i18n (21) ─────────────────────── Cross-cutting (touche tout)

Multi-site (25) ───────────────── POS (22), API publique (24)
```

---

## Phase 0 — Fondation (Semaine 1-2)

> **Objectif** : filet de sécurité avant toute construction.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 3 | **Tests automatisés** | L | Zero tests. Setup Vitest + Playwright. Couvrir les chemins critiques (scan, register, campaigns, wallet). CI GitHub Actions. |
| 10 | **Fix TypeScript errors** | M | Retirer `ignoreBuildErrors: true` de `next.config.ts`. Fixer fichier par fichier, commit souvent. |

### Livrables
- `vitest.config.ts` + `playwright.config.ts`
- Helpers de test : mock Supabase, fixtures auth
- Tests unitaires : `lib/kpi-calculators.ts`, `lib/growth-triggers.ts`, `lib/apple-wallet.ts`, `lib/rate-limit.ts`
- Tests intégration : `/api/scan/[token]`, `/api/register`, `/api/compaigns`
- E2E smoke : login → scan → registration
- Pipeline CI : lint + type-check + tests
- `ignoreBuildErrors` retiré

### Ce que ça débloque
Refactoring safe pour toutes les phases suivantes. Le CI attrape les régressions.

---

## Phase 1 — Revenu (Semaine 3-5)

> **Objectif** : activer les plans payants. Bloqueur #1 de la monétisation.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 1 | **Intégration Stripe** | XL | Plans existent en BDD (`plans`, `plan_features`) avec `price_monthly` mais aucun paiement. `/api/select-plan` assigne sans facturer. |

### Scope d'implémentation
- `lib/stripe.ts` — Stripe SDK, création customer, CRUD subscriptions
- `/api/stripe/checkout` — Checkout Session pour sélection de plan
- `/api/stripe/webhook` — events : `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- `/api/stripe/portal` — Customer Portal (self-service billing)
- Migration BDD : colonnes `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` sur `restaurants`
- UI Settings : plan actuel, upgrade/downgrade, factures
- Enforcement middleware : vérifier `subscription_status` avant features gated
- Idempotency : table `stripe_events` pour dédupliquer les webhooks

### Ce que ça débloque
Monétisation, no-show deposits (Phase 4), toute feature premium.

---

## Phase 2 — Parité Wallet + Intelligence Email (Semaine 5-7)

> **Objectif** : combler les 2 plus gros gaps produit — Apple passes figées + campagnes aveugles.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 2 | **Apple Wallet APNS push** | L | Google Wallet sync auto au scan. Apple passes générées mais jamais mises à jour → clients voient un compteur figé. |
| 9 | **Resend webhooks** | M | Prérequis pour le tracking email. Resend peut POST les events delivery/open/bounce. |
| 4 | **Email open/click tracking** | M | Dépend de Resend webhooks. Sans ça, le ROI des campagnes est invisible. |

### Apple APNS — Détail
- Certificat Push Notification pour le Pass Type ID (Apple Developer)
- `lib/apple-push.ts` — client APNS HTTP/2 (module `http2` natif Node, pas de dépendance)
- Table BDD : `device_registrations` (device_library_id, push_token, serial_number)
- Endpoints web service Apple (requis par la spec) :
  - `POST /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber` — enregistrer device
  - `DELETE /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber` — désenregistrer
  - `GET /api/wallet/v1/devices/:deviceId/registrations/:passTypeId` — lister passes à jour
  - `GET /api/wallet/v1/passes/:passTypeId/:serialNumber` — servir le dernier .pkpass
  - `POST /api/wallet/v1/log` — logs erreur client
- Au scan : push APNS à tous les devices enregistrés pour ce client (même pattern fire-and-forget que Google)

### Email tracking — Détail
- `/api/webhooks/resend` — vérifier signature, gérer `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
- Table BDD : `email_events` (campaign_id, customer_id, event_type, timestamp, metadata)
- Agrégats sur `campaigns` : delivered_count, open_count, click_count, bounce_count
- Dashboard Campaigns : taux ouverture, clic, bounce par campagne

### Ce que ça débloque
Wallet complet sur iPhone, visibilité performance campagnes, data pour analytics avancées.

---

## Phase 3 — Booking Complet + SMS (Semaine 7-9)

> **Objectif** : finaliser le module booking et ajouter le SMS.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 7 | **Booking admin UI** | M | Pages stubs existent (`appointments/services/`, `staff/`, `settings/`). APIs CRUD fonctionnelles. Manque le polish UI. |
| 5 | **SMS reminders** | L | 98% taux ouverture vs 20% email. Le cron reminders existe déjà → ajouter canal SMS. |

### Booking admin — Scope
- **Services** : CRUD complet, drag-to-reorder, bulk enable/disable, présets durée
- **Staff** : CRUD, éditeur grille disponibilités (jour/heure), assignation services
- **Settings** : heures d'ouverture, fenêtre booking, politique annulation, durée créneau

### SMS — Scope
- Twilio SDK : `lib/sms.ts`
- BDD : tracking usage SMS (coût par message)
- Gating plan : SMS sur Pro/Premium seulement (`sms_reminders` dans `plan_features`)
- Modifier `/api/cron/reminders` : envoyer SMS en plus de l'email selon préférence restaurant
- Settings restaurant : toggle SMS, préférences timing
- Env vars : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### Ce que ça débloque
Produit booking complet, SMS comme feature upsell, meilleur taux de présence RDV.

---

## Phase 4 — Scale + Protection (Semaine 9-12)

> **Objectif** : analytics scalable, anti-fraude, deposits.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 6 | **Server-side analytics** | L | Le dashboard calcule tout en JS client-side (~15 queries COUNT parallèles). Ne scale pas au-delà de ~10k clients. |
| 12 | **Anti-fraude scan** | M | Aucun rate limiting sur les scans. Un client peut être scanné à l'infini. |
| 11 | **No-show deposit/blocking** | M | Requiert Stripe (Phase 1). Le tracking no-show existe déjà. |
| 8 | **Page analytics** | S | Ajouter Vercel Analytics ou Plausible sur les pages publiques. |

### Server-side analytics — Approche
- `lib/metrics-batch.ts` utilise déjà `compute_restaurant_metrics_batch()` → upsert `restaurant_metrics`
- Étendre la fonction batch pour calculer TOUS les KPIs actuellement dans `kpi-calculators.ts`
- Dashboard lit depuis `restaurant_metrics` (1 seul read) au lieu de calculer live
- Le cron `/api/cron/metrics-daily` existe déjà → étendre ce qu'il calcule
- Garder `kpi-calculators.ts` comme source de vérité des formules, exécuter en batch

### Anti-fraude — Scope
- Dans `/api/scan/[token]` : max scans/client/jour (configurable), délai min entre scans (30min), détection burst même IP
- Utiliser `rateLimit()` existant de `lib/rate-limit.ts`
- Colonnes `loyalty_settings` : `max_scans_per_day`, `min_scan_interval_minutes`
- Messages d'erreur clairs en français

### No-show deposits — Scope
- Stripe PaymentIntent `capture_method: 'manual'` au booking
- Auto-capture sur no-show, auto-cancel (release hold) sur présence ou annulation
- Settings booking : montant caution, politique no-show
- Décommenter le code bloquant dans `api/book/[slug]/book/route.ts` L132-139

### Ce que ça débloque
Dashboard performant, protection contre la fraude, revenus protégés des no-shows.

---

## Phase 5 — Moteur d'Engagement (Semaine 12-15)

> **Objectif** : automatiser l'engagement client et exploiter le growth engine.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 16 | **Growth engine completion** | M | Framework existe (`lib/growth-triggers.ts`, `lib/growth-actions.ts`). Triggers fire, actions persistent, mais rien ne s'exécute. |
| 13 | **Auto notifications** | M | Dépend du growth engine. "Near reward", "inactive 30j", "reward earned". Actuellement placeholder Pro. |
| 17 | **KPI engine for owners** | M | `lib/kpi-engine.ts` résout les KPIs par plan. `lib/kpi-calculators.ts` calcule. Rien n'est exposé aux owners. |

### Growth engine — Scope
- Layer d'exécution des actions :
  - `reengagement_recommendation` → auto-créer draft campagne ciblant segment inactif
  - `email_campaign_suggestion` → notification dashboard avec CTA
  - `upgrade_prompt` → bannière in-app
- Cron `/api/cron/growth` (daily) — exécute `generateAllGrowthActions()`, puis exécute les pending
- Lifecycle action : pending → in_progress → completed/dismissed

### Auto notifications — Scope
- Au scan : vérifier si client "near reward" (80% du seuil), envoyer email/push
- À l'atteinte récompense : email félicitations
- À l'inactivité (30j) : email re-engagement
- Tout gated au plan Pro via `plan_features`

### KPI engine owners — Scope
- Nouvelle section dashboard : "Performance" ou dans Overview
- Lire depuis `restaurant_metrics` (calculé en Phase 4)
- KPIs groupés par catégorie (growth, rétention, revenu, engagement)
- Indicateurs statut (bon/attention/critique)
- Triggers growth affichés comme cartes actionnables

### Ce que ça débloque
Boucle d'engagement automatique, dashboard data-driven, valeur du plan Pro.

---

## Phase 6 — Expansion Fidélité (Semaine 15-18)

> **Objectif** : enrichir la fidélité et ajouter la viralité.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 14 | **Multi-reward catalog** | M | Actuellement 1 seul `reward_message`. Besoin de plusieurs récompenses à différents seuils. |
| 18 | **Referral program** | L | Client recommande → bonus points pour les deux. Fort coefficient viral. |
| 20 | **VIP levels** | M | Bronze/Silver/Gold avec multiplicateurs de points. Gamification. |
| 19 | **Google Reviews automation** | S | Après scan/RDV, rediriger vers Google Reviews. Simple mais fort impact SEO. |

### Multi-reward — Scope
- Table `rewards` (restaurant_id, name, description, threshold_points, threshold_stamps, image_url, active)
- Remplace `reward_message`/`reward_threshold` dans loyalty_settings
- Route scan : vérifier toutes les rewards actives, retourner celles déclenchées
- Dashboard Loyalty : CRUD rewards
- Backward compat : migrer l'existant vers 1ère ligne de `rewards`

### Referral — Scope
- Table `referrals` (referrer_customer_id, referred_customer_id, restaurant_id, bonus_points, status)
- Code/lien de parrainage unique par client
- Champ optionnel code parrainage dans le formulaire d'inscription
- Bonus points configurable dans settings

### VIP levels — Scope
- Table `vip_levels` (restaurant_id, name, min_points, multiplier, perks_description)
- Niveau basé sur points lifetime
- Multiplicateur appliqué au scan
- Pass wallet affiche le niveau VIP

### Google Reviews — Scope
- Settings : Google Place ID
- CTA "Laisser un avis" après scan ou RDV terminé
- Lien : `https://search.google.com/local/writereview?placeid=PLACE_ID`
- Optionnel : ne proposer qu'aux VIP / >5 visites

### Ce que ça débloque
Programme fidélité riche, croissance virale, visibilité Google.

---

## Phase 7 — Analytics Avancées + Instrumentation (Semaine 18-20)

> **Objectif** : analytics profondes et tracking conversions.

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 15 | **Advanced analytics** | L | LTV, churn, cohortes, performance campagnes. Build sur Phase 4 (server-side) et Phase 2 (email tracking). |
| 27 | **Conversion tracking** | M | Events page view → inscription. |
| 28 | **Wallet adoption rate** | S | Passes actives / total clients. Déjà calculable depuis `wallet_passes`. |
| 29 | **Time-to-first-scan** | S | Délai inscription → 1er scan. Query simple `customers.created_at` vs 1ère transaction. |
| 30 | **Restaurant churn** | S | Tracker `last_login_at` sur restaurants. |
| 31 | **Redemption tracking** | S | Récompenses utilisées vs déclenchées. Colonne `redeemed_at` sur events reward. |

### Advanced analytics — Scope
- Analyse cohorte : grouper clients par mois d'inscription, tracker rétention M+1/M+2/M+3
- Performance campagne : taux ouverture, clic, revenu attribué (requiert email tracking Phase 2)
- Calcul LTV : déjà dans `kpi-calculators.ts`, nécessite setting `average_ticket`
- Prédiction churn : basé sur décroissance fréquence visites

### Instrumentation (27-31) — Scope
- La plupart = queries lightweight ajoutées au batch metrics
- Conversion tracking : table `analytics_events` (event_type, restaurant_id, metadata, created_at)
- Page register fire event au load et au submit réussi

### Ce que ça débloque
Décisions data-driven pour les owners, analytics premium comme feature Pro.

---

## Phase 8 — Plateforme (Semaine 20-26)

> **Objectif** : fonctionnalités de plateforme pour la scale.
> **⚠️ Ne commencer qu'après Phases 0-7 stables et revenus en place.**

| # | Item | Effort | Détail |
|---|------|--------|--------|
| 21 | **Multi-langue (i18n)** | XL | Français uniquement. Cross-cutting : touche chaque composant et chaque message d'erreur API. |
| 25 | **Multi-site** | XL | Un owner, plusieurs établissements. Schema changes (restaurant groups). |
| 24 | **API publique / webhooks** | L | Intégrations tierces. Gestion API keys, rate limiting, webhook subscriptions. |
| 23 | **PWA / mobile app** | L | App owner mobile : scanner + push notifications. |
| 22 | **POS integration** | XL | Scan auto au paiement. Requiert APIs partenaires POS (Square, SumUp, etc.). |
| 26 | **Wallet template marketplace** | M | Templates custom comme upsell. `wallet_pass_templates` existe déjà. |

### i18n — Approche
- `next-intl` avec App Router
- Extraire tous les strings FR dans `messages/fr.json`
- Ajouter `messages/en.json`
- URLs localisées : `/fr/dashboard`, `/en/dashboard`
- API errors : header `Accept-Language`, réponses localisées

### Multi-site — Approche
- Table `restaurant_groups` (owner_id, name)
- `group_id` sur `restaurants`
- Switch restaurant dans le dashboard
- Analytics agrégées cross-locations
- Option base client partagée

---

## Résumé des efforts

| Effort | Items | Durée estimée par item |
|--------|-------|------------------------|
| **S** (1-2 jours) | 8, 19, 28, 29, 30, 31 | 6 items |
| **M** (3-5 jours) | 7, 9, 10, 11, 12, 13, 14, 16, 17, 20, 26, 27 | 12 items |
| **L** (1-2 semaines) | 2, 3, 4, 5, 6, 15, 18, 23, 24 | 9 items |
| **XL** (2-4 semaines) | 1, 21, 22, 25 | 4 items |

---

## Matrice de priorité

| Phase | Semaines | Items | Thème | Impact revenu |
|-------|----------|-------|-------|---------------|
| **0** | 1-2 | 3, 10 | Filet de sécurité | Indirect (prévient les bugs coûteux) |
| **1** | 3-5 | 1 | Revenu | **Direct** (active la facturation) |
| **2** | 5-7 | 2, 4, 9 | Parité produit | Indirect (rétention, valeur Pro) |
| **3** | 7-9 | 5, 7 | Booking complet | Modéré (SMS comme upsell) |
| **4** | 9-12 | 6, 8, 11, 12 | Scale + protection | Modéré (deposits, anti-fraude) |
| **5** | 12-15 | 13, 16, 17 | Automatisation engagement | Élevé (stickiness plan Pro) |
| **6** | 15-18 | 14, 18, 19, 20 | Expansion fidélité | Élevé (viralité, gamification) |
| **7** | 18-20 | 15, 27-31 | Analytics profondeur | Modéré (valeur plan Premium) |
| **8** | 20-26 | 21-26 | Plateforme scale | Long-terme (expansion marché) |

---

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| **Fiabilité webhooks Stripe** | Clés idempotency + table dedup `stripe_events`. Logging chaque event. Retry exponential backoff. |
| **Certificat Apple APNS** | Expire annuellement. Monitoring/alerting. Stocker en env vars, pas filesystem. |
| **Coût SMS Twilio** | Système de crédits, caps par plan, visibilité facturation claire. |
| **Fix TypeScript (item 10)** | Peut révéler beaucoup de bugs cachés. Approche incrémentale : fichier par fichier, commit souvent, tests après chaque batch. |
| **Migration analytics server-side** | Ne pas casser le dashboard pendant la transition. Paralléliser ancien (client-side) et nouveau (server-side), comparer, puis switcher. |
| **i18n cross-cutting** | NE PAS commencer avant que le produit soit stable et que le revenu coule. |

---

## Fichiers critiques pour l'implémentation

| Fichier | Phases impactées |
|---------|-----------------|
| `app/api/scan/[token]/route.ts` | 0, 2, 4, 5, 6 — Apple APNS, anti-fraude, rewards, notifications |
| `lib/plan-features.ts` | 1, 3, 5, 7 — Chaque nouvelle feature gated |
| `app/api/select-plan/route.ts` | 1 — Remplacer par Stripe Checkout |
| `lib/kpi-calculators.ts` | 4, 5, 7 — Migrer vers batch server-side |
| `lib/growth-triggers.ts` | 5 — Ajouter layer d'exécution |
| `app/api/book/[slug]/book/route.ts` | 4 — Décommenter blocage no-show, ajouter deposit |
| `lib/email.ts` | 2, 3, 5 — Nouveaux templates (notifications, SMS fallback) |
| `app/dashboard/page.tsx` | 4, 5, 7 — Lire depuis metrics batch, exposer KPIs |
| `components/OverviewTab.tsx` | 5, 7 — Intégrer growth actions, KPIs enrichis |
| `components/LoyaltyTab.tsx` | 6 — Multi-reward, VIP, referral settings |
