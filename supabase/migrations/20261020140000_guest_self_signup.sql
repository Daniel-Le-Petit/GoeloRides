-- ============================================================================
-- GoëloRides — Inscription publique invité (sans compte)
-- ============================================================================
-- RPC distinctes de guest_participant_add (réservée admin / Ride Leader).
-- Jeton d'annulation personnel (hash stocké) — jamais d'annulation par pseudo seul.
-- Capacité : membres (signups) + invités actifs hors liste d'attente.
-- Anti-abus : IP (headers PostgREST) + client_key + plafonds route (client_key seul insuffisant).
-- Concurrence : verrou transactionnel par sortie avant décision capacité.
-- Waitlist : file FIFO unifiée membres+invités, une promotion par place libérée.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Colonnes pour auto-inscription / annulation / file d'attente
-- ---------------------------------------------------------------------------
ALTER TABLE public.guest_participants
  ADD COLUMN IF NOT EXISTS manage_token_hash text,
  ADD COLUMN IF NOT EXISTS client_key_hash text,
  ADD COLUMN IF NOT EXISTS waitlist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

COMMENT ON COLUMN public.guest_participants.manage_token_hash IS
  'SHA-256 hex du jeton d''annulation (jamais le jeton en clair).';
COMMENT ON COLUMN public.guest_participants.client_key_hash IS
  'Empreinte du client (visitor session) — secondaire anti-doublon, pas seule barrière.';
COMMENT ON COLUMN public.guest_participants.waitlist IS
  'true = liste d''attente (places principales pleines).';
COMMENT ON COLUMN public.guest_participants.canceled_at IS
  'Désinscription (soft) — NULL = inscription active.';

CREATE INDEX IF NOT EXISTS guest_participants_manage_token_hash_idx
  ON public.guest_participants (manage_token_hash)
  WHERE manage_token_hash IS NOT NULL AND canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS guest_participants_route_active_idx
  ON public.guest_participants (route_id)
  WHERE canceled_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS guest_participants_unique_active_client
  ON public.guest_participants (route_id, client_key_hash)
  WHERE canceled_at IS NULL AND client_key_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Journal anti-abus (IP + client + route)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guest_signup_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key_hash text NOT NULL,
  ip_hash         text,
  route_id        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_signup_attempts
  ADD COLUMN IF NOT EXISTS ip_hash text;

CREATE INDEX IF NOT EXISTS guest_signup_attempts_client_created_idx
  ON public.guest_signup_attempts (client_key_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_signup_attempts_route_created_idx
  ON public.guest_signup_attempts (route_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_signup_attempts_ip_created_idx
  ON public.guest_signup_attempts (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE public.guest_signup_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_signup_attempts_deny_all" ON public.guest_signup_attempts;
CREATE POLICY "guest_signup_attempts_deny_all"
  ON public.guest_signup_attempts FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "guest_signup_attempts_service_role_all" ON public.guest_signup_attempts;
CREATE POLICY "guest_signup_attempts_service_role_all"
  ON public.guest_signup_attempts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Helpers crypto / normalise / IP requête
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._guest_hash_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public._guest_hash_token(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._guest_normalize_pseudo(p_pseudo text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := trim(coalesce(p_pseudo, ''));
BEGIN
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := regexp_replace(v, '[[:cntrl:]]', '', 'g');
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._guest_normalize_pseudo(text) FROM PUBLIC;

-- IP client via headers PostgREST / Supabase (jamais exposée en clair dans les réponses)
CREATE OR REPLACE FUNCTION public._guest_request_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers json;
  v_raw text;
  v_ip text;
BEGIN
  BEGIN
    v_raw := nullif(current_setting('request.headers', true), '');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_raw IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_headers := v_raw::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  v_ip := nullif(trim(coalesce(
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip',
    split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)
  )), '');

  IF v_ip IS NULL OR length(v_ip) > 64 THEN
    RETURN NULL;
  END IF;

  RETURN v_ip;
END;
$$;

REVOKE ALL ON FUNCTION public._guest_request_ip() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._guest_main_count(p_route_id text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT count(*)::int
      FROM (
        SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
        FROM public.signups s
        WHERE s.route_id = trim(p_route_id) AND s.user_id IS NOT NULL
        ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
      ) latest
      WHERE latest.status = 'joined' AND latest.canceled_at IS NULL
    )
    +
    (
      SELECT count(*)::int
      FROM public.guest_participants g
      WHERE g.route_id = trim(p_route_id)
        AND g.canceled_at IS NULL
        AND coalesce(g.waitlist, false) = false
    );
$$;

REVOKE ALL ON FUNCTION public._guest_main_count(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._guest_waitlist_count(p_route_id text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT count(*)::int
      FROM (
        SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
        FROM public.signups s
        WHERE s.route_id = trim(p_route_id) AND s.user_id IS NOT NULL
        ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
      ) latest
      WHERE latest.status = 'waiting' AND latest.canceled_at IS NULL
    )
    +
    (
      SELECT count(*)::int
      FROM public.guest_participants g
      WHERE g.route_id = trim(p_route_id)
        AND g.canceled_at IS NULL
        AND coalesce(g.waitlist, false) = true
    );
$$;

REVOKE ALL ON FUNCTION public._guest_waitlist_count(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Garde-fous sortie ouverte au public (liste blanche statut / visibilité)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._guest_route_is_open_for_public(p_route_id text)
RETURNS TABLE (
  ok boolean,
  error_code text,
  max_participants int,
  main_count int,
  ride_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_fc jsonb;
  v_status text;
  v_vis text;
  v_max int;
  v_iso text;
  v_ride date;
  v_today date;
  v_main int;
BEGIN
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN QUERY SELECT false, 'invalid_route'::text, null::int, 0, null::date;
    RETURN;
  END IF;

  SELECT coalesce(r.front_config, '{}'::jsonb)
  INTO v_fc
  FROM public.routes r
  WHERE r.id = v_rid AND r.is_active;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'route_not_found'::text, null::int, 0, null::date;
    RETURN;
  END IF;

  v_status := lower(trim(coalesce(v_fc->>'sortieStatus', 'open')));
  v_vis := lower(trim(coalesce(v_fc->>'visibility', 'public')));

  -- Liste blanche : uniquement sorties publiques ouvertes / publiées
  IF v_vis NOT IN ('public', '') THEN
    IF v_vis IN ('invitation', 'invite', 'invitation_only') THEN
      RETURN QUERY SELECT false, 'invitation_only'::text, null::int, 0, null::date;
    ELSE
      RETURN QUERY SELECT false, 'private_route'::text, null::int, 0, null::date;
    END IF;
    RETURN;
  END IF;

  IF v_status IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN
    RETURN QUERY SELECT false, 'sortie_cancelled'::text, null::int, 0, null::date;
    RETURN;
  END IF;

  IF v_status NOT IN ('open', 'publiee', 'published', '') THEN
    -- closed, draft, brouillon, hidden, etc.
    RETURN QUERY SELECT false, 'sortie_closed'::text, null::int, 0, null::date;
    RETURN;
  END IF;

  v_iso := nullif(trim(coalesce(v_fc->>'rideDateIso', '')), '');
  IF v_iso IS NOT NULL AND v_iso ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_ride := v_iso::date;
    v_today := (timezone('Europe/Paris', now()))::date;
    IF v_ride < v_today THEN
      RETURN QUERY SELECT false, 'sortie_passed'::text, null::int, 0, v_ride;
      RETURN;
    END IF;
  END IF;

  v_max := nullif(
    regexp_replace(trim(coalesce(v_fc->>'maxParticipants', '')), '[^0-9]', '', 'g'),
    ''
  )::int;
  IF v_max IS NOT NULL AND v_max < 1 THEN
    v_max := null;
  END IF;

  v_main := public._guest_main_count(v_rid);

  RETURN QUERY SELECT true, null::text, v_max, coalesce(v_main, 0), v_ride;
END;
$$;

REVOKE ALL ON FUNCTION public._guest_route_is_open_for_public(text) FROM PUBLIC;

-- Capacité partagée : membres joined + invités confirmés
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
    public._guest_main_count(v_rid);
END;
$$;

-- ---------------------------------------------------------------------------
-- Promotion waitlist unifiée (FIFO membres + invités) — une place à la fois
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._goelo_promote_one_waitlist_seat(p_route_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_cap record;
  v_kind text;
  v_id uuid;
BEGIN
  SELECT * INTO v_cap FROM public._signup_route_capacity(v_rid);
  IF NOT v_cap.route_ok OR v_cap.max_participants IS NULL THEN
    RETURN false;
  END IF;
  IF v_cap.main_count >= v_cap.max_participants THEN
    RETURN false;
  END IF;

  -- Prochaine place : plus ancienne inscription en attente (membre ou invité, FIFO)
  SELECT q.kind, q.id
  INTO v_kind, v_id
  FROM (
    SELECT 'member'::text AS kind, s.id, s.created_at
    FROM public.signups s
    WHERE s.route_id = v_rid
      AND s.status = 'waiting'
      AND s.canceled_at IS NULL
    UNION ALL
    SELECT 'guest'::text, g.id, g.created_at
    FROM public.guest_participants g
    WHERE g.route_id = v_rid
      AND g.canceled_at IS NULL
      AND coalesce(g.waitlist, false) = true
  ) q
  ORDER BY q.created_at ASC NULLS LAST, q.id ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_kind = 'member' THEN
    UPDATE public.signups
    SET status = 'joined',
        canceled_at = NULL
    WHERE id = v_id
      AND status = 'waiting'
      AND canceled_at IS NULL;
    RETURN FOUND;
  END IF;

  UPDATE public.guest_participants
  SET waitlist = false
  WHERE id = v_id
    AND canceled_at IS NULL
    AND coalesce(waitlist, false) = true;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public._goelo_promote_one_waitlist_seat(text) FROM PUBLIC;

-- Remplace la promotion membres-seule : remplit jusqu'à capacité, une place à la fois
CREATE OR REPLACE FUNCTION public._signup_promote_waitlist(p_route_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_cap record;
  v_promoted boolean;
  v_guard int := 0;
BEGIN
  -- Sérialise les promotions pour cette sortie
  PERFORM pg_advisory_xact_lock(hashtext('goelo_promote:' || v_rid));

  LOOP
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 200;

    SELECT * INTO v_cap FROM public._signup_route_capacity(v_rid);
    EXIT WHEN NOT v_cap.route_ok;
    EXIT WHEN v_cap.max_participants IS NULL;
    EXIT WHEN v_cap.main_count >= v_cap.max_participants;

    v_promoted := public._goelo_promote_one_waitlist_seat(v_rid);
    EXIT WHEN NOT v_promoted;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Liste publique des invités (confirmés vs waitlist, pas de téléphone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_participants_list_for_route(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_part jsonb;
  v_wl   jsonb;
  v_cnt  int;
  v_wl_cnt int;
BEGIN
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'participants', '[]'::jsonb,
      'waitlist', '[]'::jsonb,
      'count', 0,
      'waitlist_count', 0
    );
  END IF;

  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'route_id', g.route_id,
          'first_name', trim(g.first_name),
          'last_name', nullif(trim(g.last_name), ''),
          'is_guest', true,
          'source', 'guest',
          'waitlist', false
        )
        ORDER BY g.created_at ASC
      ),
      '[]'::jsonb
    ),
    count(*)::int
  INTO v_part, v_cnt
  FROM public.guest_participants g
  WHERE g.route_id = v_rid
    AND g.canceled_at IS NULL
    AND coalesce(g.waitlist, false) = false;

  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'route_id', g.route_id,
          'first_name', trim(g.first_name),
          'last_name', nullif(trim(g.last_name), ''),
          'is_guest', true,
          'source', 'guest',
          'waitlist', true
        )
        ORDER BY g.created_at ASC
      ),
      '[]'::jsonb
    ),
    count(*)::int
  INTO v_wl, v_wl_cnt
  FROM public.guest_participants g
  WHERE g.route_id = v_rid
    AND g.canceled_at IS NULL
    AND coalesce(g.waitlist, false) = true;

  RETURN jsonb_build_object(
    'ok', true,
    'participants', v_part,
    'waitlist', v_wl,
    'count', v_cnt,
    'waitlist_count', v_wl_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_participants_list_for_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participants_list_for_route(text)
  TO anon, authenticated, service_role;

-- Ancienne promo invités seule : délègue à la file unifiée
CREATE OR REPLACE FUNCTION public._guest_promote_waitlist(p_route_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._signup_promote_waitlist(p_route_id);
END;
$$;

REVOKE ALL ON FUNCTION public._guest_promote_waitlist(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Inscription publique (anon)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_self_register(
  p_route_id   text,
  p_pseudo     text,
  p_client_key text DEFAULT NULL,
  p_hp         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rid     text := trim(p_route_id);
  v_pseudo  text := public._guest_normalize_pseudo(p_pseudo);
  v_client  text := nullif(trim(coalesce(p_client_key, '')), '');
  v_ck_hash text;
  v_ip      text;
  v_ip_hash text;
  v_gate    record;
  v_waitlist boolean := false;
  v_token   text;
  v_token_hash text;
  v_row     public.guest_participants%ROWTYPE;
  v_main    int;
  v_wl_cnt  int;
  v_attempts_client int;
  v_attempts_route int;
  v_attempts_ip int;
  v_attempts_ip_route int;
  v_last_ip_at timestamptz;
BEGIN
  -- Honeypot : bots → faux succès silencieux (aucune écriture)
  IF nullif(trim(coalesce(p_hp, '')), '') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'honeypot', true,
      'waitlist', false,
      'confirmed_count', 0,
      'waitlist_count', 0,
      'count', 0,
      'participant', jsonb_build_object(
        'id', gen_random_uuid(),
        'route_id', v_rid,
        'first_name', left(v_pseudo, 40),
        'is_guest', true,
        'source', 'guest',
        'waitlist', false
      )
    );
  END IF;

  IF length(v_pseudo) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pseudo_too_short');
  END IF;
  IF length(v_pseudo) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pseudo_too_long');
  END IF;
  IF v_pseudo !~ '^[[:alnum:]À-ÖØ-öø-ÿĀ-žḀ-ỿ ''’\-_.]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pseudo_invalid');
  END IF;

  IF v_client IS NULL OR length(v_client) < 8 OR length(v_client) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_key_required');
  END IF;

  v_ck_hash := public._guest_hash_token(v_client);
  v_ip := public._guest_request_ip();
  v_ip_hash := CASE WHEN v_ip IS NULL THEN NULL ELSE public._guest_hash_token(v_ip) END;

  -- Sérialise inscriptions + lecture capacité pour cette sortie (anti-course)
  PERFORM pg_advisory_xact_lock(hashtext('goelo_guest_reg:' || coalesce(v_rid, '')));

  SELECT * INTO v_gate FROM public._guest_route_is_open_for_public(v_rid);
  IF NOT v_gate.ok THEN
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_gate.error_code, 'invalid_route'));
  END IF;

  -- Déjà inscrit (même client) sur cette sortie
  IF EXISTS (
    SELECT 1 FROM public.guest_participants g
    WHERE g.route_id = v_rid
      AND g.client_key_hash = v_ck_hash
      AND g.canceled_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END IF;

  -- ---- Anti-abus multi-couches (IP prioritaire ; client_key secondaire) ----
  IF v_ip_hash IS NOT NULL THEN
    SELECT max(a.created_at) INTO v_last_ip_at
    FROM public.guest_signup_attempts a
    WHERE a.ip_hash = v_ip_hash;

    IF v_last_ip_at IS NOT NULL AND v_last_ip_at > now() - interval '2 seconds' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;

    SELECT count(*)::int INTO v_attempts_ip
    FROM public.guest_signup_attempts a
    WHERE a.ip_hash = v_ip_hash
      AND a.created_at > now() - interval '1 hour';

    IF v_attempts_ip >= 10 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;

    SELECT count(*)::int INTO v_attempts_ip_route
    FROM public.guest_signup_attempts a
    WHERE a.ip_hash = v_ip_hash
      AND a.route_id = v_rid
      AND a.created_at > now() - interval '1 hour';

    IF v_attempts_ip_route >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
  END IF;

  SELECT count(*)::int INTO v_attempts_client
  FROM public.guest_signup_attempts a
  WHERE a.client_key_hash = v_ck_hash
    AND a.created_at > now() - interval '24 hours';

  IF v_attempts_client >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT count(*)::int INTO v_attempts_route
  FROM public.guest_signup_attempts a
  WHERE a.route_id = v_rid
    AND a.created_at > now() - interval '1 hour';

  IF v_attempts_route >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  -- Sans IP (headers absents) : plafond route plus strict pour limiter le renouvellement de client_key
  IF v_ip_hash IS NULL AND v_attempts_route >= 15 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  INSERT INTO public.guest_signup_attempts (client_key_hash, ip_hash, route_id)
  VALUES (v_ck_hash, v_ip_hash, v_rid);

  -- Recompte sous verrou : jamais dépasser max sur la liste principale
  v_main := public._guest_main_count(v_rid);
  IF v_gate.max_participants IS NOT NULL AND v_main >= v_gate.max_participants THEN
    v_waitlist := true;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := public._guest_hash_token(v_token);

  BEGIN
    INSERT INTO public.guest_participants (
      route_id, first_name, last_name, phone, created_by,
      manage_token_hash, client_key_hash, waitlist, canceled_at
    )
    VALUES (
      v_rid, v_pseudo, NULL, NULL, NULL,
      v_token_hash, v_ck_hash, v_waitlist, NULL
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END;

  -- Sécurité finale : si une course a quand même surbooké la principale, basculer en waitlist
  IF NOT v_waitlist AND v_gate.max_participants IS NOT NULL THEN
    v_main := public._guest_main_count(v_rid);
    IF v_main > v_gate.max_participants THEN
      UPDATE public.guest_participants
      SET waitlist = true
      WHERE id = v_row.id AND canceled_at IS NULL;
      v_waitlist := true;
      v_row.waitlist := true;
    END IF;
  END IF;

  v_main := public._guest_main_count(v_rid);
  v_wl_cnt := public._guest_waitlist_count(v_rid);

  RETURN jsonb_build_object(
    'ok', true,
    'waitlist', v_waitlist,
    'manage_token', v_token,
    'confirmed_count', v_main,
    'waitlist_count', v_wl_cnt,
    'count', v_main,
    'participant', jsonb_build_object(
      'id', v_row.id,
      'route_id', v_row.route_id,
      'first_name', trim(v_row.first_name),
      'last_name', null,
      'is_guest', true,
      'source', 'guest',
      'waitlist', v_waitlist
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_self_register(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_self_register(text, text, text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.guest_self_register(text, text, text, text) IS
  'Inscription publique sans compte. Anti-abus IP+client+route, capacité atomique, manage_token une fois.';

-- ---------------------------------------------------------------------------
-- Annulation publique par jeton personnel uniquement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_self_cancel(
  p_manage_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text := trim(coalesce(p_manage_token, ''));
  v_hash  text;
  v_row   public.guest_participants%ROWTYPE;
  v_was_main boolean;
  v_main  int;
  v_wl_cnt int;
BEGIN
  IF length(v_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_hash := public._guest_hash_token(v_token);

  SELECT * INTO v_row
  FROM public.guest_participants g
  WHERE g.manage_token_hash = v_hash
    AND g.canceled_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_was_main := coalesce(v_row.waitlist, false) = false;

  UPDATE public.guest_participants
  SET canceled_at = now()
  WHERE id = v_row.id
    AND canceled_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Une seule file unifiée : une (ou N places libres) promotion FIFO membres+invités
  IF v_was_main THEN
    PERFORM public._signup_promote_waitlist(v_row.route_id);
  END IF;

  v_main := public._guest_main_count(v_row.route_id);
  v_wl_cnt := public._guest_waitlist_count(v_row.route_id);

  RETURN jsonb_build_object(
    'ok', true,
    'route_id', v_row.route_id,
    'confirmed_count', v_main,
    'waitlist_count', v_wl_cnt,
    'count', v_main
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_self_cancel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_self_cancel(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.guest_self_cancel(text) IS
  'Annule une inscription invité uniquement avec le jeton personnel (pas le pseudo).';

-- Admin add : reste sans GRANT anon
REVOKE ALL ON FUNCTION public.guest_participant_add(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participant_add(text, text, text, text)
  TO authenticated, service_role;
