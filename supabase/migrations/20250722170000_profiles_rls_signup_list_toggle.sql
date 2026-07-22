-- ============================================================================
-- GoëloRides — Fix RLS profiles + signup_list_for_route + toggle_signup
-- ============================================================================
-- 1) profiles : policies RLS propres (insert/update/select de sa propre ligne)
-- 2) signup_list_for_route : plus de imported_participant_names (table absente)
-- 3) toggle_signup : toggle réel (added/removed), plus d'erreur already_registered
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS public.profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Droits table (RLS filtre ensuite les lignes)
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Supprimer toutes les policies existantes pour éviter les contradictions
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END;
$$;

-- Lecture de sa propre ligne (requis aussi pour upsert ON CONFLICT)
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Création de son propre profil
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Modification de son propre profil uniquement
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Service role (dashboard / backends)
CREATE POLICY "profiles_service_role_all"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "profiles_select_own" ON public.profiles IS
  'Utilisateur authentifié : lecture de sa ligne profiles.';
COMMENT ON POLICY "profiles_insert_own" ON public.profiles IS
  'Utilisateur authentifié : création de sa propre ligne (upsert client).';
COMMENT ON POLICY "profiles_update_own" ON public.profiles IS
  'Utilisateur authentifié : mise à jour de sa propre ligne uniquement.';

-- ---------------------------------------------------------------------------
-- Helpers affichage participant (pseudo → username → email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_initials(p_username text, p_pseudo text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_src text;
  v_parts text[];
  v_a text;
  v_b text;
BEGIN
  -- Initiales depuis username (ex. "Daniel Le Petit" → "DL"), sinon pseudo
  v_src := nullif(trim(coalesce(p_username, '')), '');
  IF v_src IS NULL THEN
    v_src := nullif(trim(coalesce(p_pseudo, '')), '');
  END IF;
  IF v_src IS NULL THEN
    RETURN '?';
  END IF;

  v_parts := regexp_split_to_array(v_src, '\s+');
  v_a := left(v_parts[1], 1);
  IF array_length(v_parts, 1) >= 2 THEN
    v_b := left(v_parts[array_length(v_parts, 1)], 1);
  ELSE
    v_b := CASE WHEN length(v_parts[1]) >= 2 THEN substr(v_parts[1], 2, 1) ELSE v_a END;
  END IF;

  RETURN upper(v_a || v_b);
END;
$$;

CREATE OR REPLACE FUNCTION public._signup_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_id', p.id,
    'pseudo', nullif(trim(p.pseudo), ''),
    'username', nullif(trim(p.username), ''),
    'display_name', coalesce(
      nullif(trim(p.pseudo), ''),
      nullif(trim(p.username), ''),
      nullif(split_part(lower(trim(coalesce(u.email, ''))), '@', 1), ''),
      '?'
    ),
    'initials', public.profile_initials(p.username, p.pseudo),
    'cyclist_level', to_jsonb(nullif(trim(p.cyclist_level), '')),
    'city', to_jsonb(nullif(trim(p.city), ''))
  )
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.profile_initials(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._signup_profile_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_initials(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._signup_profile_json(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. signup_list_for_route — profiles + signups uniquement
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

  SELECT coalesce(
    jsonb_agg(x.obj ORDER BY x.created_at ASC NULLS LAST, x.sort_key),
    '[]'::jsonb
  )
  INTO part
  FROM (
    SELECT
      lower(coalesce(
        nullif(trim(pr.obj->>'pseudo'), ''),
        nullif(trim(pr.obj->>'username'), ''),
        latest.user_id::text
      )) AS sort_key,
      latest.created_at,
      coalesce(pr.obj, '{}'::jsonb) || jsonb_build_object(
        'user_id', latest.user_id,
        'created_at', latest.created_at,
        'status', latest.status,
        'pseudo', coalesce(
          nullif(trim(pr.obj->>'pseudo'), ''),
          nullif(trim(pr.obj->>'username'), ''),
          nullif(trim(pr.obj->>'display_name'), ''),
          '?'
        ),
        'username', nullif(trim(pr.obj->>'username'), ''),
        'initials', coalesce(
          nullif(trim(pr.obj->>'initials'), ''),
          public.profile_initials(pr.obj->>'username', pr.obj->>'pseudo')
        ),
        'display_name', coalesce(
          nullif(trim(pr.obj->>'display_name'), ''),
          nullif(trim(pr.obj->>'pseudo'), ''),
          nullif(trim(pr.obj->>'username'), ''),
          '?'
        )
      ) AS obj
    FROM (
      SELECT DISTINCT ON (s.user_id) s.*
      FROM public.signups s
      WHERE s.route_id = v_rid
        AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    CROSS JOIN LATERAL (
      SELECT public._signup_profile_json(latest.user_id) AS obj
    ) pr
    WHERE latest.status = 'joined'
      AND latest.canceled_at IS NULL
  ) x;

  SELECT count(*)::int INTO cnt
  FROM jsonb_array_elements(coalesce(part, '[]'::jsonb));

  RETURN jsonb_build_object(
    'participants', coalesce(part, '[]'::jsonb),
    'count', cnt
  );
END;
$$;

-- signup_list_all_names : même architecture (sans imported_participant_names)
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
  v_payload jsonb;
BEGIN
  FOR rid IN SELECT r.id FROM public.routes r WHERE r.is_active ORDER BY r.sort_order, r.id
  LOOP
    v_payload := public.signup_list_for_route(rid);
    part := coalesce(v_payload->'participants', '[]'::jsonb);

    SELECT coalesce(
      jsonb_agg(
        coalesce(public._signup_profile_json(latest.user_id), '{}'::jsonb)
          || jsonb_build_object(
            'user_id', latest.user_id,
            'created_at', latest.created_at,
            'status', latest.status
          )
        ORDER BY latest.created_at ASC NULLS LAST
      ),
      '[]'::jsonb
    )
    INTO wl
    FROM (
      SELECT DISTINCT ON (s.user_id) s.*
      FROM public.signups s
      WHERE s.route_id = rid AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    WHERE latest.status = 'waiting'
      AND latest.canceled_at IS NULL;

    out := out || jsonb_build_object(
      rid,
      jsonb_build_object(
        'participants', coalesce(part, '[]'::jsonb),
        'waitlist', coalesce(wl, '[]'::jsonb)
      )
    );
  END LOOP;

  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. toggle_signup — toggle added / removed (plus d'erreur already_registered)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_signup(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_rid          text := trim(p_route_id);
  v_now          timestamptz := now();
  v_cap          record;
  v_latest       public.signups;
  v_waitlist     boolean := false;
  v_cnt          int;
  v_was_joined   boolean := false;
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

  v_latest := public._signup_latest_row(v_rid, v_uid);

  -- Déjà inscrit (dernière action active) → désinscription
  IF v_latest.id IS NOT NULL
     AND v_latest.status IN ('joined', 'waiting')
     AND v_latest.canceled_at IS NULL THEN
    v_was_joined := (v_latest.status = 'joined');

    UPDATE public.signups
    SET status = 'cancelled',
        canceled_at = v_now
    WHERE id = v_latest.id;

    IF v_was_joined THEN
      PERFORM public._signup_promote_waitlist(v_rid);
    END IF;

    SELECT count(*)::int INTO v_cnt
    FROM (
      SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
      FROM public.signups s
      WHERE s.route_id = v_rid AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    WHERE latest.status = 'joined' AND latest.canceled_at IS NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'removed',
      'joined', false,
      'count', v_cnt
    );
  END IF;

  -- Non inscrit → inscription (historique conservé)
  IF v_cap.max_participants IS NOT NULL AND v_cap.main_count >= v_cap.max_participants THEN
    v_waitlist := true;
  END IF;

  UPDATE public.signups
  SET status = 'cancelled',
      canceled_at = coalesce(canceled_at, v_now)
  WHERE route_id = v_rid
    AND user_id = v_uid
    AND status IN ('joined', 'waiting')
    AND canceled_at IS NULL;

  BEGIN
    INSERT INTO public.signups (route_id, user_id, status, created_at, canceled_at)
    VALUES (
      v_rid,
      v_uid,
      CASE WHEN v_waitlist THEN 'waiting' ELSE 'joined' END,
      v_now,
      NULL
    );
  EXCEPTION WHEN unique_violation THEN
    -- Course concurrente : une ligne active existe déjà → la retirer (toggle)
    UPDATE public.signups
    SET status = 'cancelled',
        canceled_at = v_now
    WHERE route_id = v_rid
      AND user_id = v_uid
      AND status IN ('joined', 'waiting')
      AND canceled_at IS NULL;

    SELECT count(*)::int INTO v_cnt
    FROM (
      SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
      FROM public.signups s
      WHERE s.route_id = v_rid AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    WHERE latest.status = 'joined' AND latest.canceled_at IS NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'removed',
      'joined', false,
      'count', v_cnt
    );
  END;

  SELECT count(*)::int INTO v_cnt
  FROM (
    SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
    FROM public.signups s
    WHERE s.route_id = v_rid AND s.user_id IS NOT NULL
    ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
  ) latest
  WHERE latest.status = 'joined' AND latest.canceled_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'added',
    'joined', NOT v_waitlist,
    'waitlist', v_waitlist,
    'count', v_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_list_for_route(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_list_for_route(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text) TO anon, authenticated, service_role;
