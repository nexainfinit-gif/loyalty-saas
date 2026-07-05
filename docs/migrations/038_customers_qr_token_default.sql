-- 038: Défaut + backfill pour customers.qr_token
--
-- Contexte (découvert 2026-07-05 au test pré-lancement) : la colonne
-- customers.qr_token n'avait AUCUN défaut en base, et les deux routes
-- d'inscription ne le généraient pas → tout client inscrit via le flux public
-- avait qr_token = NULL, donc non scannable par son QR (le code retombait
-- sur customer.id en fallback, mais le QR de la page de succès était cassé).
--
-- Correctif applicatif : les routes register génèrent désormais le qr_token.
-- Correctif schéma (ce fichier) : défaut DB + backfill des NULL existants,
-- pour que même un insert direct (seed, import) obtienne un token.

ALTER TABLE customers ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();

UPDATE customers SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;
