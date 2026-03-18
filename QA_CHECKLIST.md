# QA CHECKLIST — app.rebites.be
# Audit 2026-03-18 | 18 bugs trouvés
# Format: [ ] À faire | [~] En cours | [x] Corrigé & vérifié

---

## QUICK WINS (< 10 min chacun)

- [ ] **BUG-06** Clés i18n manquantes — appointments settings + analytics
  - Ajouter `appointmentAnalytics.noData`, `appointmentAnalytics.noDataDesc`, `appointmentAnalytics.title` dans fr/en/es/nl/it
  - Ajouter `appointmentStaff.daySun..daySat` manquantes dans les locales
  - Fichiers : `locales/*.json`

- [ ] **BUG-11** `/wallet/icon.png` 404 sur toutes les pages
  - Créer l'icône ou corriger la référence dans le manifest/meta tags
  - Fichiers : `public/`, `app/layout.tsx` ou `manifest.webmanifest`

- [ ] **BUG-14** Pas de `maxLength` sur l'input first_name (registration)
  - Ajouter `maxLength={100}` sur l'input
  - Fichier : `components/RegisterForm.tsx`

- [ ] **BUG-13** Erreurs Zod brutes exposées à l'utilisateur
  - Mapper les erreurs Zod en messages français lisibles
  - Fichier : `app/api/register/[slug]/route.ts`

- [ ] **BUG-09** Client portal pas traduit (tout en français quelle que soit la locale)
  - Extraire les textes en dur vers les clés i18n
  - Fichier : `app/[locale]/client/[slug]/page.tsx`

- [ ] **BUG-18** Pas d'attribut `name` sur les inputs email (login + client portal)
  - Ajouter `name="email"` pour l'autofill navigateur
  - Fichiers : `app/[locale]/dashboard/login/page.tsx`, `app/[locale]/client/[slug]/page.tsx`

- [ ] **BUG-16** Meta tag `apple-mobile-web-app-capable` deprecated
  - Remplacer par `mobile-web-app-capable` ou supprimer
  - Fichier : `app/layout.tsx`

- [ ] **BUG-15** Client portal — "Email envoyé !" même pour emails inexistants
  - Changer le message : "Si ce compte existe, un lien vous a été envoyé."
  - Fichier : `app/[locale]/client/[slug]/page.tsx`

---

## CRITICAL (sécurité / compliance / data)

- [ ] **BUG-01** Homepage expose raw JSON de toutes les restaurants
  - `owner_id`, `stripe_customer_id`, `scanner_token`, `google_calendar_refresh_token` visibles
  - Identifier la route/page qui sert ce JSON et la corriger
  - Fichiers : `app/[locale]/page.tsx` ou route homepage

- [ ] **BUG-02** Registration API accepte sans consent marketing (GDPR)
  - Backend doit rejeter si `consent_marketing !== true`
  - Fichier : `app/api/register/[slug]/route.ts`

- [ ] **BUG-03** Supabase `loyalty_settings` retourne HTTP 500
  - Vérifier la table/RLS/colonnes en DB
  - Ajouter un fallback gracieux côté frontend
  - Fichier : `app/[locale]/dashboard/page.tsx`

- [ ] **BUG-04** React hydration error #418 sur appointments
  - Identifier le mismatch server/client (probablement une date ou locale)
  - Fichier : `app/[locale]/dashboard/appointments/page.tsx`

- [ ] **BUG-08** Pas de sanitization sur first_name — XSS stocké
  - Rejeter ou nettoyer les caractères HTML dans le nom côté API
  - Le risque principal est dans les templates email (`lib/email.ts`)
  - Fichier : `app/api/register/[slug]/route.ts`, `lib/validation.ts`

---

## HIGH (UX cassée / fonctionnalités broken)

- [ ] **BUG-05** Restaurants query HTTP 406 — redirections cassées
  - La query Supabase échoue, `choose-plan` redirige vers `onboarding`
  - Vérifier le header `Accept` ou le schéma de la query
  - Fichiers : `app/[locale]/choose-plan/page.tsx`, `app/[locale]/onboarding/page.tsx`

- [ ] **BUG-07** Dashboard login — email enumeration
  - L'erreur Supabase brute révèle si un email existe ou non
  - Normaliser le message : "Si ce compte existe, un code vous a été envoyé."
  - Fichier : `app/[locale]/dashboard/login/page.tsx`

- [ ] **BUG-10** Locale NL redirige vers FR
  - `/nl/register/*` charge puis redirige vers `/fr/register/*`
  - Vérifier le middleware i18n ou la détection de locale
  - Fichier : `proxy.ts` ou `lib/i18n.ts`

- [ ] **BUG-12** Settings appointments — spinner infini sans message d'erreur
  - Ajouter un timeout + message "Impossible de charger les paramètres"
  - Fichier : `app/[locale]/dashboard/appointments/settings/page.tsx`

---

## LOW (polish / perf)

- [ ] **BUG-17** RSC prefetch excessifs (15-20+ requêtes par page)
  - Évaluer si tous les prefetch sont nécessaires
  - Config Next.js ou `<Link prefetch={false}>`

---

## RÉSUMÉ

| Catégorie | Total | Corrigés |
|-----------|-------|----------|
| Quick wins | 8 | 0 |
| Critical | 5 | 0 |
| High | 4 | 0 |
| Low | 1 | 0 |
| **Total** | **18** | **0** |
