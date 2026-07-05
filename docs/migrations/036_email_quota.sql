-- 036: Quota d'emails par mois et par plan
--
-- Le modèle de rentabilité (2026-07-05, cible marge brute 66 %) a montré que
-- le vrai driver de coût n'est pas le NOMBRE de campagnes mais le VOLUME
-- d'emails envoyés (campagnes × destinataires). Ce quota borne directement
-- le coût variable Resend par restaurant.
--
-- Volumes (coût email 0,40 €/1000, marge pire cas ≥ 66 %) :
--   starter (24,99 €) :  5 000 emails/mois  (~87 % pire cas)
--   growth  (39,99 €) : 25 000 emails/mois  (~71 %)
--   pro     (69,00 €) : 50 000 emails/mois  (~68 %)
--
-- NULL = illimité. Le comptage applicatif = SUM(campaigns.recipients_count)
-- du mois calendaire courant (UTC).

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_emails_per_month integer;

UPDATE plans SET max_emails_per_month = 5000  WHERE key = 'starter';
UPDATE plans SET max_emails_per_month = 25000 WHERE key = 'growth';
UPDATE plans SET max_emails_per_month = 50000 WHERE key = 'pro';
