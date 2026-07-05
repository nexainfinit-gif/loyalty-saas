-- 037: Répare la table campaigns (dérive de schéma + contrainte obsolète)
--
-- Découvert le 2026-07-05 au test pré-lancement : la création de campagne
-- depuis le dashboard était CASSÉE DE BOUT EN BOUT pour deux raisons :
--
-- 1. Colonnes legacy `segment_type` (NOT NULL) et `content` dupliquant
--    `segment`/`body`. Le refactor de la route a cessé de les remplir →
--    violation NOT NULL. (Correctif applicatif : la route les remplit à
--    nouveau ; ce fichier retire la contrainte pour ne plus dépendre d'elles.)
--
-- 2. Contrainte `campaigns_type_check` n'autorisant que 'email'/'wallet_push',
--    alors que l'UI envoie des types sémantiques (custom, birthday, promo,
--    reengagement, near_reward, double_points). Toute campagne du dashboard
--    violait ce CHECK. Le `type` est une catégorie libre pilotée par l'appli,
--    pas un enum figé → on supprime la contrainte.

-- 1. Les colonnes legacy ne bloquent plus
ALTER TABLE campaigns ALTER COLUMN segment_type DROP NOT NULL;
ALTER TABLE campaigns ALTER COLUMN content DROP NOT NULL;

-- 2. Supprimer la contrainte CHECK obsolète sur le type
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;
