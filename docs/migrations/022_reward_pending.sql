-- 022_reward_pending.sql
-- Adds reward_pending flag to customers for the "reward card" flow.
-- When a stamp card is completed (10/10), reward_pending is set to TRUE.
-- The stamps stay at max and the Apple Wallet shows a special reward card.
-- On the next scan, the reward is "collected": stamps reset to 0, reward_pending → FALSE.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS reward_pending BOOLEAN NOT NULL DEFAULT FALSE;
