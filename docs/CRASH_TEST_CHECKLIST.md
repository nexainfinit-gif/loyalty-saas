# Crash-Test Checklist — Rebites (avant 1er client)

> Généré 2026-07-05. Objectif : vérifier **manuellement** chaque flux et chaque fonctionnalité
> de bout en bout, en conditions réelles, avant d'onboarder muros.
>
> **Légende priorité :** 🔴 chemin critique (bloque le lancement) · 🟡 important · ⚪ confort
> **[AUTO]** = déjà couvert par les tests automatisés du 2026-07-05 (re-vérifier quand même via l'UF réelle si marqué 🔴).
> **Environnements :** teste sur **prod** (`app.rebites.be`) après redéploiement Vercel, et sur **mobile réel** (iPhone + Android) pour tout ce qui touche au Wallet/QR/responsive.

## Pré-requis avant de commencer
- [ ] 🔴 Vérifier que Vercel a **redéployé le dernier commit** (`dbced93` ou plus récent) — sinon les fixes qr_token/campagnes/auth-callback ne sont pas en prod
- [ ] 🔴 Confirmer que **toutes les migrations sont appliquées** (28/28 au 2026-07-05)
- [ ] Avoir 1 iPhone physique + 1 Android physique
- [ ] Avoir une carte bancaire de test Stripe (mode test) OU une vraie CB (mode live) pour le flux billing
- [ ] Créer une adresse email jetable pour jouer le rôle du client

---

## 1. Authentification & Onboarding commerçant 🔴

- [ ] 🔴 Aller sur `app.rebites.be` sans session → doit rediriger vers login (pas de page blanche, pas de spinner infini) **[AUTO]**
- [ ] 🔴 Login : saisir un email → recevoir le **code/lien magique par email** (vérifier réception réelle, pas juste "envoyé")
- [ ] 🔴 Cliquer le lien magique → arriver connecté au dashboard
- [ ] 🔴 Lien magique **expiré ou malformé** → message d'erreur propre, pas de 500 (auth/callback) **[AUTO]**
- [ ] 🟡 Login avec email **inexistant** → message neutre ("si ce compte existe…"), pas de fuite d'énumération
- [ ] 🔴 Nouveau compte : onboarding → créer le restaurant (nom, slug, type d'activité)
- [ ] 🔴 Choix du plan → arriver sur choose-plan → sélectionner un plan
- [ ] 🟡 Se déconnecter puis se reconnecter → retomber sur le bon restaurant
- [ ] 🟡 Owner avec **plusieurs restaurants** → pas de boucle dashboard↔onboarding (bug historique corrigé)
- [ ] 🔴 Accès direct à `/fr/dashboard` sans session → redirigé login (gate serveur) **[AUTO]**
- [ ] 🔴 Accès direct à `/fr/admin` sans être owner plateforme → refusé **[AUTO]**

## 2. Configuration du programme de fidélité 🔴

- [ ] 🔴 Onglet Loyalty : basculer **points ↔ stamps** → confirmation demandée, bascule effective
- [ ] 🔴 Régler `points_per_scan`, `reward_threshold` (points) — sauvegarde persiste après refresh
- [ ] 🔴 Régler `stamps_total` (stamps) — sauvegarde persiste
- [ ] 🟡 Anti-fraude : régler `max_scans_per_day` et `min_scan_delay_minutes`
- [ ] 🟡 Welcome bonus (Pro) : définir des points de bienvenue
- [ ] 🟡 Message de récompense personnalisé
- [ ] ⚪ Notifications auto (reward atteint / proche récompense) : activer/désactiver

## 3. Scan / caisse — LE cœur du produit 🔴

- [ ] 🔴 Depuis le dashboard scanner : scanner le QR d'un client → points/stamps s'incrémentent **[AUTO]**
- [ ] 🔴 Scanner via l'URL complète (QR contenant `https://app.rebites.be/api/scan/...`) → fonctionne **[AUTO]**
- [ ] 🔴 Mode stamps : compléter une carte (atteindre `stamps_total`) → carte marquée complétée, reward_pending **[AUTO]**
- [ ] 🔴 Scan suivant sur carte complète → **récompense récoltée**, stamps remis à 0, completed_cards +1 **[AUTO]**
- [ ] 🔴 Mode points : franchir le seuil → `reward_triggered` **[AUTO]**
- [ ] 🔴 **Double-scan rapide** (2 tapes) avec la même idempotency_key → **pas de double comptage** **[AUTO]**
- [ ] 🟡 Anti-fraude : dépasser `max_scans_per_day` → scan refusé (429) **[AUTO]**
- [ ] 🟡 Anti-fraude : re-scanner avant `min_scan_delay` → refusé (429) **[AUTO]**
- [ ] 🔴 Scanner un QR **inconnu / d'un autre restaurant** → "client introuvable", aucun point donné (isolation) **[AUTO]**
- [ ] 🟡 Scan avec une **scan-action** personnalisée (valeur de points custom) → bonne valeur appliquée **[AUTO]**
- [ ] 🟡 Point multiplier actif (jour/heure) → points multipliés
- [ ] 🔴 Scanner staff via **page scanner publique** (`/scan/[scannerToken]`) sans session owner → fonctionne
- [ ] 🔴 Après un scan, le **pass Wallet du client se met à jour** (voir §5)

## 4. Gestion des clients 🔴

- [ ] 🔴 Inscription publique : `app.rebites.be/fr/register/<slug>` → formulaire s'affiche **[AUTO]**
- [ ] 🔴 S'inscrire (prénom, email, consentement) → succès + **QR code affiché** (vérifier que le QR n'est pas cassé — bug qr_token corrigé) **[AUTO]**
- [ ] 🔴 Recevoir l'**email de bienvenue + vérification** (réception réelle)
- [ ] 🔴 Cliquer le lien de vérification email → compte vérifié
- [ ] 🔴 RGPD : **décocher** le consentement marketing → l'inscription doit le respecter (consent_marketing=false) **[AUTO]**
- [ ] 🟡 S'inscrire 2× avec le même email → 409 "déjà inscrit"
- [ ] 🟡 Email invalide / prénom vide → erreur lisible en français (pas d'erreur Zod brute) **[AUTO]**
- [ ] 🟡 CAPTCHA Turnstile (si activé) → bloque les bots
- [ ] 🔴 Dashboard : liste des clients, recherche, pagination (50/page)
- [ ] 🔴 Ouvrir la fiche d'un client (modal détail) → historique correct
- [ ] 🔴 **Ajouter des points manuellement** → instantané ; **retirer des points** → confirmation demandée
- [ ] 🔴 **Export CSV** → fichier téléchargé, colonnes correctes (Prénom;Nom;Email;Points;Tampons;Visites) **[AUTO]**
- [ ] 🔴 RGPD : **supprimer un client** → cascade (passes révoqués, transactions supprimées), confirmation demandée **[AUTO]**
- [ ] 🟡 Limite de plan : dépasser `max_customers` du plan → inscription refusée (403 upgrade) **[AUTO]**

## 5. Wallet — Apple & Google (test sur téléphone réel) 🔴

- [ ] 🔴 Wallet Studio : créer un **template** (couleur, type stamps/points, logo)
- [ ] 🔴 Définir un template **par défaut** (is_default) → auto-émission à l'inscription
- [ ] 🔴 **Apple Wallet** : sur iPhone, "Ajouter à Apple Wallet" depuis la page succès inscription → le pass s'installe
- [ ] 🔴 Après un scan, le pass Apple **se met à jour** (points/stamps corrects) — peut prendre quelques secondes (APNS)
- [ ] 🔴 Re-télécharger le pass → toujours données fraîches
- [ ] 🟡 **Google Wallet** : sur Android, ajouter le pass → s'installe (ou bouton "bientôt" si désactivé)
- [ ] 🟡 Éditer un template existant → passes existants reflètent (ou nouveau template)
- [ ] 🟡 **Révoquer** un pass → disparaît du Wallet ; **ré-émettre** → nouveau pass
- [ ] 🟡 Archiver un template → bloqué s'il a des passes actifs
- [ ] 🟡 Limite de plan : dépasser `max_templates` → refusé (403) **[AUTO]**
- [ ] ⚪ Pass "1 seul actif par type" : émettre 2 passes stamps au même client → l'ancien remplacé (contrainte unique 031)
- [ ] 🟡 Email de bienvenue contient bien le lien "Ajouter à Apple Wallet"

## 6. Campagnes email 🔴

- [ ] 🔴 Créer une campagne (segment "tous") → **création OK** (bug segment_type/type corrigé) **[AUTO]**
- [ ] 🔴 Envoyer réellement → les clients **reçoivent l'email** (variables {{prenom}}, {{points}} remplacées)
- [ ] 🔴 L'email contient un **lien de désinscription** fonctionnel → clic → consent_marketing=false, page propre
- [ ] 🟡 Segments : inactifs 45j, anniversaires, proche récompense, VIP, actifs → bon comptage de destinataires
- [ ] 🟡 Campagne **planifiée** (scheduled_at futur) → créée sans envoi immédiat **[AUTO]**
- [ ] 🔴 **Quota emails du plan** : dépasser (ex. starter 5000/mois) → campagne refusée avec message clair **[AUTO]**
- [ ] 🟡 Limite campagnes/mois du plan → refusée au-delà **[AUTO]**
- [ ] 🟡 Historique des campagnes : statut, destinataires, date affichés
- [ ] 🟡 Client **désinscrit** n'est pas ciblé par une nouvelle campagne
- [ ] ⚪ Campagne **wallet-push** (notification sur le pass) → reçue sur le téléphone

## 7. Réservations / Rendez-vous (salons) 🔴

*Applicable aux types coiffure/beauté. Tester sur demo-coiffure (seedé) ou muros si éligible.*

- [ ] 🔴 Owner : créer des **services** (nom, durée, prix)
- [ ] 🔴 Owner : créer des **membres d'équipe** + affecter les services
- [ ] 🔴 Owner : définir les **disponibilités** (jours/heures) + horaires d'ouverture
- [ ] 🔴 Public : `app.rebites.be/fr/book/<slug>` → page affiche services + staff (PAS vide) **[AUTO]**
- [ ] 🔴 Choisir service + staff + date → **créneaux disponibles** affichés **[AUTO]**
- [ ] 🔴 Réserver un créneau → confirmation + **email de confirmation** reçu **[AUTO]**
- [ ] 🔴 Le créneau réservé devient **indisponible** (available:false) **[AUTO]**
- [ ] 🔴 **Double-booking** : réserver le même créneau → refusé (409) **[AUTO]**
- [ ] 🔴 **Annuler** via le lien de l'email (token) → RDV annulé, créneau re-libéré **[AUTO]**
- [ ] 🟡 **Reporter** (reschedule) via le lien → nouveau créneau
- [ ] 🟡 Owner : vue calendrier, marquer un RDV **completed / no_show**
- [ ] 🟡 No-show : client bloqué après N no-shows (seuil configurable)
- [ ] 🟡 Liste d'attente (waiting_list) si complet
- [ ] ⚪ RDV récurrents ; sync Google Calendar
- [ ] 🟡 Owner : analytics rendez-vous (taux no-show, etc.)

## 8. Referrals / VIP / Multiplicateurs 🟡

- [ ] 🟡 Chaque client reçoit un **code de parrainage** à l'inscription **[AUTO]**
- [ ] 🟡 S'inscrire avec un **code de parrain** → bonus attribué aux deux (si feature activée sur le plan)
- [ ] 🟡 Feature parrainage **désactivée** sur le plan → pas de bonus (plan_blocked)
- [ ] 🟡 VIP tiers : un client franchit le seuil VIP → statut VIP
- [ ] ⚪ Carte de partage referral (ReferralShareCard) sur la page succès
- [ ] ⚪ Catalogue de récompenses (reward-catalog)

## 9. Billing / Stripe / Plans 🔴

- [ ] 🔴 Page billing : voir le plan actuel + statut d'abonnement
- [ ] 🔴 **Checkout Stripe** : passer au plan supérieur → paiement → retour → plan mis à jour
- [ ] 🔴 Le **webhook Stripe** met bien à jour `subscription_status` et `plan` (vérifier après paiement)
- [ ] 🟡 **Customer portal** Stripe : gérer/annuler l'abonnement
- [ ] 🟡 Après annulation → retour au plan de repli, fonctionnalités re-verrouillées
- [ ] 🔴 **Fonctionnalités gated** : sur un plan bas, les features Pro affichent le gate d'upgrade (pas d'accès)
- [ ] 🟡 Échec de paiement (`payment_failed`) → géré (email/statut)
- [ ] ⚪ Admin : éditer les **limites d'un plan** (templates/campagnes/clients/emails) → appliqué **[AUTO]**

## 10. Équipe (multi-utilisateurs) 🟡

- [ ] 🟡 Inviter un membre par email → email d'invitation reçu
- [ ] 🟡 Accepter l'invitation (bon email requis) → membre ajouté
- [ ] 🟡 Rôles : staff / restaurant_admin — pas de moyen de s'auto-inviter en owner
- [ ] 🟡 Révoquer un membre → accès retiré

## 11. Portail client self-service 🟡

- [ ] 🟡 `app.rebites.be/fr/client/<slug>` : login par email (magic link)
- [ ] 🟡 "Email envoyé" affiché même si l'email n'existe pas (pas d'énumération)
- [ ] 🟡 Consulter ses points / stamps / historique
- [ ] 🟡 Voir/gérer ses rendez-vous
- [ ] 🟡 Portail traduit selon la locale (pas tout en français)

## 12. Panel super-admin (plateforme) 🟡

- [ ] 🟡 Liste des restaurants + KPIs plateforme
- [ ] 🟡 Détail d'un restaurant
- [ ] 🟡 **Impersonation** d'un restaurant → voir son dashboard, puis quitter
- [ ] 🟡 Gestion des plans / features (plan_features toggles)
- [ ] 🟡 Catalogue KPI
- [ ] 🟡 Growth : triggers & actions
- [ ] ⚪ Wallet preview / templates admin

## 13. i18n / Locales 🟡

- [ ] 🟡 Changer de langue (fr/en/nl/it/es) → contenu traduit
- [ ] 🟡 `/nl/...` reste en NL (ne redirige pas vers FR — bug historique corrigé)
- [ ] 🟡 Navigateur en EN → redirigé vers `/en`
- [ ] ⚪ Pas de clés i18n manquantes visibles (ex. `appointmentAnalytics.xxx`)

## 14. Site marketing rebites.be ⚪

- [ ] ⚪ `rebites.be` en HTTPS (certificat OK)
- [ ] ⚪ Formulaire waitlist → email bien enregistré (table waitlist_leads) + notif admin
- [ ] ⚪ Balises OG : partage sur WhatsApp/LinkedIn affiche un bel aperçu
- [ ] ⚪ Landing (accès secret) : pricing cohérent avec les plans Stripe réels
- [ ] ⚪ **Au lancement** : retirer le noindex de landing.html + basculer landing en page d'accueil

## 15. Crash-test / cas limites (le "casser exprès") 🔴

- [ ] 🔴 Soumettre chaque formulaire **vide** → messages d'erreur lisibles, aucun 500
- [ ] 🔴 Champs avec **HTML/script** (`<script>alert(1)</script>` dans prénom/nom restaurant) → échappé, pas d'XSS (dashboard + emails)
- [ ] 🟡 Très longues valeurs (prénom 500 caractères) → tronqué/refusé, pas de crash
- [ ] 🟡 Emoji / accents / caractères spéciaux dans les noms → OK
- [ ] 🔴 Couper le réseau pendant un scan / une soumission → message d'erreur, pas d'état corrompu
- [ ] 🟡 Rafraîchir en plein milieu d'un flux (checkout, booking) → pas de double-création
- [ ] 🟡 Reculer/avancer dans le navigateur pendant les flux
- [ ] 🔴 URLs directes vers des ressources d'un **autre restaurant** (customerId, passId, appointmentId d'autrui) → refusé (isolation) **[AUTO partiel]**
- [ ] 🟡 Cron : appeler `/api/cron/*` **sans** le CRON_SECRET → 401 **[AUTO]**
- [ ] 🟡 Webhook Stripe sans signature → 400 **[AUTO]**
- [ ] 🟡 Rate limiting : marteler `/api/register` ou `/api/scan` → 429 après le seuil **[AUTO]**
- [ ] ⚪ Tester avec un ad-blocker actif / cookies bloqués

## 16. Responsive / Mobile 🟡

- [ ] 🟡 Dashboard sur mobile : nav bottom, header, tous les onglets accessibles
- [ ] 🟡 Page d'inscription sur mobile (c'est là que 90% des clients s'inscriront)
- [ ] 🟡 Page de booking sur mobile
- [ ] 🟡 Scanner sur mobile (caméra) — c'est l'usage réel en caisse
- [ ] 🟡 PWA : ajouter au home screen, ouvrir en standalone

## 17. Observabilité (après quelques tests) ⚪

- [ ] ⚪ Sentry (si DSN configuré) : les erreurs remontent bien
- [ ] ⚪ Logs Vercel : pas d'erreurs 500 inattendues pendant les tests
- [ ] ⚪ Vérifier qu'aucun secret / PII ne fuit dans les logs

---

## Méthode conseillée
1. Fais d'abord un **parcours "client heureux" complet** (inscription → wallet → scan → récompense → campagne) en 🔴 uniquement.
2. Puis un **parcours "commerçant"** complet (onboarding → config → billing → équipe).
3. Puis le **§15 crash-test** en essayant vraiment de tout casser.
4. Note chaque anomalie avec : URL, ce que tu as fait, ce qui s'est passé, capture d'écran.

Ce qui est **[AUTO]** a été vérifié par le harnais automatisé le 2026-07-05 sur données démo, mais
re-vérifier les 🔴 dans l'app réelle après le déploiement Vercel (le harnais testait le code local).
