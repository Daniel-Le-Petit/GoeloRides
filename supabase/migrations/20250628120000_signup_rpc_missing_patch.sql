-- Patch RPC manquantes (schéma signups legacy : pseudo, email, canceled_at, waitlist).
-- À exécuter dans Supabase SQL Editor si PGRST202 sur signup_* / toggle_signup.
-- Prérequis : 20250528120000_goelo_signup.sql (+ signup_register / signup_unregister).

ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waitlist BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cyclist_level TEXT,
  ADD COLUMN IF NOT EXISTS participant_city TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pseudo TEXT;

-- ---------------------------------------------------------------------------
-- signup_is_joined
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_is_joined(p_route_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'joined',
    EXISTS (
      SELECT 1
      FROM public.signups s
      WHERE s.route_id = trim(p_route_id)
        AND s.canceled_at IS NULL
        AND (
          (auth.uid() IS NOT NULL AND s.user_id = auth.uid())
          OR (
            auth.uid() IS NOT NULL
            AND lower(trim(coalesce(s.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
        )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- signup_list_for_route
-- ---------------------------------------------------------------------------
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
        0 AS pri,
        lower(trim(coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)))) AS k,
        jsonb_build_object(
          'pseudo', coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)),
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
          'cyclist_level', null,
          'city', null
        )
      FROM public.imported_participant_names i
      WHERE i.route_id = v_rid AND length(trim(i.display_name)) > 0
    ) sq
    ORDER BY sq.k, sq.pri, sq.obj->>'pseudo'
  ) x;

  SELECT count(*)::int INTO cnt
  FROM jsonb_array_elements(coalesce(part, '[]'::jsonb));

  RETURN jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'count', cnt);
END;
$$;

-- ---------------------------------------------------------------------------
-- signup_list_all_names
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
          0 AS pri,
          lower(trim(coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)))) AS k,
          jsonb_build_object(
            'pseudo', coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)),
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
          jsonb_build_object('pseudo', trim(i.display_name), 'cyclist_level', null, 'city', null)
        FROM public.imported_participant_names i
        WHERE i.route_id = rid AND length(trim(i.display_name)) > 0
      ) sq
      ORDER BY sq.k, sq.pri, sq.obj->>'pseudo'
    ) x;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pseudo', coalesce(nullif(trim(s.pseudo), ''), split_part(lower(trim(s.email)), '@', 1)),
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
      AND coalesce(s.waitlist, false) = true;

    out := out || jsonb_build_object(
      rid,
      jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'waitlist', coalesce(wl, '[]'::jsonb))
    );
  END LOOP;

  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- toggle_signup (délègue à signup_register / signup_unregister existants)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_signup(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid    text := trim(p_route_id);
  v_email  text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_uid    uuid := auth.uid();
  v_pseudo text;
  v_joined boolean;
  v_res    jsonb;
  v_cnt    int;
BEGIN
  IF v_uid IS NULL OR length(v_email) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT coalesce(
    nullif(trim(p.pseudo), ''),
    nullif(trim(u.raw_user_meta_data->>'pseudo'), ''),
    split_part(v_email, '@', 1)
  )
  INTO v_pseudo
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  SELECT EXISTS (
    SELECT 1 FROM public.signups s
    WHERE s.route_id = v_rid
      AND s.canceled_at IS NULL
      AND (
        lower(trim(s.email)) = v_email
        OR (s.user_id IS NOT NULL AND s.user_id = v_uid)
      )
  ) INTO v_joined;

  IF v_joined THEN
    v_res := public.signup_unregister(v_rid, v_email);
    IF coalesce(v_res->>'ok', 'false') <> 'true' THEN
      RETURN v_res;
    END IF;
    SELECT count(*)::int INTO v_cnt
    FROM public.signups s
    WHERE s.route_id = v_rid
      AND s.canceled_at IS NULL
      AND coalesce(s.waitlist, false) = false;
    RETURN jsonb_build_object('ok', true, 'action', 'unjoined', 'joined', false, 'count', v_cnt);
  END IF;

  v_res := public.signup_register(v_rid, v_pseudo, v_email);
  IF coalesce(v_res->>'ok', 'false') <> 'true' THEN
    RETURN v_res;
  END IF;

  UPDATE public.signups
  SET user_id = v_uid
  WHERE route_id = v_rid
    AND lower(trim(email)) = v_email
    AND canceled_at IS NULL
    AND user_id IS NULL;

  SELECT count(*)::int INTO v_cnt
  FROM public.signups s
  WHERE s.route_id = v_rid
    AND s.canceled_at IS NULL
    AND coalesce(s.waitlist, false) = false;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'joined',
    'joined', true,
    'waitlist', coalesce((v_res->>'waitlist')::boolean, false),
    'count', v_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_is_joined(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_for_route(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_is_joined(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_for_route(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text) TO anon, authenticated, service_role;
