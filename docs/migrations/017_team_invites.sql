-- 017_team_invites.sql
-- Multi-user team invite system: invites + members tables

CREATE TABLE IF NOT EXISTS team_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  invited_by uuid NOT NULL,
  token text NOT NULL DEFAULT gen_random_uuid()::text,
  status text NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);
CREATE INDEX idx_team_invites_restaurant ON team_invites(restaurant_id);
CREATE INDEX idx_team_invites_token ON team_invites(token);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  created_at timestamptz DEFAULT now(),
  UNIQUE(restaurant_id, user_id)
);
CREATE INDEX idx_team_members_restaurant ON team_members(restaurant_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
