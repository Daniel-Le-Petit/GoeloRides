-- signup_list_* : pseudos depuis profiles (jamais d'e-mail exposé dans l'UI).

CREATE OR REPLACE FUNCTION public._signup_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pseudo', coalesce(
      nullif(trim(p.pseudo), ''),
      nullif(trim(p.username), ''),
      'Utilisateur'
    ),
    'username', nullif(trim(p.username), ''),
    'display_name', coalesce(
      nullif(trim(p.pseudo), ''),
      nullif(trim(p.username), ''),
      'Utilisateur'
    ),
    'cyclist_level', to_jsonb(nullif(trim(p.cyclist_level), '')),
    'city', to_jsonb(nullif(trim(p.city), ''))
  )
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.signup_list_for_route(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  part  jsonb;
  cnt   int;
BEGIN
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('participants', '[]'::jsonb, 'count', 0);
  END IF;

  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.k, x.obj->>'pseudo'), '[]'::jsonb) INTO part
  FROM (
    SELECT DISTINCT ON (sq.k) sq.k, sq.obj
    FROM (
      SELECT
        lower(coalesce(s.user_id::text, s.id::text)) AS k,
        coalesce(pr.obj, '{}'::jsonb)
          || jsonb_build_object(
            'pseudo', coalesce(nullif(trim(pr.obj->>'pseudo'), ''), 'Utilisateur')
          ) AS obj
      FROM public.signups s
      CROSS JOIN LATERAL (
        SELECT public._signup_profile_json(s.user_id) AS obj
      ) pr
      WHERE s.route_id = v_rid
        AND s.canceled_at IS NULL
        AND coalesce(s.waitlist, false) = false
    ) sq
    ORDER BY sq.k, sq.obj->>'pseudo'
  ) x;

  SELECT count(*)::int INTO cnt
  FROM jsonb_array_elements(coalesce(part, '[]'::jsonb));

  RETURN jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'count', cnt);
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_list_all_names()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid text;
  part jsonb;
  wl   jsonb;
  out  jsonb := '{}'::jsonb;
BEGIN
  FOR rid IN SELECT r.id FROM public.routes r WHERE r.is_active ORDER BY r.sort_order, r.id
  LOOP
    SELECT coalesce(jsonb_agg(x.obj ORDER BY x.k, x.obj->>'pseudo'), '[]'::jsonb) INTO part
    FROM (
      SELECT DISTINCT ON (sq.k) sq.k, sq.obj
      FROM (
        SELECT
          lower(coalesce(s.user_id::text, s.id::text)) AS k,
          coalesce(pr.obj, '{}'::jsonb)
            || jsonb_build_object(
              'pseudo', coalesce(nullif(trim(pr.obj->>'pseudo'), ''), 'Utilisateur')
            ) AS obj
        FROM public.signups s
        CROSS JOIN LATERAL (
          SELECT public._signup_profile_json(s.user_id) AS obj
        ) pr
        WHERE s.route_id = rid
          AND s.canceled_at IS NULL
          AND coalesce(s.waitlist, false) = false
      ) sq
      ORDER BY sq.k, sq.obj->>'pseudo'
    ) x;

    SELECT coalesce(
      jsonb_agg(
        coalesce(pr.obj, '{}'::jsonb)
          || jsonb_build_object(
            'pseudo', coalesce(nullif(trim(pr.obj->>'pseudo'), ''), 'Utilisateur')
          )
        ORDER BY s.created_at ASC
      ),
      '[]'::jsonb
    ) INTO wl
    FROM public.signups s
    CROSS JOIN LATERAL (
      SELECT public._signup_profile_json(s.user_id) AS obj
    ) pr
    WHERE s.route_id = rid
      AND s.canceled_at IS NULL
      AND coalesce(s.waitlist, false) = true;

    out := out || jsonb_build_object(
      rid,
      jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'waitlist', coalesce(wl, '[]'::jsonb))
    );
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_list_for_route(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_list_for_route(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
