-- 025: Add no-show blocking threshold to appointment_settings
ALTER TABLE appointment_settings
  ADD COLUMN IF NOT EXISTS no_show_block_threshold INTEGER NOT NULL DEFAULT 3;
