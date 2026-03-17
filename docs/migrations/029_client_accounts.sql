-- 029_client_accounts.sql
-- Client self-service: magic-link authentication via email.
-- Clients access their appointments, loyalty points, and profile.

CREATE TABLE IF NOT EXISTS client_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_sessions_token ON client_sessions(token);
CREATE INDEX idx_client_sessions_customer ON client_sessions(customer_id);
