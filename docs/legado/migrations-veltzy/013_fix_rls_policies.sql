-- Fix C2: company_invites SELECT was USING (true) - exposes all invites cross-tenant
-- Fix C3: support_tickets INSERT was WITH CHECK (true) - allows cross-tenant inserts

-- ============================================================
-- C2: Fix company_invites policies (public schema)
-- ============================================================

-- Drop all existing policies on company_invites to avoid conflicts
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'company_invites' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_invites', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "company_invites_company_isolation"
ON public.company_invites FOR ALL TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin())
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

-- ============================================================
-- C2: Fix company_invites policies (veltzy schema)
-- ============================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'company_invites' AND schemaname = 'veltzy'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON veltzy.company_invites', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "vz_ci_company_isolation"
ON veltzy.company_invites FOR ALL TO authenticated
USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

-- ============================================================
-- C3: Fix support_tickets policies (public schema)
-- ============================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'support_tickets' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.support_tickets', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "support_tickets_company_isolation"
ON public.support_tickets FOR ALL TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin())
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

-- ============================================================
-- C3: Fix support_tickets policies (veltzy schema)
-- ============================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'support_tickets' AND schemaname = 'veltzy'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON veltzy.support_tickets', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "vz_st_company_isolation"
ON veltzy.support_tickets FOR ALL TO authenticated
USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

-- ============================================================
-- C8: Add 'representative' to app_role enum
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'representative';
