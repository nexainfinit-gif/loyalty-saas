-- 015_audit_log.sql
-- Audit log for sensitive operations (customer deletion, pass revoke, campaign send, etc.)

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  actor_id uuid,  -- the user who performed the action (auth.uid)
  action text NOT NULL,  -- e.g. 'points_adjust', 'pass_revoke', 'campaign_send', 'customer_delete'
  target_type text,  -- e.g. 'customer', 'pass', 'campaign'
  target_id text,    -- ID of the affected entity
  metadata jsonb,    -- additional context (points_delta, old_value, new_value, etc.)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_log_restaurant ON audit_log(restaurant_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own audit log" ON audit_log FOR SELECT
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));
