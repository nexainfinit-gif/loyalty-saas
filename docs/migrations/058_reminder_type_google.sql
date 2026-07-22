-- ═══════════════════════════════════════════════════════════════════════════
-- 058 — Rappels : autorise le type 'google' dans appointment_reminders
--
-- La cascade de rappels gagne un niveau gratuit intermédiaire :
--   carte Apple (push APNS) → carte Google (AddMessage TEXT_AND_NOTIFY)
--   → WhatsApp (payant, quota/packs)
-- La dédup des notifications Google s'enregistre avec type='google', refusé
-- par la contrainte CHECK actuelle (email/sms/whatsapp/followup).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE appointment_reminders
  DROP CONSTRAINT IF EXISTS appointment_reminders_type_check;

ALTER TABLE appointment_reminders
  ADD CONSTRAINT appointment_reminders_type_check
  CHECK (type IN ('email', 'sms', 'whatsapp', 'followup', 'google'));
