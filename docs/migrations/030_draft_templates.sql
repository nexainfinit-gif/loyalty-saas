-- Allow wallet templates without a restaurant (global drafts / reusable templates)
ALTER TABLE wallet_pass_templates ALTER COLUMN restaurant_id DROP NOT NULL;
