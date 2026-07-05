# ROADMAP FIX — Audit Routes & Boutons (2026-03-17)

## Légende
- **[x]** = Corrigé
- **[ ]** = À faire

---

## P0 — CRITIQUE (Sécurité)

### [x] FIX-01: `/api/seed-demo` — Aucune authentification
- **Fichier**: `app/api/seed-demo/route.ts`
- **Problème**: GET et POST complètement publics. N'importe qui peut wipe et re-seed les données du premier restaurant.
- **Fix**: Ajouté `requireOwner()` sur les deux handlers.

### [x] FIX-02: `/api/scanner-info/[token]` — Pas de rate limiting
- **Fichier**: `app/api/scanner-info/[token]/route.ts`
- **Problème**: Endpoint public sans rate limit. Permet le brute-force de scanner tokens pour énumérer les restaurants.
- **Fix**: Ajouté `rateLimit()` (30 req/min par IP).

### [x] FIX-13: `sendCampaign()` — Route mismatch (404 en prod!)
- **Fichier**: `app/[locale]/dashboard/page.tsx` (ligne ~672)
- **Problème**: `fetch('/api/campaigns', ...)` mais le dossier réel est `/api/compaigns` (typo historique). **Les campagnes email retournent 404.**
- **Fix**: Corrigé le fetch vers `/api/compaigns`.

### [x] FIX-14: `/api/admin/seed-demo` DELETE — Supprime TOUS les restaurants demo
- **Fichier**: `app/api/admin/seed-demo/route.ts` (ligne ~400)
- **Problème**: DELETE filtre par `is_demo=true` sans vérifier `owner_id`. Un owner peut supprimer les demos d'un autre owner.
- **Fix**: Ajouté `.eq('owner_id', guard.userId)` au filtre DELETE.

---

## P1 — HAUTE (Fiabilité / UX)

### [x] FIX-03: `saveLoyaltySettings()` — Échec silencieux
- **Fichier**: `app/[locale]/dashboard/page.tsx` (ligne ~586)
- **Problème**: Si `upsert()` échoue, pas de toast d'erreur. L'utilisateur croit que les settings sont sauvées.
- **Fix**: Capturé l'erreur Supabase et affiché `toast.error()`.

### [x] FIX-04: Bannière wallet template — Dismiss non persisté
- **Fichier**: `app/[locale]/dashboard/page.tsx`
- **Problème**: `templateBannerDismissed` est un state local. La bannière réapparaît au reload.
- **Fix**: Persisté dans `localStorage` (lecture au init + écriture au dismiss).

### [x] FIX-05: Protection double-clic sur boutons critiques
- **Fichiers**: `app/[locale]/dashboard/page.tsx`
- **Problème**: Boutons "Add point", "Delete customer", "Export CSV" n'ont pas de guard contre les clics rapides.
- **Fix**: State `busyAction` centralisé — bloque les re-clics pendant l'exécution.

### [x] FIX-15: `/api/unsubscribe` — Log des tokens clients en clair
- **Fichier**: `app/api/unsubscribe/route.ts` (lignes 28-29, 44)
- **Problème**: `console.log` du token QR brut et du résultat de lookup client. Fuite de données dans les logs serveur.
- **Fix**: Supprimé tous les `console.log` sensibles.

### [x] FIX-16: `/api/verify-email` — Pas de rate limiting
- **Fichier**: `app/api/verify-email/route.ts`
- **Problème**: Endpoint public sans rate limit. Permet le brute-force de tokens de vérification email.
- **Fix**: Ajouté `rateLimit()` (15 req/min par IP).

### [x] FIX-17: Cron routes — Comparaison de secrets non timing-safe
- **Fichiers**: `app/api/cron/metrics/route.ts`, `app/api/cron/metrics-daily/route.ts`, `app/api/cron/wallet-sync/route.ts`
- **Problème**: Utilisent `===` pour comparer le CRON_SECRET (vulnérable aux attaques timing).
- **Fix**: Remplacé par `timingSafeEqual()` de `crypto` (même pattern que birthdays/cert-check).

---

## P2 — MOYENNE (Qualité)

### [x] FIX-06: Wallet push fire-and-forget dans `addPoint()`
- **Fichier**: `app/[locale]/dashboard/page.tsx` (ligne ~550)
- **Problème**: `fetch('/api/wallet/push-update', ...).catch(() => {})` — erreur silencieuse.
- **Fix**: `toast.error()` affiché si le push Apple Wallet échoue.

### [x] FIX-07: Impersonation plan switch — Pas de feedback
- **Fichier**: `app/[locale]/dashboard/page.tsx` (lignes ~811-821)
- **Problème**: Le dropdown plan en mode demo fait un PATCH silencieux puis reload sans confirmation.
- **Fix**: Toast success/error ajouté avant le reload.

### [x] FIX-08: `/api/admin/impersonate` — Pas de validation UUID
- **Fichier**: `app/api/admin/impersonate/route.ts`
- **Problème**: `restaurant_id` pas validé comme UUID. Pas de rate limiting.
- **Fix**: Validation UUID regex + rate limit 10 req/min par IP.

### [x] FIX-18: `res.ok` manquant sur fetch `/api/plans` et `/api/me`
- **Fichiers**: `components/PlanSelection.tsx`, `app/[locale]/choose-plan/page.tsx`, `app/[locale]/dashboard/wallet/page.tsx`
- **Problème**: `.then(res => res.json())` sans vérifier `res.ok` — parse du JSON d'erreur.
- **Fix**: Ajouté check `res.ok` avant `.json()` ; redirect ou throw si erreur.

---

## P3 — BASSE (Performance / Polish)

### [x] FIX-09: Pas de pagination sur endpoints list
- **Routes**: `/api/admin/restaurants`, `/api/team`, campaigns
- **Problème**: Retournent toutes les entrées sans limit/offset.
- **Fix**: Pagination page/limit sur admin/restaurants (défaut 50, max 100) et campaigns (défaut 100, max 200). Limit hard sur team (100 members, 50 invites).

### [x] FIX-10: Logs sensibles dans wallet
- **Fichier**: `app/api/wallet/[customerId]/route.ts` (ligne ~71)
- **Problème**: Log des réponses Google Wallet API (peut contenir des détails sensibles).
- **Fix**: Supprimé `body=${JSON.stringify(result.data)}` — ne log plus que le status HTTP et l'erreur.

### [x] FIX-11: Campaign body sans limite de longueur
- **Route**: `POST /api/compaigns`
- **Problème**: Pas de `.max()` sur le body text — un body de 1MB+ est accepté.
- **Fix**: Validation ajoutée : body max 5000, subject max 200, name max 100 caractères.

### [x] FIX-12: Referral reward max trop élevé
- **Route**: `PATCH /api/referral/settings`
- **Problème**: Max 10,000 points/referral — risque d'abus.
- **Fix**: Réduit à max 500 points/stamps par referral.

---

## Notes d'audit

### Éléments vérifiés et OK (2ème passe)
- **Locale redirects**: Toutes les pages utilisent `useLocaleRouter()` — aucun problème.
- **`/api/wallet/passes/[id]/pkpass`**: Public par design (UUID = bearer token), rate-limited, audit logged.
- **`/api/admin/restaurants`**: Protégé par `requireOwner()`, endpoint admin pour platform owner.
- **`/api/upload-logo`**: Auth + MIME allowlist server-side + size limit + path isolation.
- **`/api/wallet/debug`** et **`/api/wallet/passes/test-issue`**: Protégés par `requireOwner()`. Endpoints dev mais non dangereux.
- **`/api/me`**: Retourne des infos de contexte non sensibles. Pas de fuite critique.
- **`/api/plans`**: Public par design (liste les plans actifs/publics uniquement).
- **`/api/select-plan`**: Protégé par `requireOwner()` + validation plan.
- **`/api/cron/birthdays`** et **`/api/cron/cert-check`**: Déjà timing-safe.
- **`/api/cron/reminders`**: Déjà timing-safe.
- **`/api/growth/triggers`**: Protégé par `requireOwner()`.
- **`/api/wallet/passes/recover`**: Protégé + scoped par restaurant_id.
- **LocaleLink component**: Fonctionne correctement.
- **Scanner page**: Bien implémenté (idempotency keys, error handling, camera fallback).

### Routes totales auditées
- **85 route.ts** fichiers API
- **27 page.tsx** fichiers de pages
- **18/18 corrections** appliquées

---

## Tests manuels à effectuer

### PRIORITÉ 1 — Bug bloquant corrigé

- [ ] **Envoi campagne email** (FIX-13)
  - Aller dans Dashboard > Campagnes > Nouvelle campagne
  - Remplir nom, objet, corps, segment
  - Cliquer "Envoyer"
  - **Attendu** : campagne envoyée avec succès (toast vert)
  - **Avant** : 404 silencieux, rien ne se passait

### PRIORITÉ 2 — Sécurité

- [ ] **seed-demo sans auth** (FIX-01)
  - `curl https://votredomaine.com/api/seed-demo`
  - **Attendu** : 401 Unauthorized

- [ ] **admin/seed-demo DELETE isolation** (FIX-14)
  - Se connecter comme owner A, appeler DELETE `/api/admin/seed-demo`
  - **Attendu** : ne supprime que les restaurants demo de owner A

- [ ] **Rate limit scanner-info** (FIX-02)
  - Envoyer 35 requêtes rapides à `/api/scanner-info/fake-token`
  - **Attendu** : 429 après la 30ème requête

- [ ] **Rate limit verify-email** (FIX-16)
  - Envoyer 20 requêtes rapides à `/api/verify-email?token=fake`
  - **Attendu** : 429 après la 15ème requête

- [ ] **Rate limit impersonate** (FIX-08)
  - Envoyer 15 POST rapides à `/api/admin/impersonate`
  - **Attendu** : 429 après la 10ème requête

- [ ] **Impersonate UUID invalide** (FIX-08)
  - POST `/api/admin/impersonate` avec `{ "restaurant_id": "not-a-uuid" }`
  - **Attendu** : 400 "restaurant_id requis (UUID)"

- [ ] **Cron sans secret** (FIX-17)
  - `curl https://votredomaine.com/api/cron/metrics`
  - **Attendu** : 401 Unauthorized (inchangé, mais maintenant timing-safe)

### PRIORITÉ 3 — UX Dashboard

- [ ] **Save loyalty settings en erreur** (FIX-03)
  - Modifier les settings loyalty, couper le wifi, cliquer Sauvegarder
  - **Attendu** : toast rouge d'erreur

- [ ] **Bannière wallet persistée** (FIX-04)
  - Aller dans Overview, fermer la bannière "Créer un template wallet"
  - Recharger la page
  - **Attendu** : la bannière ne réapparaît pas

- [ ] **Double-clic +1 point** (FIX-05)
  - Onglet Clients, double-clic rapide sur "+1" d'un client
  - **Attendu** : un seul point ajouté (pas 2)

- [ ] **Double-clic suppression client** (FIX-05)
  - Confirmer la suppression, cliquer 2x très vite
  - **Attendu** : une seule requête DELETE

- [ ] **Double-clic Export CSV** (FIX-05)
  - Cliquer 2x rapidement sur le bouton Export
  - **Attendu** : un seul téléchargement

- [ ] **Wallet push erreur visible** (FIX-06)
  - Ajouter un point à un client avec pass wallet (quand APNS est down)
  - **Attendu** : toast rouge "La mise à jour du pass Wallet a échoué"

- [ ] **Plan switch demo feedback** (FIX-07)
  - En mode demo, changer le plan dans le dropdown
  - **Attendu** : toast "Plan mis à jour" puis reload

### PRIORITÉ 4 — Validation d'inputs

- [ ] **Campaign body trop long** (FIX-11)
  - Essayer d'envoyer une campagne avec un body > 5000 caractères
  - **Attendu** : erreur 400 "Le contenu de la campagne est trop long"

- [ ] **Referral reward > 500** (FIX-12)
  - Essayer de mettre rewardReferrer à 1000
  - **Attendu** : erreur de validation Zod

- [ ] **Plans fetch en erreur** (FIX-18)
  - Bloquer `/api/plans` dans le réseau (devtools)
  - Aller sur la page de sélection de plan
  - **Attendu** : ne crash pas, affiche juste le loading

### PRIORITÉ 5 — Pagination

- [ ] **Admin restaurants paginé** (FIX-09)
  - Appeler `/api/admin/restaurants?page=1&limit=10`
  - **Attendu** : réponse contient `total`, `page`, `limit` + max 10 restaurants

- [ ] **Campaigns paginé** (FIX-09)
  - Appeler `/api/compaigns?page=1&limit=5`
  - **Attendu** : réponse contient `total`, `page`, `limit` + max 5 campagnes
