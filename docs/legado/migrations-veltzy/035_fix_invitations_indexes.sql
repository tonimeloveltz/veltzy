-- Migration 035: Indices e constraint para invitations
-- =============================================================================

-- Indices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_company_status ON public.invitations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_email_company ON public.invitations(email, company_id);

-- Unique constraint para evitar role duplicado na mesma empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_company
  ON public.user_roles(user_id, company_id) WHERE company_id IS NOT NULL;
