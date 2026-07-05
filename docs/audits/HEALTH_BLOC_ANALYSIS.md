# Analyse UX/Produit — Bloc "Programme en bonne santé"

> Dashboard Overview · Composant `OverviewTab.tsx` · Section "Health Hero"

---

## 1. Fonction globale du bloc

Ce bloc est le **"Health Hero"** — le premier indicateur visuel en haut du dashboard Overview. Il donne en un coup d'oeil l'état de santé du programme de fidélité.

**Objectif business** : permettre au restaurateur non-technique de savoir immédiatement si son programme fonctionne bien ou s'il doit agir, sans lire de graphiques ni comprendre des KPIs complexes.

---

## 2. Contenu du bloc — 3 couches d'information

Le bloc est composé de **3 éléments distincts** :

### A. Le statut de santé (coin gauche, avec pastille colorée)

| Statut | Label FR | Couleur | Condition |
|--------|----------|---------|-----------|
| `healthy` | "Programme en bonne santé" | Vert (`success`) | 0 trigger risk `high`, 0 trigger risk `medium` |
| `watch` | "A surveiller" | Orange (`warning`) | 0 trigger `high`, mais >= 1 trigger risk `medium` |
| `attention` | "Attention requise" | Rouge (`danger`) | >= 1 trigger risk `high` |

### B. La phrase résumé (sous le statut)

Phrase composée dynamiquement de 1 à 3 segments séparés par ` · ` :

| Segment | Exemple | Condition |
|---------|---------|-----------|
| Clients actifs + tendance | "12 client(s) actif(s) (+8%)" | Toujours affiché si actifs > 0 |
| Aucun actif | "Aucun client actif cette période" | 0 actifs sur la période |
| Proches récompense | "3 proche(s) d'une récompense" | >= 1 client à >= 80% du seuil |
| Anniversaires | "2 anniversaire(s) cette semaine" | >= 1 anniversaire dans les 7 jours |

### C. Les micro-insights (max 2, sous la phrase)

| Insight | Texte FR | Icone | Condition exacte |
|---------|----------|-------|------------------|
| Proches récompense | "{count} client(s) proche(s) d'une récompense — un rappel peut booster les visites." | Cadeau | `nearReward > 0` (clients à >= 80% du seuil points ou stamps) |
| Anniversaires | "{count} anniversaire(s) cette semaine — une campagne pourrait booster le trafic." | Gateau | `birthdaysSoon > 0` (anniversaire dans les 7 prochains jours) |
| Baisse d'activité | "L'activité a baissé de {percent}% par rapport à la période précédente." | Warning | `trendActive < -15%` |
| Aucun nouveau client | "Aucun nouveau client cette période" | User+ | `newCustomers === 0` et `totalCustomers > 0` |
| Croissance positive | "Croissance de +{percent}% de nouveaux clients — belle dynamique !" | TrendUp | `trendNew > +20%` |

**Priorité** : dans cet ordre exact. Si `nearReward` et `birthdaysSoon` sont tous deux > 0, les 2 slots sont pris et les autres insights ne s'affichent pas.

---

## 3. Conditions d'affichage détaillées

### Statut de santé — piloté par les Growth Triggers

Le statut **ne dépend PAS du Program Score**. Il dépend uniquement des triggers de type `risk` issus de `lib/growth-triggers.ts` :

| Trigger risk HIGH | Condition de déclenchement |
|---|---|
| `churn_risk_high` | KPI `retention_rate_90d` en statut `critical` |
| `inactive_majority` | KPI `churn_rate_30d` > 50% |
| `engagement_drop` | KPI `scans_per_customer` en statut `critical` |

| Trigger risk MEDIUM | Condition |
|---|---|
| `churn_risk_medium` | KPI `retention_rate_90d` en statut `warning` |
| `growth_stalled` | 0 nouveau client en 30j et totalCustomers > 0 |

**Donc** : le bloc est vert "Programme en bonne santé" quand **aucun de ces 5 triggers ne se déclenche**.

### Seuil "proches d'une récompense"

```
nearThreshold = 80% du seuil
```

- Mode **stamps** : clients avec `stamps_count >= stamps_total * 0.8` et `< stamps_total`
- Mode **points** : clients avec `total_points >= reward_threshold * 0.8` et `< reward_threshold`

### Seuil "anniversaires cette semaine"

Clients dont la date de naissance (mois+jour) tombe dans les **7 prochains jours** (wrap autour du 31 déc).

---

## 4. Logique interne — 2 systèmes parallèles

Le bloc utilise en réalité **deux moteurs indépendants** :

### Moteur 1 : Health Status (la pastille + le label)

```
growthTriggers.filter(risk + high).length > 0  →  "Attention requise" (rouge)
growthTriggers.filter(risk + medium).length > 0  →  "A surveiller" (orange)
sinon  →  "Programme en bonne santé" (vert)
```

Alimenté par l'API `/api/growth-triggers` qui exécute 15 règles pure-function sur les KPIs calculés côté serveur.

### Moteur 2 : Program Score (le ring circulaire à droite)

Score 0–100 calculé côté client à partir de 4 axes :

| Axe | Poids | Calcul |
|-----|-------|--------|
| **Activité** | 30 pts | `(actifs_30j / total_clients) * 100 * 0.3` |
| **Retour** | 30 pts | `returnRate * 0.3` (% clients avec 2+ visites) |
| **Récompenses** | 20 pts | `(rewards_redeemed / total_clients) * 10`, plafonné à 20 |
| **Croissance** | 20 pts | `((trendNew + 50) / 100) * 20` |

| Score | Label | Couleur du ring |
|-------|-------|-----------------|
| 75–100 | "Excellent" | Vert |
| 55–74 | "Bon" | Bleu |
| 35–54 | "A améliorer" | Orange |
| 0–34 | "Faible" | Rouge |

**Point important** : le ring de score et le statut de santé sont **découplés**. Tu peux avoir un score "Bon" (ring bleu) mais un statut "Attention requise" (fond rouge) si des triggers risk high existent.

---

## 5. Interprétation stratégique

| Ce que tu vois | Ce que ça veut dire | Action |
|---|---|---|
| Vert + score 75+ | Le programme tourne bien. Bonne rétention, croissance positive. | Maintenir. Lancer des campagnes pour capitaliser. |
| Vert + score 35-55 | Pas de risque immédiat mais le programme sous-performe. | Vérifier le seuil de récompense, relancer les inactifs. |
| Orange "A surveiller" | Rétention en baisse OU 0 inscription ce mois. | Lancer une campagne de réactivation, vérifier le lien d'inscription. |
| Rouge "Attention requise" | Rétention critique, majorité inactifs, ou engagement effondré. | Action urgente : campagne, ajuster le programme, contacter les clients. |
| Insight "X proches récompense" | Clients très engagés, presque au bout. | Envoyer un SMS/email de rappel pour les faire revenir terminer la carte. |
| Insight "X anniversaires" | Opportunité de fidélisation personnalisée. | Lancer la campagne anniversaire (template "Voeux anniversaire" dans Campagnes). |
| Insight "Activité -X%" | La fréquentation baisse. | Analyser : saisonnier ? Offre moins attractive ? Lancer une promo. |

---

## 6. Améliorations UX possibles

### 6.1 Incohérence Score vs Statut

Le ring score et le statut health sont visuellement côte à côte mais pilotés par des logiques **totalement différentes**. Un restaurateur non-technique pourrait voir un score "Excellent" et un fond rouge "Attention requise" — c'est confusant.

**Suggestion** : unifier les deux signaux, ou clarifier visuellement qu'il y a un score long-terme et un statut court-terme.

### 6.2 Micro-insights non cliquables

Les insights ("3 proches d'une récompense") ne sont pas cliquables. Le restaurateur ne peut pas voir **qui** sont ces clients.

**Suggestion** : rendre chaque insight cliquable → filtre la vue Clients sur le segment concerné.

### 6.3 Pas de CTA dans le bloc

Le bloc est informatif mais passif. Aucun bouton d'action direct.

**Suggestion** : ajouter un CTA contextuel selon le statut :
- Vert : "Lancer une campagne"
- Orange : "Voir les clients inactifs"
- Rouge : "Agir maintenant" → ouvre les actions prioritaires

### 6.4 Seuil 80% fixe pour "proches récompense"

Le seuil de 80% est hardcodé. Pour un programme à 10 tampons, ça veut dire 8+. Pour un programme à 100 points seuil, ça veut dire 80+. C'est raisonnable mais pas configurable.

### 6.5 Skeleton loader manquant

Le bloc est masqué pendant le chargement des triggers (`{!triggersLoading && (...)}`). Le bloc disparaît complètement pendant le fetch. Un skeleton loader serait préférable pour éviter un layout shift.

---

*Document généré le 19 mars 2026 — basé sur l'analyse du code source (`components/OverviewTab.tsx`, `lib/growth-triggers.ts`, `locales/*.json`)*
