-- ═══════════════════════════════════════════════════════
-- TUTORIAL TRACKING — SUPABASE MIGRATION
-- ═══════════════════════════════════════════════════════

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamptz;
