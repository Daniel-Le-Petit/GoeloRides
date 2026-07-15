-- Liste des profils cyclistes pour le dashboard admin (e-mail réservé admin).
-- Ne modifie aucune table ; RPC SECURITY DEFINER + garde _goelo_caller_is_admin().

CREATE OR REPLACE FUNCTION public.admin_profiles_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'pseudo', nullif(trim(p.pseudo), ''),
        'username', nullif(trim(p.username), ''),
        'display_name', coalesce(
          nullif(trim(p.display_name), ''),
          public.get_display_name(p.pseudo, p.username, u.email)
        ),
        'email', u.email,
        'role', p.role,
        'cyclist_level', nullif(trim(p.cyclist_level), ''),
        'city', nullif(trim(p.city), ''),
        'created_at', p.created_at
      )
      ORDER BY p.created_at DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id;

  RETURN jsonb_build_object('ok', true, 'profiles', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_profiles_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_profiles_list() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_profiles_list() IS
  'Liste tous les profils + e-mail (auth.users). Réservé admin JWT ou profiles.role = admin.';
