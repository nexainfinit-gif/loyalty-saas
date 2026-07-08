-- 043 — Comptes équipe (option B) : RLS sur les tables team.
-- CONSTAT (2026-07-08) : team_members et team_invites étaient créées (017)
-- SANS RLS → lisibles ET inscriptibles avec la clé anon (tokens d'invitation
-- exposés, auto-insertion possible). Toutes les écritures passent par le
-- service role (API) → deny-all + une seule policy de lecture :
-- un utilisateur peut lire SES propres rattachements (fallback client du
-- login/dashboard pour rediriger un membre d'équipe vers son agenda).

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_self_read ON team_members;
CREATE POLICY team_members_self_read ON team_members
  FOR SELECT USING (user_id = auth.uid());

-- team_invites : aucune policy → service role uniquement (tokens protégés).
