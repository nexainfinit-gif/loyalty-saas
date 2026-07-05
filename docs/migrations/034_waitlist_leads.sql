-- 034: Waitlist leads from the marketing site (rebites.be)
--
-- Platform-level table (not restaurant-scoped): stores emails captured by
-- the "coming soon" page on rebites.be via POST /api/waitlist.
-- Previously these emails were lost in the visitor's localStorage.

CREATE TABLE IF NOT EXISTS waitlist_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL DEFAULT 'rebites.be',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only (written by the API, read by the platform owner via SQL).
ALTER TABLE waitlist_leads ENABLE ROW LEVEL SECURITY;
