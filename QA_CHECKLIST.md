# QA CHECKLIST — app.rebites.be
# Audit 2026-03-18 | 18 bugs trouvés
# Format: [ ] À faire | [~] En cours | [x] Corrigé & vérifié
#
# MISE À JOUR 2026-07-05 : 17/18 bugs corrigés dans le commit f097f84
# (2026-03-18) — vérifié dans le code actuel. Seul BUG-17 (Low) reste ouvert.

---

## QUICK WINS (< 10 min chacun)

- [x] **BUG-06** Clés i18n manquantes — appointments settings + analytics
  - Corrigé (f097f84) : `appointmentAnalytics.*` + `daySun..daySat` présents dans les 5 locales
  - Fichiers : `locales/*.json`

- [x] **BUG-11** `/wallet/icon.png` 404 sur toutes les pages
  - Corrigé (f097f84) : références pointent vers `/wallet/icon.svg`, présent dans `public/wallet/`
  - Fichiers : `public/wallet/icon.svg`, `app/layout.tsx`, `app/manifest.ts`

- [x] **BUG-14** Pas de `maxLength` sur l'input first_name (registration)
  - Corrigé (f097f84) : `maxLength={100}` sur l'input du formulaire live
  - Fichier : `app/[locale]/register/[slug]/page.tsx:263`
  - Note : `components/RegisterForm.tsx` est du code mort (importé nulle part) — suppression prévue

- [x] **BUG-13** Erreurs Zod brutes exposées à l'utilisateur
  - Corrigé (f097f84) : `humanizeZodMessage()` dans `lib/validation.ts`
  - Fichier : `app/api/register/[slug]/route.ts`

- [x] **BUG-09** Client portal pas traduit (tout en français quelle que soit la locale)
  - Corrigé (f097f84) : textes extraits vers les clés i18n, 5 locales
  - Fichier : `app/[locale]/client/[slug]/page.tsx`

- [x] **BUG-18** Pas d'attribut `name` sur les inputs email (login + client portal)
  - Corrigé (f097f84)
  - Fichiers : `app/[locale]/dashboard/login/page.tsx`, `app/[locale]/client/[slug]/page.tsx`

- [x] **BUG-16** Meta tag `apple-mobile-web-app-capable` deprecated
  - Corrigé (f097f84) : remplacé par `mobile-web-app-capable`
  - Fichier : `app/layout.tsx:33`

- [x] **BUG-15** Client portal — "Email envoyé !" même pour emails inexistants
  - Corrigé (f097f84) : message privacy-safe
  - Fichier : `app/[locale]/client/[slug]/page.tsx`

---

## CRITICAL (sécurité / compliance / data)

- [x] **BUG-01** Homepage expose raw JSON de toutes les restaurants
  - Corrigé (f097f84) : `app/[locale]/page.tsx` est désormais un simple redirecteur auth
  - Vérifié 2026-07-05 : aucune donnée restaurant rendue
  - Fichier : `app/[locale]/page.tsx`

- [x] **BUG-02** Registration API accepte sans consent marketing (GDPR)
  - Corrigé (f097f84) : `consent_marketing: z.literal(true)` dans `lib/validation.ts:27`
  - Note 2026-07-05 : bug frère découvert et corrigé dans `/api/register` (route legacy) qui
    écrivait `marketing_consent` (colonne inexistante en DB) hardcodé à `true`
  - Fichiers : `app/api/register/[slug]/route.ts`, `lib/validation.ts`, `app/api/register/route.ts`

- [x] **BUG-03** Supabase `loyalty_settings` retourne HTTP 500
  - Corrigé (f097f84) : gestion d'erreur gracieuse côté dashboard
  - Fichier : `app/[locale]/dashboard/page.tsx`

- [x] **BUG-04** React hydration error #418 sur appointments
  - Corrigé (f097f84)
  - Fichier : `app/[locale]/dashboard/appointments/page.tsx`

- [x] **BUG-08** Pas de sanitization sur first_name — XSS stocké
  - Corrigé (f097f84) : `stripHtml` transform dans les schémas Zod + `esc()` dans `lib/email.ts`
  - Fichiers : `lib/validation.ts:7`, `lib/email.ts`

---

## HIGH (UX cassée / fonctionnalités broken)

- [x] **BUG-05** Restaurants query HTTP 406 — redirections cassées
  - Corrigé (f097f84) : `.single()` → `.maybeSingle()`
  - Fichiers : `app/[locale]/choose-plan/page.tsx`, `app/[locale]/onboarding/page.tsx`

- [x] **BUG-07** Dashboard login — email enumeration
  - Corrigé (f097f84) : message normalisé
  - Fichier : `app/[locale]/dashboard/login/page.tsx`

- [x] **BUG-10** Locale NL redirige vers FR
  - Corrigé (f097f84) : `useLocaleRouter`
  - Fichiers : `proxy.ts`, `lib/i18n.tsx`

- [x] **BUG-12** Settings appointments — spinner infini sans message d'erreur
  - Corrigé (f097f84) : état d'erreur ajouté
  - Fichier : `app/[locale]/dashboard/appointments/settings/page.tsx`

---

## LOW (polish / perf)

- [ ] **BUG-17** RSC prefetch excessifs (15-20+ requêtes par page)
  - SEUL BUG RESTANT — non traité dans f097f84
  - Évaluer si tous les prefetch sont nécessaires
  - Config Next.js ou `<Link prefetch={false}>`

---

## RÉSUMÉ

| Catégorie | Total | Corrigés |
|-----------|-------|----------|
| Quick wins | 8 | 8 |
| Critical | 5 | 5 |
| High | 4 | 4 |
| Low | 1 | 0 |
| **Total** | **18** | **17** |
