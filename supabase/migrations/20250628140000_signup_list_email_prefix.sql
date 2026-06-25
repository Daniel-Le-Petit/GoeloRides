-- signup_list_* : signups uniquement (pas de imported_participant_names).

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
        lower(trim(split_part(lower(trim(s.email)), '@', 1))) AS k,
        jsonb_build_object(
          'pseudo', split_part(lower(trim(s.email)), '@', 1),
          'cyclist_level', to_jsonb(nullif(trim(s.cyclist_level), '')),
          'city', to_jsonb(nullif(trim(s.participant_city), ''))
        ) AS obj
      FROM public.signups s
      WHERE s.route_id = v_rid
        AND s.canceled_at IS NULL
        AND coalesce(s.waitlist, false) = false
        AND length(trim(s.email)) > 0
        AND strpos(trim(s.email), '@') > 1
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
          lower(trim(split_part(lower(trim(s.email)), '@', 1))) AS k,
          jsonb_build_object(
            'pseudo', split_part(lower(trim(s.email)), '@', 1),
            'cyclist_level', to_jsonb(nullif(trim(s.cyclist_level), '')),
            'city', to_jsonb(nullif(trim(s.participant_city), ''))
          ) AS obj
        FROM public.signups s
        WHERE s.route_id = rid
          AND s.canceled_at IS NULL
          AND coalesce(s.waitlist, false) = false
          AND length(trim(s.email)) > 0
          AND strpos(trim(s.email), '@') > 1
      ) sq
      ORDER BY sq.k, sq.obj->>'pseudo'
    ) x;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pseudo', split_part(lower(trim(s.email)), '@', 1),
          'cyclist_level', to_jsonb(nullif(trim(s.cyclist_level), '')),
          'city', to_jsonb(nullif(trim(s.participant_city), ''))
        )
        ORDER BY s.created_at ASC
      ),
      '[]'::jsonb
    ) INTO wl
    FROM public.signups s
    WHERE s.route_id = rid
      AND s.canceled_at IS NULL
      AND coalesce(s.waitlist, false) = true
      AND length(trim(s.email)) > 0
      AND strpos(trim(s.email), '@') > 1;

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
