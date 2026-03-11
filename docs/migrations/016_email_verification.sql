-- 016: Email verification columns
-- Soft verification — does not block registration or loyalty usage

ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verification_token text;
