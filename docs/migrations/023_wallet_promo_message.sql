-- Migration 023: Add promo_message to wallet_passes
-- Stores the current marketing/promo message displayed on the back of the Apple Wallet pass.
-- When this field changes and a push is sent, iOS shows a lock-screen notification
-- via the changeMessage mechanism.
-- Run in Supabase SQL Editor.

ALTER TABLE wallet_passes
  ADD COLUMN IF NOT EXISTS promo_message TEXT DEFAULT NULL;
