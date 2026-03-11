-- Migration 013: DB indexes, serial number default, RLS policies
-- Run this in Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════
-- 1. PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════════════════════

-- Index on customers.qr_token — scanned on every QR scan
CREATE INDEX IF NOT EXISTS idx_customers_qr_token
  ON customers (qr_token);

-- Composite index on customers(restaurant_id, email) — used on every registration duplicate check
CREATE INDEX IF NOT EXISTS idx_customers_restaurant_email
  ON customers (restaurant_id, email);

-- Index on wallet_passes for auto-issue duplicate check
CREATE INDEX IF NOT EXISTS idx_wallet_passes_customer_template
  ON wallet_passes (customer_id, template_id, platform, status);

-- ═══════════════════════════════════════════════════════════════
-- 2. SERIAL NUMBER DEFAULT
-- ═══════════════════════════════════════════════════════════════

-- Ensure serial_number is never null (Apple uniqueness requirement)
ALTER TABLE wallet_passes
  ALTER COLUMN serial_number SET DEFAULT gen_random_uuid()::text;

-- Backfill any null serial numbers
UPDATE wallet_passes
  SET serial_number = gen_random_uuid()::text
  WHERE serial_number IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS POLICIES — wallet_pass_templates
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS if not already enabled
ALTER TABLE wallet_pass_templates ENABLE ROW LEVEL SECURITY;

-- Owners can read/write their own templates
CREATE POLICY "Owners manage own templates"
  ON wallet_pass_templates
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS POLICIES — wallet_passes
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE wallet_passes ENABLE ROW LEVEL SECURITY;

-- Owners can manage passes for their restaurant
CREATE POLICY "Owners manage own passes"
  ON wallet_passes
  FOR ALL
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Service role bypasses RLS (needed for API routes using supabaseAdmin)
-- This is the default behavior in Supabase — service_role key always bypasses RLS.
-- No additional policy needed.
