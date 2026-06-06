-- Promouvoir / retirer le droit « créer une sortie » (app_metadata.goelo_admin) depuis le site,
-- sans clé service côté client : seuls les JWT déjà goelo_admin peuvent appeler cette RPC.

CREATE OR REPLACE FUNCTION public.goelo_admin_set_team_rider(
  p_target_email text,
  p_goelo_admin boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_am jsonb;
  v_admin boolean;
  v_email text;
  n int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  v_am := auth.jwt() -> 'app_metadata';
  v_admin := coalesce((v_am -> 'goelo_admin') = 'true'::jsonb, false)
    OR coalesce((v_am ->> 'goelo_admin') IN ('true', 't', '1'), false);

  IF NOT v_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_email := lower(trim(p_target_email));
  IF v_email IS NULL OR length(v_email) < 5 OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('goelo_admin', p_goelo_admin)
  WHERE lower(email) = v_email;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated_rows', n);
END;
$$;

REVOKE ALL ON FUNCTION public.goelo_admin_set_team_rider(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goelo_admin_set_team_rider(text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.goelo_admin_set_team_rider(text, boolean) IS
  'Met à jour raw_app_meta_data.goelo_admin pour un utilisateur Auth identifié par e-mail. '
  'Appelant : JWT authenticated avec app_metadata.goelo_admin = true.';
