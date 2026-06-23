-- Liste participants actifs pour une sortie (après toggle_signup).
-- Complète signup_list_all_names pour un refresh ciblé côté parcours.html.

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
    SELECT DISTINCT ON (sq.k)
      sq.k,
      sq.obj
    FROM (
      SELECT
        0 AS pri,
        lower(trim(coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)))) AS k,
        jsonb_build_object(
          'pseudo', coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)),
          'email', lower(trim(s.email)),
          'cyclist_level', to_jsonb(nullif(trim(s.cyclist_level), '')),
          'city', to_jsonb(nullif(trim(s.participant_city), ''))
        ) AS obj
      FROM public.signups s
      WHERE s.route_id = v_rid
        AND s.canceled_at IS NULL
        AND coalesce(s.waitlist, false) = false
      UNION ALL
      SELECT
        1 AS pri,
        lower(trim(i.display_name)),
        jsonb_build_object(
          'pseudo', trim(i.display_name),
          'email', null,
          'cyclist_level', null,
          'city', null
        )
      FROM public.imported_participant_names i
      WHERE i.route_id = v_rid
        AND length(trim(i.display_name)) > 0
    ) sq
    ORDER BY sq.k, sq.pri, sq.obj->>'pseudo'
  ) x;

  SELECT count(*)::int INTO cnt
  FROM jsonb_array_elements(coalesce(part, '[]'::jsonb));

  RETURN jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'count', cnt);
END;
$$;

REVOKE ALL ON FUNCTION public.signup_list_for_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_list_for_route(text) TO anon, authenticated, service_role;
