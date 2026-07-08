# Reserve with Google — runbook (Phase C — C3)

Permet le bouton **« Réserver »** directement sur Google Search / Maps pour les
établissements éligibles (coiffure, beauté, spa…). Énorme canal d'acquisition.

> ⚠️ **Gated par Google.** Rien n'est actif tant que le partenariat Maps Booking
> n'est pas validé par Google (plusieurs semaines, comme Meta pour WhatsApp).
> Le code ci-dessous est INERTE tant que `RWG_AUTH_TOKEN` n'est pas défini.

## Ce qui est déjà implémenté (prêt)

**Feeds** (découverte — Google les ingère) :
- `GET /api/rwg/feeds?type=merchant` — feed marchands (établissements éligibles).
- `GET /api/rwg/feeds?type=service` — feed services (services actifs, prix/durée).
- Availability : servie en **temps réel** via le Booking Server (ci-dessous)
  plutôt qu'en feed batch (plus simple, toujours à jour). `buildAvailabilityEntry`
  existe si un feed batch devient nécessaire.

**Booking Server** (temps réel — Google appelle nos endpoints) :
- `POST /api/rwg/v3/check-availability` — créneaux libres (même logique que la
  page publique, `lib/slots.computeSlots`).
- `POST /api/rwg/v3/create-booking` — crée un RDV **confirmé** (anti-double-booking,
  email de confirmation, sync carte Wallet).
- `POST /api/rwg/v3/booking-status` — statut d'une réservation.
- `POST /api/rwg/v3/update-booking` — annulation (report = annuler + recréer).

**Sécurité** : toutes les requêtes entrantes vérifient le jeton partagé
`RWG_AUTH_TOKEN` (Bearer ou Basic, timing-safe — `lib/reserve-with-google.ts`).

## Variables d'environnement (Vercel)

```
RWG_AUTH_TOKEN=<jeton-partagé-fort-généré-aléatoirement>
```

Génère-le une fois (`openssl rand -hex 32`) et communique-le à Google lors de la
configuration du Booking Server.

## Ce que TU dois faire côté Google (onboarding partenaire)

1. **Google Business Profile** vérifié pour chaque établissement (adresse, tel).
2. Demander l'accès **Reserve with Google / Maps Booking** (partner onboarding) :
   https://developers.google.com/actions-center/verticals/appointments/overview
3. Dans la console partenaire :
   - Déclarer l'URL des feeds : `https://app.rebites.be/api/rwg/feeds`
   - Déclarer le Booking Server : `https://app.rebites.be/api/rwg/v3/*`
   - Renseigner le jeton `RWG_AUTH_TOKEN` (Basic/Bearer).
4. Passer la **sandbox** de Google (jeu de tests d'inventaire + réservation) puis
   la **certification** avant la mise en production.

## Limites connues / à étendre plus tard

- Le flux **acompte** (Stripe Connect) n'est pas branché sur les réservations
  RwG (elles sont confirmées directement). À ajouter si Google le requiert pour
  ces établissements (payment integration Maps Booking).
- Le mapping **service ↔ employé** suppose que Google renvoie le `staff_id` dans
  les ressources ; sinon, prévoir une sélection automatique du premier employé
  disponible.
- Feed availability batch non publié (temps réel préféré) — `buildAvailabilityEntry`
  est prêt si besoin.
