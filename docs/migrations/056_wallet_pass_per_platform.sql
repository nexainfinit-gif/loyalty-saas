-- 056 — Autoriser un pass Apple ET un pass Google par client.
--
-- La contrainte 031 imposait « 1 pass actif par (restaurant, client, type) »
-- SANS distinguer la plateforme. Or l'inscription émet Apple + Google en
-- parallèle (même client, même type) → le 2ᵉ insert violait la contrainte
-- (23505) et un des deux passes n'était jamais créé (bouton Apple manquant).
--
-- On ajoute `platform` à l'index : un pass actif max par plateforme.

DROP INDEX IF EXISTS idx_wallet_passes_one_active_per_kind;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_passes_one_active_per_kind_platform
  ON wallet_passes (restaurant_id, customer_id, pass_kind, platform)
  WHERE status = 'active';
