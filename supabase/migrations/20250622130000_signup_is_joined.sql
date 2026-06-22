-- État d'inscription pour l'utilisateur connecté (user_id + canceled_at IS NULL).
-- Compagnon de toggle_signup : contourne RLS sur signups via SECURITY DEFINER.
-- À exécuter sur le projet Supabase si le SELECT direct depuis le client échoue.

CREATE OR REPLACE FUNCTION public.signup_is_joined(p_route_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'joined',
    EXISTS (
      SELECT 1
      FROM public.signups s
      WHERE s.route_id = trim(p_route_id)
        AND s.canceled_at IS NULL
        AND (
          (auth.uid() IS NOT NULL AND s.user_id = auth.uid())
          OR (
            auth.uid() IS NULL
            AND auth.role() = 'authenticated'
            AND lower(trim(coalesce(s.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.signup_is_joined(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_is_joined(text) TO anon, authenticated, service_role;
