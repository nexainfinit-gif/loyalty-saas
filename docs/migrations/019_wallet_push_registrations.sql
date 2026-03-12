-- Migration 019: Wallet Push Registrations
-- Adds table for Apple Wallet push notification device registrations,
-- and ensures wallet_passes has authentication_token + pass_version columns.
-- Run in Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════
-- 1. ADD authentication_token TO wallet_passes (if not exists)
-- ═══════════════════════════════════════════════════════════════

-- Used in pass.json to authenticate web service requests from Apple devices.
-- Must be at least 16 characters. Default is a UUID cast to text (~36 chars).
ALTER TABLE wallet_passes
  ADD COLUMN IF NOT EXISTS authentication_token TEXT DEFAULT gen_random_uuid()::text;

-- Backfill any rows where authentication_token is null
UPDATE wallet_passes
  SET authentication_token = gen_random_uuid()::text
  WHERE authentication_token IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. ADD pass_version TO wallet_passes (if not exists)
-- ═══════════════════════════════════════════════════════════════

-- Incremented on each update; Apple uses Last-Modified / If-Modified-Since
-- to decide whether to re-download the pass.
ALTER TABLE wallet_passes
  ADD COLUMN IF NOT EXISTS pass_version INTEGER DEFAULT 1;

-- Backfill any rows where pass_version is null
UPDATE wallet_passes
  SET pass_version = 1
  WHERE pass_version IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. CREATE wallet_push_registrations TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE wallet_push_registrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       TEXT        NOT NULL,        -- Apple device library identifier
  push_token      TEXT        NOT NULL,        -- APNS push token
  pass_id         UUID        NOT NULL REFERENCES wallet_passes(id) ON DELETE CASCADE,
  serial_number   TEXT        NOT NULL,        -- pass serial number
  pass_type_id    TEXT        NOT NULL,        -- e.g. pass.com.rebites.loyalty
  registered_at   TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- One registration per device per pass (device_id + pass_type_id + serial_number)
ALTER TABLE wallet_push_registrations
  ADD CONSTRAINT uq_wallet_push_reg_device_pass
  UNIQUE (device_id, pass_type_id, serial_number);

-- ═══════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════════════════

-- Look up all registrations for a given pass (push to all devices)
CREATE INDEX idx_wallet_push_reg_pass
  ON wallet_push_registrations (pass_id);

-- Look up all passes registered on a device (per pass type)
CREATE INDEX idx_wallet_push_reg_device
  ON wallet_push_registrations (device_id, pass_type_id);

-- Look up all devices for a serial number (used by Apple web service)
CREATE INDEX idx_wallet_push_reg_serial
  ON wallet_push_registrations (pass_type_id, serial_number);

-- ═══════════════════════════════════════════════════════════════
-- 5. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE wallet_push_registrations ENABLE ROW LEVEL SECURITY;

-- Service role (supabaseAdmin) bypasses RLS automatically.
-- For authenticated users: allow access only to registrations linked to their restaurant
-- via wallet_push_registrations → wallet_passes → customers → restaurants.
CREATE POLICY wallet_push_reg_owner ON wallet_push_registrations
  FOR ALL
  USING (
    pass_id IN (
      SELECT wp.id FROM wallet_passes wp
      WHERE wp.restaurant_id IN (
        SELECT r.id FROM restaurants r WHERE r.owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    pass_id IN (
      SELECT wp.id FROM wallet_passes wp
      WHERE wp.restaurant_id IN (
        SELECT r.id FROM restaurants r WHERE r.owner_id = auth.uid()
      )
    )
  );
