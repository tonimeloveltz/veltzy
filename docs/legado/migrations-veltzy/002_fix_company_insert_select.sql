-- Permitir que o usuario que acabou de criar uma empresa consiga ler o retorno do INSERT
-- A policy original exige get_current_company_id() que ainda e NULL no momento do INSERT
CREATE POLICY "Creator can view company during onboarding"
ON public.companies FOR SELECT TO authenticated
USING (can_create_company());
