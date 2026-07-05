-- 010: No-show tracking per client email
--
-- ⚠️ FICHIER RECONSTRUIT (2026-07-05).
-- L'original était corrompu (contenait uniquement le texte « selon »).
-- Le schéma ci-dessous a été reconstitué depuis la base de production
-- (introspection colonne par colonne) et le code applicatif :
--   - app/api/appointments/route.ts        (RPC increment_no_show + upsert fallback)
--   - app/api/appointments/no-show-stats/route.ts
-- La table existe déjà en production — ce fichier est idempotent et sert
-- de documentation + source pour un éventuel rebuild.

CREATE TABLE IF NOT EXISTS client_no_show_stats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  client_email     TEXT NOT NULL,
  no_show_count    INTEGER NOT NULL DEFAULT 0,
  last_no_show_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, client_email)
);

CREATE INDEX IF NOT EXISTS idx_no_show_stats_restaurant
  ON client_no_show_stats(restaurant_id, no_show_count DESC);

-- Atomic increment used by the appointments status-change handler.
-- The app has an upsert fallback if this function is missing.
CREATE OR REPLACE FUNCTION increment_no_show(
  p_restaurant_id UUID,
  p_client_email  TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO client_no_show_stats (restaurant_id, client_email, no_show_count, last_no_show_at)
  VALUES (p_restaurant_id, p_client_email, 1, NOW())
  ON CONFLICT (restaurant_id, client_email)
  DO UPDATE SET
    no_show_count   = client_no_show_stats.no_show_count + 1,
    last_no_show_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: owner-scoped (correct pattern — restaurant_id IN owner's restaurants).
-- API routes use the service role and bypass RLS; this is defence-in-depth.
ALTER TABLE client_no_show_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_show_stats_owner" ON client_no_show_stats;
CREATE POLICY "no_show_stats_owner" ON client_no_show_stats
  FOR ALL
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));
