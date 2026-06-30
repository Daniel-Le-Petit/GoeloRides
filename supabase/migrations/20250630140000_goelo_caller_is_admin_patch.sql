-- Patch : activity_admin_dashboard() appelle public._goelo_caller_is_admin(),
-- créée dans 20250629130000_approve_demande_backend.sql.
-- Si seule 20250630120000_activity_events.sql a été appliquée, la fonction manque.

-- Dépendance : _goelo_jwt_is_admin (20250621130000_signup_waitlist_route_visibility.sql)
CREATE OR REPLACE FUNCTION public._goelo_jwt_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND auth.uid() IS NOT NULL
    AND (
      coalesce((auth.jwt() -> 'app_metadata' -> 'goelo_admin') = 'true'::jsonb, false)
      OR coalesce((auth.jwt() ->> 'goelo_admin') IN ('true', 't', '1'), false)
    );
$$;

REVOKE ALL ON FUNCTION public._goelo_jwt_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_jwt_is_admin() TO anon, authenticated, service_role;

-- Garde admin unifiée : JWT goelo_admin OU profiles.role = 'admin'
CREATE OR REPLACE FUNCTION public._goelo_caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public._goelo_jwt_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public._goelo_caller_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_caller_is_admin() TO authenticated, service_role;
