-- 051 — Statuts REMBOURSÉ / TRANSFÉRÉ sur les billets d'événement.
-- Le rendu Apple Wallet de ces états est déjà en production
-- (eventTicketPresentation → badge + voided + STATUT) ; cette migration
-- ouvre les valeurs côté base. À appliquer dans Supabase SQL Editor.

-- 1. Étendre la contrainte de statut (nom auto-généré par la CHECK inline de 046)
ALTER TABLE event_tickets DROP CONSTRAINT IF EXISTS event_tickets_status_check;
ALTER TABLE event_tickets ADD CONSTRAINT event_tickets_status_check
  CHECK (status IN ('pending_payment', 'valid', 'checked_in', 'cancelled', 'refunded', 'transferred'));

-- 2. Traçabilité : quand, et vers quel billet en cas de transfert.
--    (le transfert émet un NOUVEAU billet — nouveau code, nouveau QR — et
--    void l'ancien ; le lien permet le support et l'anti-fraude)
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS refunded_at    TIMESTAMPTZ;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS transferred_to_ticket_id UUID REFERENCES event_tickets(id);

COMMENT ON COLUMN event_tickets.transferred_to_ticket_id IS
  'Billet émis en remplacement lors d''un transfert — l''ancien passe en status=transferred (void).';
