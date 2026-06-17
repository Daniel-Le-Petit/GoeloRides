-- Capacité max, file d'attente, statut / visibilité sortie, filtre routes_list (anon).
-- À exécuter après les migrations routes + signup dynamiques.

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS waitlist boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.signups.waitlist IS 'true = liste d''attente (places principales pleines).';

CREATE INDEX IF NOT EXISTS signups_route_waitlist_created_idx
  ON public.signups (route_id, waitlist, created_at ASC)
  WHERE canceled_at IS NULL AND waitlist = true;

-- ---------------------------------------------------------------------------
-- Admin JWT (même logique que route_update)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._goelo_jwt_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND auth.uid() IS NOT NULL
    AND (
      coalesce((auth.jwt() -> 'app_metadata' -> 'goelo_admin') = 'true'::jsonb, false)
      OR coalesce((auth.jwt() ->> 'goelo_admin') IN ('true', 't', '1'), false)
    );
$$;

REVOKE ALL ON FUNCTION public._goelo_jwt_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_jwt_is_admin() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- routes_list : masquer private / invitation pour le public (JWT non admin ou anon)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.routes_list(jsonb);

CREATE OR REPLACE FUNCTION public.routes_list(p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'track_name', r.track_name,
        'group_label', r.group_label,
        'pace_label', r.pace_label,
        'sort_order', r.sort_order,
        'route_kind', r.route_kind,
        'front_config', r.front_config
      )
      ORDER BY r.sort_order, r.id
    ),
    '[]'::jsonb
  )
  FROM public.routes r
  WHERE r.is_active = true
    AND (
      (
        public._goelo_jwt_is_admin()
        AND coalesce(lower(trim(p_filter->>'includeNonPublic')), '') IN ('true', 't', '1')
      )
      OR coalesce(nullif(lower(trim(r.front_config->>'visibility')), ''), 'public') IN (
        'public',
        'invitation',
        'invite',
        'invitation_only'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.routes_list(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.routes_list(jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- signup_register (capacité + file d’attente + statut + visibilité)
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
    waitlist = v_waitlist
  WHERE s.route_id = v_rid AND lower(trim(s.email)) = v_email AND s.canceled_at IS not null;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reactivated', true, 'waitlist', v_waitlist);
  END IF;

  INSERT INTO public.signups (route_id, pseudo, email, waitlist)
  VALUES (v_rid, v_pseudo, v_email, v_waitlist);

  RETURN jsonb_build_object('ok', true, 'reactivated', false, 'waitlist', v_waitlist);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
END;
$$;

-- ---------------------------------------------------------------------------
-- signup_unregister + promotion file d’attente
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
    AND s.canceled_at IS null
  LIMIT 1;

  UPDATE public.signups s
  SET canceled_at = now()
  WHERE s.route_id = v_rid
    AND lower(trim(s.email)) = v_email
    AND s.canceled_at IS null
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
      WHERE s.route_id = v_rid AND s.canceled_at IS null AND coalesce(s.waitlist, false) = false;

      IF v_main_cnt < v_max THEN
        SELECT s.id INTO v_next_id
        FROM public.signups s
        WHERE s.route_id = v_rid
          AND s.canceled_at IS null
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

-- ---------------------------------------------------------------------------
-- signup_list_all_names : { route_id: { "participants": [], "waitlist": [] } }
-- ---------------------------------------------------------------------------
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
    SELECT coalesce(jsonb_agg(v.n ORDER BY v.n), '[]'::jsonb) INTO part
    FROM (
      SELECT DISTINCT ON (u.k) u.n
      FROM (
        SELECT trim(s.pseudo) AS n, lower(trim(s.pseudo)) AS k
        FROM public.signups s
        WHERE s.route_id = rid AND s.canceled_at IS NULL AND coalesce(s.waitlist, false) = false
        UNION ALL
        SELECT trim(i.display_name), lower(trim(i.display_name))
        FROM public.imported_participant_names i
        WHERE i.route_id = rid
      ) u
      WHERE length(trim(u.n)) > 0
      ORDER BY u.k, u.n
    ) v;

    SELECT coalesce(jsonb_agg(trim(s.pseudo) ORDER BY s.created_at ASC), '[]'::jsonb) INTO wl
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

-- ---------------------------------------------------------------------------
-- signup_get_registration : inclut on_waitlist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_get_registration(p_route_id text, p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'registered',
    EXISTS (
      SELECT 1 FROM public.signups s
      WHERE s.route_id = trim(p_route_id)
        AND lower(trim(s.email)) = lower(trim(p_email))
        AND s.canceled_at IS NULL
    ),
    'on_waitlist',
    EXISTS (
      SELECT 1 FROM public.signups s
      WHERE s.route_id = trim(p_route_id)
        AND lower(trim(s.email)) = lower(trim(p_email))
        AND s.canceled_at IS NULL
        AND coalesce(s.waitlist, false) = true
    ),
    'pseudo',
    coalesce(
      (
        SELECT trim(s.pseudo)
        FROM public.signups s
        WHERE s.route_id = trim(p_route_id)
          AND lower(trim(s.email)) = lower(trim(p_email))
          AND s.canceled_at IS NULL
        LIMIT 1
      ),
      ''
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Commentaires : bloquer si sortie annulée (front_config.sortieStatus)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sortie_comment_list(p_route_id text, p_limit int DEFAULT 80)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limit, 80), 120));
  st  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = p_route_id AND r.is_active = true
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT lower(trim(coalesce(r.front_config->>'sortieStatus', 'open')))
  INTO st
  FROM public.routes r
  WHERE r.id = p_route_id;

  IF st IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    WITH recent AS (
      SELECT c.id, c.pseudo, c.body, c.created_at
      FROM public.route_comments c
      WHERE c.route_id = p_route_id
      ORDER BY c.created_at DESC
      LIMIT lim
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'pseudo', trim(r.pseudo),
          'body', trim(r.body),
          'created_at', r.created_at
        )
        ORDER BY r.created_at ASC
      ),
      '[]'::jsonb
    )
    FROM recent r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sortie_comment_add(
  p_route_id text,
  p_pseudo text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vp text := trim(p_pseudo);
  vb text := trim(p_body);
  st text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = p_route_id AND r.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  SELECT lower(trim(coalesce(r.front_config->>'sortieStatus', 'open')))
  INTO st
  FROM public.routes r
  WHERE r.id = p_route_id;

  IF st IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sortie_cancelled');
  END IF;

  IF length(vp) < 1 OR length(vp) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pseudo');
  END IF;

  IF length(vb) < 1 OR length(vb) > 1200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_body');
  END IF;

  INSERT INTO public.route_comments (route_id, pseudo, body)
  VALUES (p_route_id, vp, vb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.signup_register(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_unregister(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_get_registration(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_register(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_unregister(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_get_registration(text, text) TO anon, authenticated, service_role;
