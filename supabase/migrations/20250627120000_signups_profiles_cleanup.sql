-- Nettoyage signups : relation user ↔ ride uniquement, profils = source de vérité.
-- À exécuter après toutes les migrations signup_* antérieures.
-- route_id = identifiant sortie (ride_id métier).

-- ---------------------------------------------------------------------------
-- 1. Profiles — source unique pseudo / username / niveau / ville
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pseudo         TEXT,
  ADD COLUMN IF NOT EXISTS username       TEXT,
  ADD COLUMN IF NOT EXISTS cyclist_level  TEXT,
  ADD COLUMN IF NOT EXISTS city           TEXT;

COMMENT ON TABLE public.profiles IS 'Profil utilisateur — seule source de vérité pour pseudo, username, niveau, ville.';
COMMENT ON COLUMN public.signups.route_id IS 'Identifiant sortie (ride).';

-- Affichage standard : pseudo → username → préfixe e-mail
CREATE OR REPLACE FUNCTION public.get_display_name(
  p_pseudo   text,
  p_username text,
  p_email    text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(p_pseudo), ''),
    nullif(trim(p_username), ''),
    nullif(split_part(lower(trim(coalesce(p_email, ''))), '@', 1), ''),
    '?'
  );
$$;

REVOKE ALL ON FUNCTION public.get_display_name(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_display_name(text, text, text) TO anon, authenticated, service_role;

-- JSON participant pour les listes (sans e-mail exposé)
CREATE OR REPLACE FUNCTION public._signup_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pseudo', nullif(trim(p.pseudo), ''),
    'username', nullif(trim(p.username), ''),
    'display_name', public.get_display_name(p.pseudo, p.username, u.email),
    'email_prefix', nullif(split_part(lower(trim(u.email)), '@', 1), ''),
    'cyclist_level', to_jsonb(nullif(trim(p.cyclist_level), '')),
    'city', to_jsonb(nullif(trim(p.city), ''))
  )
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public._signup_profile_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._signup_profile_json(uuid) TO anon, authenticated, service_role;

-- Lignes profiles manquantes + backfill depuis auth.users et signups legacy
INSERT INTO public.profiles (id, role)
SELECT u.id, 'user'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles p
SET
  pseudo = coalesce(
    nullif(trim(p.pseudo), ''),
    nullif(trim(u.raw_user_meta_data->>'pseudo'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), '')
  ),
  username = coalesce(
    nullif(trim(p.username), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), '')
  )
FROM auth.users u
WHERE u.id = p.id;

UPDATE public.profiles p
SET
  pseudo = coalesce(nullif(trim(p.pseudo), ''), nullif(trim(ls.pseudo), '')),
  cyclist_level = coalesce(nullif(trim(p.cyclist_level), ''), nullif(trim(ls.cyclist_level), '')),
  city = coalesce(nullif(trim(p.city), ''), nullif(trim(ls.participant_city), ''))
FROM (
  SELECT DISTINCT ON (lower(trim(s.email)))
    lower(trim(s.email)) AS em,
    trim(s.pseudo) AS pseudo,
    trim(s.cyclist_level) AS cyclist_level,
    trim(s.participant_city) AS participant_city
  FROM public.signups s
  WHERE length(trim(coalesce(s.email, ''))) > 3
  ORDER BY lower(trim(s.email)), s.created_at DESC
) ls
JOIN auth.users u ON lower(trim(u.email)) = ls.em
WHERE p.id = u.id;

UPDATE public.profiles p
SET pseudo = coalesce(nullif(trim(p.pseudo), ''), split_part(u.email, '@', 1))
FROM auth.users u
WHERE u.id = p.id AND (p.pseudo IS NULL OR trim(p.pseudo) = '');

-- ---------------------------------------------------------------------------
-- 2. signups — user_id + status, suppression duplication utilisateur
-- ---------------------------------------------------------------------------
ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status   TEXT;

-- Mapper user_id depuis e-mail legacy
UPDATE public.signups s
SET user_id = u.id
FROM auth.users u
WHERE s.user_id IS NULL
  AND length(trim(coalesce(s.email, ''))) > 3
  AND lower(trim(s.email)) = lower(trim(u.email));

-- Statut depuis canceled_at / waitlist
UPDATE public.signups s
SET status = CASE
  WHEN s.canceled_at IS NOT NULL THEN 'cancelled'
  WHEN coalesce(s.waitlist, false) = true THEN 'waiting'
  ELSE 'joined'
END
WHERE s.status IS NULL OR trim(s.status) = '';

-- Lignes sans compte : annulées (non affichables, à corriger manuellement si besoin)
UPDATE public.signups
SET status = 'cancelled'
WHERE user_id IS NULL AND coalesce(status, '') <> 'cancelled';

DELETE FROM public.signups
WHERE user_id IS NULL;

ALTER TABLE public.signups
  ALTER COLUMN status SET DEFAULT 'joined';

UPDATE public.signups SET status = 'joined' WHERE status IS NULL OR trim(status) = '';

ALTER TABLE public.signups
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signups_status_check'
  ) THEN
    ALTER TABLE public.signups
      ADD CONSTRAINT signups_status_check
      CHECK (status IN ('joined', 'waiting', 'cancelled'));
  END IF;
END $$;

ALTER TABLE public.signups
  ALTER COLUMN user_id SET NOT NULL;

DROP INDEX IF EXISTS public.signups_route_email_active_idx;
DROP INDEX IF EXISTS public.signups_active_route_idx;
DROP INDEX IF EXISTS public.signups_route_waitlist_created_idx;

CREATE INDEX IF NOT EXISTS signups_route_status_created_idx
  ON public.signups (route_id, status, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS signups_route_user_active_idx
  ON public.signups (route_id, user_id)
  WHERE status IN ('joined', 'waiting');

ALTER TABLE public.signups DROP CONSTRAINT IF EXISTS signups_pseudo_nonempty;
ALTER TABLE public.signups DROP CONSTRAINT IF EXISTS signups_email_nonempty;

ALTER TABLE public.signups DROP COLUMN IF EXISTS pseudo;
ALTER TABLE public.signups DROP COLUMN IF EXISTS email;
ALTER TABLE public.signups DROP COLUMN IF EXISTS waitlist;
ALTER TABLE public.signups DROP COLUMN IF EXISTS canceled_at;
ALTER TABLE public.signups DROP COLUMN IF EXISTS cyclist_level;
ALTER TABLE public.signups DROP COLUMN IF EXISTS participant_city;

-- ---------------------------------------------------------------------------
-- 3. toggle_signup (auth.uid + profiles, pas de duplication)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._signup_route_capacity(p_route_id text)
RETURNS TABLE (
  route_ok boolean,
  sortie_status text,
  visibility text,
  max_participants int,
  main_count int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fc jsonb;
  v_rid text := trim(p_route_id);
  v_max int;
BEGIN
  SELECT coalesce(r.front_config, '{}'::jsonb)
  INTO v_fc
  FROM public.routes r
  WHERE r.id = v_rid AND r.is_active;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ''::text, ''::text, null::int, 0;
    RETURN;
  END IF;

  v_max := nullif(
    regexp_replace(trim(coalesce(v_fc->>'maxParticipants', '')), '[^0-9]', '', 'g'),
    ''
  )::int;
  IF v_max IS NOT NULL AND v_max < 1 THEN
    v_max := null;
  END IF;

  RETURN QUERY
  SELECT
    true,
    lower(trim(coalesce(v_fc->>'sortieStatus', 'open'))),
    lower(trim(coalesce(v_fc->>'visibility', 'public'))),
    v_max,
    (
      SELECT count(*)::int
      FROM public.signups s
      WHERE s.route_id = v_rid AND s.status = 'joined'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public._signup_promote_waitlist(p_route_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_cap record;
  v_next_id uuid;
BEGIN
  SELECT * INTO v_cap FROM public._signup_route_capacity(v_rid);
  IF NOT v_cap.route_ok OR v_cap.max_participants IS NULL THEN
    RETURN;
  END IF;

  WHILE v_cap.main_count < v_cap.max_participants LOOP
    SELECT s.id INTO v_next_id
    FROM public.signups s
    WHERE s.route_id = v_rid AND s.status = 'waiting'
    ORDER BY s.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_next_id IS NULL;

    UPDATE public.signups SET status = 'joined' WHERE id = v_next_id;
    v_cap.main_count := v_cap.main_count + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_signup(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_rid        text := trim(p_route_id);
  v_now        timestamptz := now();
  v_cap        record;
  v_cur_status text;
  v_waitlist   boolean := false;
  v_cnt        int;
  v_cancelled_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  INSERT INTO public.profiles (id, role)
  VALUES (v_uid, 'user')
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_cap FROM public._signup_route_capacity(v_rid);
  IF NOT v_cap.route_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  IF v_cap.sortie_status IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sortie_cancelled');
  END IF;
  IF v_cap.sortie_status IN ('closed', 'ferme', 'fermée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sortie_closed');
  END IF;
  IF v_cap.visibility IN ('private', 'prive', 'privee', 'privée') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'private_route');
  END IF;
  IF v_cap.visibility IN ('invitation', 'invite', 'invitation_only') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_only');
  END IF;

  SELECT s.status INTO v_cur_status
  FROM public.signups s
  WHERE s.route_id = v_rid AND s.user_id = v_uid AND s.status IN ('joined', 'waiting')
  LIMIT 1;

  IF v_cur_status IS NOT NULL THEN
    UPDATE public.signups
    SET status = 'cancelled'
    WHERE route_id = v_rid AND user_id = v_uid AND status IN ('joined', 'waiting');

    IF v_cur_status = 'joined' THEN
      PERFORM public._signup_promote_waitlist(v_rid);
    END IF;

    SELECT count(*)::int INTO v_cnt
    FROM public.signups s
    WHERE s.route_id = v_rid AND s.status = 'joined';

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'unjoined',
      'joined', false,
      'count', v_cnt
    );
  END IF;

  IF v_cap.max_participants IS NOT NULL AND v_cap.main_count >= v_cap.max_participants THEN
    v_waitlist := true;
  END IF;

  SELECT s.id INTO v_cancelled_id
  FROM public.signups s
  WHERE s.route_id = v_rid AND s.user_id = v_uid AND s.status = 'cancelled'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_cancelled_id IS NOT NULL THEN
    UPDATE public.signups
    SET status = CASE WHEN v_waitlist THEN 'waiting' ELSE 'joined' END,
        created_at = v_now
    WHERE id = v_cancelled_id;
  ELSE
    INSERT INTO public.signups (route_id, user_id, status, created_at)
    VALUES (
      v_rid,
      v_uid,
      CASE WHEN v_waitlist THEN 'waiting' ELSE 'joined' END,
      v_now
    );
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.signups s
  WHERE s.route_id = v_rid AND s.status = 'joined';

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'joined',
    'joined', true,
    'waitlist', v_waitlist,
    'count', v_cnt
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC lecture / legacy (jointure profiles)
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
        AND s.user_id = auth.uid()
        AND s.status IN ('joined', 'waiting')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.signup_get_registration(p_route_id text)
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
        AND s.user_id = auth.uid()
        AND s.status IN ('joined', 'waiting')
    ),
    'on_waitlist',
    EXISTS (
      SELECT 1 FROM public.signups s
      WHERE s.route_id = trim(p_route_id)
        AND s.user_id = auth.uid()
        AND s.status = 'waiting'
    ),
    'display_name',
    coalesce(
      (
        SELECT public.get_display_name(p.pseudo, p.username, u.email)
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE p.id = auth.uid()
      ),
      ''
    )
  );
$$;

-- Surcharge legacy (p_email ignoré si session auth.uid présente)
CREATE OR REPLACE FUNCTION public.signup_get_registration(p_route_id text, p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.signup_get_registration(p_route_id);
$$;

CREATE OR REPLACE FUNCTION public.signup_list_registered_routes()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'routes',
    coalesce(
      (
        SELECT jsonb_agg(s.route_id ORDER BY s.route_id)
        FROM public.signups s
        WHERE s.user_id = auth.uid()
          AND s.status IN ('joined', 'waiting')
      ),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.signup_list_registered_routes(p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.signup_list_registered_routes();
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

  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.k, x.obj->>'display_name'), '[]'::jsonb) INTO part
  FROM (
    SELECT DISTINCT ON (sq.k)
      sq.k,
      sq.obj
    FROM (
      SELECT
        0 AS pri,
        lower(coalesce(sq_profile.obj->>'display_name', s.user_id::text)) AS k,
        sq_profile.obj
      FROM public.signups s
      CROSS JOIN LATERAL (
        SELECT coalesce(public._signup_profile_json(s.user_id), '{}'::jsonb) AS obj
      ) sq_profile
      WHERE s.route_id = v_rid AND s.status = 'joined'
      UNION ALL
      SELECT
        1 AS pri,
        lower(trim(i.display_name)),
        jsonb_build_object(
          'pseudo', trim(i.display_name),
          'username', null,
          'display_name', trim(i.display_name),
          'cyclist_level', null,
          'city', null
        )
      FROM public.imported_participant_names i
      WHERE i.route_id = v_rid AND length(trim(i.display_name)) > 0
    ) sq
    ORDER BY sq.k, sq.pri, sq.obj->>'display_name'
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
    SELECT coalesce(jsonb_agg(x.obj ORDER BY x.k, x.obj->>'display_name'), '[]'::jsonb) INTO part
    FROM (
      SELECT DISTINCT ON (sq.k) sq.k, sq.obj
      FROM (
        SELECT
          0 AS pri,
          lower(coalesce(sq_profile.obj->>'display_name', s.user_id::text)) AS k,
          sq_profile.obj
        FROM public.signups s
        CROSS JOIN LATERAL (
          SELECT coalesce(public._signup_profile_json(s.user_id), '{}'::jsonb) AS obj
        ) sq_profile
        WHERE s.route_id = rid AND s.status = 'joined'
        UNION ALL
        SELECT
          1 AS pri,
          lower(trim(i.display_name)),
          jsonb_build_object(
            'pseudo', trim(i.display_name),
            'username', null,
            'display_name', trim(i.display_name),
            'cyclist_level', null,
            'city', null
          )
        FROM public.imported_participant_names i
        WHERE i.route_id = rid AND length(trim(i.display_name)) > 0
      ) sq
      ORDER BY sq.k, sq.pri, sq.obj->>'display_name'
    ) x;

    SELECT coalesce(
      jsonb_agg(
        coalesce(public._signup_profile_json(s.user_id), '{}'::jsonb)
        ORDER BY s.created_at ASC
      ),
      '[]'::jsonb
    ) INTO wl
    FROM public.signups s
    WHERE s.route_id = rid AND s.status = 'waiting';

    out := out || jsonb_build_object(
      rid,
      jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'waitlist', coalesce(wl, '[]'::jsonb))
    );
  END LOOP;

  RETURN out;
END;
$$;

-- Legacy : inscription par e-mail → compte auth requis (délègue à toggle_signup)
DROP FUNCTION IF EXISTS public.signup_register(text, text, text);
DROP FUNCTION IF EXISTS public.signup_register(text, text, text, text);
DROP FUNCTION IF EXISTS public.signup_register(text, text, text, text, text);

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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  UPDATE public.profiles p
  SET
    pseudo = coalesce(nullif(trim(p_pseudo), ''), p.pseudo),
    cyclist_level = coalesce(nullif(trim(p_cyclist_level), ''), p.cyclist_level),
    city = coalesce(nullif(trim(p_participant_city), ''), p.city)
  WHERE p.id = auth.uid();

  RETURN public.toggle_signup(p_route_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_unregister(p_route_id text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_was_main boolean;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT (s.status = 'joined') INTO v_was_main
  FROM public.signups s
  WHERE s.route_id = v_rid AND s.user_id = auth.uid() AND s.status IN ('joined', 'waiting')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT public.get_display_name(p.pseudo, p.username, u.email)
  INTO v_name
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = auth.uid();

  UPDATE public.signups
  SET status = 'cancelled'
  WHERE route_id = v_rid AND user_id = auth.uid() AND status IN ('joined', 'waiting');

  IF v_was_main THEN
    PERFORM public._signup_promote_waitlist(v_rid);
  END IF;

  RETURN jsonb_build_object('ok', true, 'pseudo', coalesce(v_name, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.signup_is_joined(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_get_registration(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_get_registration(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_registered_routes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_registered_routes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_for_route(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_register(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_unregister(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_is_joined(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_get_registration(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_get_registration(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_registered_routes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_registered_routes(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_for_route(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_register(text, text, text, text, text) TO anon, authenticated, service_role;GRANT EXECUTE ON FUNCTION public.signup_unregister(text, text) TO anon, authenticated, service_role;
