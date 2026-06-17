-- « Nouvelle sortie » : uniquement utilisateurs Auth avec app_metadata.goelo_admin = true.
-- Option : pseudo de connexion via table goelo_admin_login_aliases (email = auth.users.email).

-- ---------------------------------------------------------------------------
-- Alias pseudo → email (remplir manuellement après création du compte Auth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goelo_admin_login_aliases (
  alias_lower text PRIMARY KEY,
  auth_email  text NOT NULL CHECK (length(trim(auth_email)) > 3 AND auth_email LIKE '%@%')
);

ALTER TABLE public.goelo_admin_login_aliases ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.goelo_admin_login_aliases IS
  'Ligne par pseudo de connexion : alias_lower = lower(trim(pseudo)), auth_email = email du compte Supabase Auth (même que auth.users.email).';

CREATE OR REPLACE FUNCTION public.goelo_admin_resolve_login(p_raw text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := lower(trim(p_raw));
  v_email text;
BEGIN
  IF length(v_key) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT trim(a.auth_email) INTO v_email
  FROM public.goelo_admin_login_aliases a
  WHERE a.alias_lower = v_key
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.goelo_admin_resolve_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goelo_admin_resolve_login(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- route_create : JWT obligatoire + flag admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.route_create(
  p_track_name text,
  p_group_label text,
  p_pace_label text,
  p_front_config jsonb,
  p_sort_order smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_sort smallint := coalesce(nullif(p_sort_order, 0::smallint), 50::smallint);
  v_am jsonb;
  v_admin boolean;
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

  IF length(trim(p_track_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF (SELECT count(*)::int FROM public.routes WHERE route_kind = 'custom') >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limit_reached');
  END IF;

  v_id := 'c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

  INSERT INTO public.routes (id, track_name, group_label, pace_label, sort_order, is_active, route_kind, front_config)
  VALUES (
    v_id,
    trim(p_track_name),
    nullif(trim(p_group_label), ''),
    nullif(trim(p_pace_label), ''),
    v_sort,
    true,
    'custom',
    coalesce(p_front_config, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'route_id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_id');
END;
$$;

REVOKE ALL ON FUNCTION public.route_create(text, text, text, jsonb, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.route_create(text, text, text, jsonb, smallint) TO authenticated, service_role;
