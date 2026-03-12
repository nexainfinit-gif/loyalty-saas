-- 021_vip_threshold.sql
-- Make VIP customer threshold configurable per restaurant.
-- vip_threshold_points: used when program_type = 'points'
-- vip_threshold_stamps: used when program_type = 'stamps' (total stamps accumulated)

ALTER TABLE loyalty_settings
  ADD COLUMN IF NOT EXISTS vip_threshold_points integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS vip_threshold_stamps integer NOT NULL DEFAULT 10;
