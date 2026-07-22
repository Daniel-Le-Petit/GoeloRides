-- ============================================================================
-- GoëloRides — Inscriptions : état = dernière action (user_id + route_id)
-- ============================================================================
-- Problème : plusieurs lignes signups pour le même couple user_id / route_id.
-- Une ancienne ligne status='joined' ne doit plus bloquer "Je participe" si la
-- dernière action est une annulation.
--
-- Règle :
--   dernière ligne (created_at DESC, id DESC) ;
--   inscription active ⇔ status = 'joined' AND canceled_at IS NULL
--   (status = 'waiting' + canceled_at IS NULL = inscrit en liste d'attente,
--    bouton "J'annule" / toggle unjoin inchangé).
--
-- Ne supprime aucune donnée existante.
-- ============================================================================

-- Horodatage d'annulation (peut avoir été droppé par 20250627120000)
ALTER TABLE public.signups
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- Aligner canceled_at sur les annulations déjà marquées via status
UPDATE public.signups
SET canceled_at = coalesce(canceled_at, created_at, now())
WHERE status = 'cancelled'
  AND canceled_at IS NULL;

-- ---------------------------------------------------------------------------
-- Helper : dernière action pour (route, user)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._signup_latest_row(p_route_id text, p_user_id uuid)
RETURNS public.signups
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.signups s
  WHERE s.route_id = trim(p_route_id)
    AND s.user_id = p_user_id
  ORDER BY s.created_at DESC NULLS LAST, s.id DESC
  LIMIT 1;
$$;

-- Inscription active (principale) selon la règle métier
CREATE OR REPLACE FUNCTION public._signup_latest_is_joined(p_route_id text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public._signup_latest_row(p_route_id, p_user_id) s
    WHERE s.status = 'joined'
      AND s.canceled_at IS NULL
  );
$$;

-- Inscrit ou en liste d'attente (pour toggle / bouton)
CREATE OR REPLACE FUNCTION public._signup_latest_is_registered(p_route_id text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public._signup_latest_row(p_route_id, p_user_id) s
    WHERE s.status IN ('joined', 'waiting')
      AND s.canceled_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public._signup_latest_row(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._signup_latest_is_joined(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._signup_latest_is_registered(text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Capacité : compter uniquement les users dont la dernière action est joined
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
      FROM (
        SELECT DISTINCT ON (s.user_id) s.user_id, s.status, s.canceled_at
        FROM public.signups s
        WHERE s.route_id = v_rid
          AND s.user_id IS NOT NULL
        ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
      ) latest
      WHERE latest.status = 'joined'
        AND latest.canceled_at IS NULL
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- signup_is_joined : dernière action seulement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_is_joined(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rid text := trim(p_route_id);
  v_latest public.signups;
BEGIN
  IF v_uid IS NULL OR v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('joined', false);
  END IF;

  v_latest := public._signup_latest_row(v_rid, v_uid);

  RETURN jsonb_build_object(
    'joined',
    (
      v_latest.id IS NOT NULL
      AND v_latest.status = 'joined'
      AND v_latest.canceled_at IS NULL
    ),
    'registered',
    (
      v_latest.id IS NOT NULL
      AND v_latest.status IN ('joined', 'waiting')
      AND v_latest.canceled_at IS NULL
    ),
    'on_waitlist',
    (
      v_latest.id IS NOT NULL
      AND v_latest.status = 'waiting'
      AND v_latest.canceled_at IS NULL
    ),
    'status',
    CASE
      WHEN v_latest.id IS NULL THEN null
      ELSE v_latest.status
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- toggle_signup : décide join/unjoin sur la dernière ligne uniquement
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

  -- Dernière action = inscription active (joined/waiting + pas d'annulation)
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
      'action', 'unjoined',
      'joined', false,
      'count', v_cnt
    );
  END IF;

  -- Dernière action annulée (ou aucune) → nouvelle inscription (historique conservé)
  IF v_cap.max_participants IS NOT NULL AND v_cap.main_count >= v_cap.max_participants THEN
    v_waitlist := true;
  END IF;

  -- Neutraliser d'éventuelles anciennes lignes encore "actives" (données incohérentes)
  -- sans les supprimer : on les marque cancelled pour respecter l'index unique partiel.
  UPDATE public.signups
  SET status = 'cancelled',
      canceled_at = coalesce(canceled_at, v_now)
  WHERE route_id = v_rid
    AND user_id = v_uid
    AND status IN ('joined', 'waiting')
    AND canceled_at IS NULL;

  INSERT INTO public.signups (route_id, user_id, status, created_at, canceled_at)
  VALUES (
    v_rid,
    v_uid,
    CASE WHEN v_waitlist THEN 'waiting' ELSE 'joined' END,
    v_now,
    NULL
  );

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
    'action', 'joined',
    'joined', NOT v_waitlist,
    'waitlist', v_waitlist,
    'count', v_cnt
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
END;
$$;

-- ---------------------------------------------------------------------------
-- Routes où l'utilisateur est encore inscrit (dernière action)
-- ---------------------------------------------------------------------------
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
        SELECT jsonb_agg(latest.route_id ORDER BY latest.route_id)
        FROM (
          SELECT DISTINCT ON (s.route_id)
            s.route_id,
            s.status,
            s.canceled_at
          FROM public.signups s
          WHERE s.user_id = auth.uid()
          ORDER BY s.route_id, s.created_at DESC NULLS LAST, s.id DESC
        ) latest
        WHERE latest.status IN ('joined', 'waiting')
          AND latest.canceled_at IS NULL
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

-- ---------------------------------------------------------------------------
-- Listes participants : une entrée par user, uniquement si dernière action joined
-- (pas de imported_participant_names — table absente ; voir 20250722170000)
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

  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.k, x.obj->>'display_name'), '[]'::jsonb) INTO part
  FROM (
    SELECT
      lower(coalesce(sq_profile.obj->>'display_name', latest.user_id::text)) AS k,
      coalesce(sq_profile.obj, '{}'::jsonb) AS obj
    FROM (
      SELECT DISTINCT ON (s.user_id) s.*
      FROM public.signups s
      WHERE s.route_id = v_rid AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    CROSS JOIN LATERAL (
      SELECT coalesce(public._signup_profile_json(latest.user_id), '{}'::jsonb) AS obj
    ) sq_profile
    WHERE latest.status = 'joined'
      AND latest.canceled_at IS NULL
  ) x;

  SELECT count(*)::int INTO cnt
  FROM jsonb_array_elements(coalesce(part, '[]'::jsonb));

  RETURN jsonb_build_object('participants', coalesce(part, '[]'::jsonb), 'count', cnt);
END;
$$;

-- Promotion waitlist : uniquement les waiting actifs (canceled_at IS NULL)
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
    WHERE s.route_id = v_rid
      AND s.status = 'waiting'
      AND s.canceled_at IS NULL
    ORDER BY s.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_next_id IS NULL;

    UPDATE public.signups
    SET status = 'joined',
        canceled_at = NULL
    WHERE id = v_next_id;

    v_cap.main_count := v_cap.main_count + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_is_joined(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_registered_routes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_registered_routes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_for_route(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_is_joined(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_registered_routes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_registered_routes(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_for_route(text) TO anon, authenticated, service_role;
