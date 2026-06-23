-- signup_list_all_names : inclure les inscrits sans pseudo (fallback email local-part)
-- Aligné sur signup_list_for_route pour que sorties.html et parcours.html affichent les mêmes participants.

CREATE OR REPLACE FUNCTION public.signup_list_all_names()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid text;
  part jsonb;
  wl jsonb;
  out jsonb := '{}'::jsonb;
BEGIN
  FOR rid IN SELECT r.id FROM public.routes r WHERE r.is_active ORDER BY r.sort_order, r.id
  LOOP
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
        WHERE s.route_id = rid
          AND s.canceled_at IS NULL
          AND coalesce(s.waitlist, false) = false
          AND length(trim(coalesce(nullif(trim(s.pseudo), ''), s.email))) > 0
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
        WHERE i.route_id = rid
          AND length(trim(i.display_name)) > 0
      ) sq
      ORDER BY sq.k, sq.pri, sq.obj->>'pseudo'
    ) x;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pseudo', coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)),
          'email', lower(trim(s.email)),
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
      AND length(trim(coalesce(nullif(trim(s.pseudo), ''), s.email))) > 0;

    out := out || jsonb_build_object(
      rid,
      jsonb_build_object('participants', part, 'waitlist', coalesce(wl, '[]'::jsonb))
    );
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
