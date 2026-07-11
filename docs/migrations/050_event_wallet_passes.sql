-- 050_event_wallet_passes.sql
-- Allow wallet_passes to track event ticket Apple Wallet passes.
-- Event tickets have no loyalty customer — customer_id becomes nullable
-- and event_ticket_id provides the alternative FK.

ALTER TABLE wallet_passes
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE wallet_passes
  ADD COLUMN event_ticket_id UUID REFERENCES event_tickets(id);

-- One active Apple pass per event ticket (parallel to the existing
-- idx_wallet_passes_one_active_per_kind on customer_id).
CREATE UNIQUE INDEX idx_wallet_passes_one_per_event_ticket
  ON wallet_passes (event_ticket_id)
  WHERE status = 'active' AND event_ticket_id IS NOT NULL;
