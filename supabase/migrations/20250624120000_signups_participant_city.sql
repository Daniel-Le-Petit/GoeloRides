-- Ville / commune optionnelle par inscription (affichée dans les listes d’inscrits).
-- À appliquer après 20250623120000_signups_cyclist_level.sql.

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS participant_city text;

COMMENT ON COLUMN public.signups.participant_city IS
  'Ville ou commune déclarée à l''inscription (affichage public à côté du pseudo).';

DROP FUNCTION IF EXISTS public.signup_register(text, text, text, text);

CREATE OR REPLACE FUNCTION public.signup_register(
  p_route_id text,
  p_pseudo text,
  p_email text,
  p_cyclist_level text DEFAULT NULL,
  p_participant_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     text := lower(trim(p_email));
  v_pseudo    text := trim(p_pseudo);
  v_now       timestamptz := now();
  v_fc        jsonb;
  v_status    text;
  v_vis       text;
  v_max       int;
  v_main_cnt  int;
  v_waitlist  boolean := false;
  v_rid       text := trim(p_route_id);
  v_cl        text := nullif(lower(trim(coalesce(p_cyclist_level, ''))), '');
  v_city      text;
BEGIN
  IF v_cl IS NOT NULL AND v_cl NOT IN ('debutant', 'intermediaire', 'confirme') THEN
    v_cl := NULL;
  END IF;

  v_city := trim(both from regexp_replace(regexp_replace(coalesce(p_participant_city, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
  IF length(v_city) > 80 THEN
    v_city := left(v_city, 80);
  END IF;
  v_city := nullif(v_city, '');

  IF length(v_pseudo) < 1 OR length(v_email) < 3 OR strpos(v_email, '@') < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT coalesce(r.front_config, '{}'::jsonb)
  INTO v_fc
  FROM public.routes r
  WHERE r.id = v_rid AND r.is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  v_status := lower(trim(coalesce(v_fc->>'sortieStatus', 'open')));
  v_vis := lower(trim(coalesce(v_fc->>'visibility', 'public')));

  IF v_status IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sortie_cancelled');
  END IF;
  IF v_status IN ('closed', 'ferme', 'fermée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sortie_closed');
  END IF;
  IF v_vis IN ('private', 'prive', 'privee', 'privée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'private_route');
  END IF;
  IF v_vis IN ('invitation', 'invite', 'invitation_only') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_only');
  END IF;

  v_max := nullif(regexp_replace(trim(coalesce(v_fc->>'maxParticipants', '')), '[^0-9]', '', 'g'), '')::int;
  IF v_max IS NOT NULL AND v_max < 1 THEN
    v_max := null;
  END IF;

  SELECT count(*)::int
  INTO v_main_cnt
  FROM public.signups s
  WHERE s.route_id = v_rid
    AND s.canceled_at IS NULL
    AND coalesce(s.waitlist, false) = false;

  IF EXISTS (
    SELECT 1 FROM public.signups s
    WHERE s.route_id = v_rid AND lower(trim(s.email)) = v_email AND s.canceled_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END IF;

  IF v_max IS NOT NULL AND v_main_cnt >= v_max THEN
    v_waitlist := true;
  END IF;

  UPDATE public.signups s
  SET
    pseudo = v_pseudo,
    canceled_at = null,
    created_at = v_now,
    waitlist = v_waitlist,
    cyclist_level = coalesce(v_cl, s.cyclist_level),
    participant_city = coalesce(v_city, s.participant_city)
  WHERE s.route_id = v_rid AND lower(trim(s.email)) = v_email AND s.canceled_at IS not null;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reactivated', true, 'waitlist', v_waitlist);
  END IF;

  INSERT INTO public.signups (route_id, pseudo, email, waitlist, cyclist_level, participant_city)
  VALUES (v_rid, v_pseudo, v_email, v_waitlist, v_cl, v_city);

  RETURN jsonb_build_object('ok', true, 'reactivated', false, 'waitlist', v_waitlist);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
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
          lower(trim(s.pseudo)) AS k,
          jsonb_build_object(
            'pseudo', trim(s.pseudo),
            'cyclist_level', to_jsonb(nullif(trim(s.cyclist_level), '')),
            'city', to_jsonb(nullif(trim(s.participant_city), ''))
          ) AS obj
        FROM public.signups s
        WHERE s.route_id = rid
          AND s.canceled_at IS NULL
          AND coalesce(s.waitlist, false) = false
          AND length(trim(s.pseudo)) > 0
        UNION ALL
        SELECT
          1 AS pri,
          lower(trim(i.display_name)),
          jsonb_build_object(
            'pseudo', trim(i.display_name),
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
          'pseudo', trim(s.pseudo),
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
      AND length(trim(s.pseudo)) > 0;

    out := out || jsonb_build_object(
      rid,
      jsonb_build_object('participants', part, 'waitlist', coalesce(wl, '[]'::jsonb))
    );
  END LOOP;

  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_register(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_register(text, text, text, text, text) TO anon, authenticated, service_role;
