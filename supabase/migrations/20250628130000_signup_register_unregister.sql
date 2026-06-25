-- signup_register + signup_unregister (manquantes pour toggle_signup).
-- Schéma signups : route_id, email, pseudo, user_id, canceled_at, waitlist.

-- ---------------------------------------------------------------------------
-- signup_register
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_register(
  p_route_id text,
  p_pseudo text,
  p_email text
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
  v_uid       uuid := auth.uid();
  v_fc        jsonb;
  v_status    text;
  v_vis       text;
  v_max       int;
  v_main_cnt  int;
  v_waitlist  boolean := false;
  v_rid       text := trim(p_route_id);
BEGIN
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
    WHERE s.route_id = v_rid
      AND lower(trim(s.email)) = v_email
      AND s.canceled_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END IF;

  IF v_max IS NOT NULL AND v_main_cnt >= v_max THEN
    v_waitlist := true;
  END IF;

  UPDATE public.signups s
  SET
    pseudo = v_pseudo,
    canceled_at = NULL,
    created_at = v_now,
    waitlist = v_waitlist,
    user_id = coalesce(v_uid, s.user_id)
  WHERE s.route_id = v_rid
    AND lower(trim(s.email)) = v_email
    AND s.canceled_at IS NOT NULL;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reactivated', true, 'waitlist', v_waitlist);
  END IF;

  INSERT INTO public.signups (route_id, pseudo, email, waitlist, user_id)
  VALUES (v_rid, v_pseudo, v_email, v_waitlist, v_uid);

  RETURN jsonb_build_object('ok', true, 'reactivated', false, 'waitlist', v_waitlist);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
END;
$$;

-- ---------------------------------------------------------------------------
-- signup_unregister (soft cancel + promotion file d'attente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_unregister(
  p_route_id text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text := lower(trim(p_email));
  v_pseudo   text;
  v_rid      text := trim(p_route_id);
  v_was_main boolean;
  v_fc       jsonb;
  v_max      int;
  v_main_cnt int;
  v_next_id  uuid;
BEGIN
  IF length(v_email) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = v_rid AND r.is_active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT coalesce(s.waitlist, false) = false
  INTO v_was_main
  FROM public.signups s
  WHERE s.route_id = v_rid
    AND lower(trim(s.email)) = v_email
    AND s.canceled_at IS NULL
  LIMIT 1;

  UPDATE public.signups s
  SET canceled_at = now()
  WHERE s.route_id = v_rid
    AND lower(trim(s.email)) = v_email
    AND s.canceled_at IS NULL
  RETURNING trim(s.pseudo) INTO v_pseudo;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF coalesce(v_was_main, false) THEN
    SELECT coalesce(r.front_config, '{}'::jsonb) INTO v_fc
    FROM public.routes r WHERE r.id = v_rid;

    v_max := nullif(regexp_replace(trim(coalesce(v_fc->>'maxParticipants', '')), '[^0-9]', '', 'g'), '')::int;
    IF v_max IS NOT NULL AND v_max >= 1 THEN
      SELECT count(*)::int INTO v_main_cnt
      FROM public.signups s
      WHERE s.route_id = v_rid
        AND s.canceled_at IS NULL
        AND coalesce(s.waitlist, false) = false;

      IF v_main_cnt < v_max THEN
        SELECT s.id INTO v_next_id
        FROM public.signups s
        WHERE s.route_id = v_rid
          AND s.canceled_at IS NULL
          AND coalesce(s.waitlist, false) = true
        ORDER BY s.created_at ASC
        LIMIT 1;

        IF v_next_id IS NOT NULL THEN
          UPDATE public.signups SET waitlist = false WHERE id = v_next_id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pseudo', coalesce(v_pseudo, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.signup_register(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_unregister(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_register(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_unregister(text, text) TO anon, authenticated, service_role;
