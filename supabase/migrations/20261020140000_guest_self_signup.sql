-- ============================================================================
-- GoëloRides — Inscription publique invité (sans compte)
-- ============================================================================
-- RPC distinctes de guest_participant_add (réservée admin / Ride Leader).
-- Jeton d'annulation personnel (hash stocké) — jamais d'annulation par pseudo seul.
-- Capacité : membres (signups) + invités actifs hors liste d'attente.
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
  'Empreinte du client (visitor session) pour anti-abus / anti-doublon.';
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

CREATE INDEX IF NOT EXISTS guest_participants_client_route_idx
  ON public.guest_participants (client_key_hash, route_id)
  WHERE canceled_at IS NULL AND client_key_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Journal anti-abus (inscriptions publiques)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guest_signup_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key_hash text NOT NULL,
  route_id    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_signup_attempts_client_created_idx
  ON public.guest_signup_attempts (client_key_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_signup_attempts_route_created_idx
  ON public.guest_signup_attempts (route_id, created_at DESC);

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
-- Helpers
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
  -- Espaces multiples → un seul
  v := regexp_replace(v, '\s+', ' ', 'g');
  -- Couper caractères de contrôle
  v := regexp_replace(v, '[[:cntrl:]]', '', 'g');
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._guest_normalize_pseudo(text) FROM PUBLIC;

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

  IF v_status IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN
    RETURN QUERY SELECT false, 'sortie_cancelled'::text, null::int, 0, null::date;
    RETURN;
  END IF;
  IF v_status IN ('closed', 'ferme', 'fermée') THEN
    RETURN QUERY SELECT false, 'sortie_closed'::text, null::int, 0, null::date;
    RETURN;
  END IF;
  IF v_status IN ('draft', 'brouillon', 'hidden') THEN
    RETURN QUERY SELECT false, 'sortie_closed'::text, null::int, 0, null::date;
    RETURN;
  END IF;
  IF v_vis IN ('private', 'prive', 'privee', 'privée') THEN
    RETURN QUERY SELECT false, 'private_route'::text, null::int, 0, null::date;
    RETURN;
  END IF;
  IF v_vis IN ('invitation', 'invite', 'invitation_only') THEN
    RETURN QUERY SELECT false, 'invitation_only'::text, null::int, 0, null::date;
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

  SELECT
    (
      SELECT count(*)::int
      FROM (
        SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
        FROM public.signups s
        WHERE s.route_id = v_rid AND s.user_id IS NOT NULL
        ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
      ) latest
      WHERE latest.status = 'joined' AND latest.canceled_at IS NULL
    )
    +
    (
      SELECT count(*)::int
      FROM public.guest_participants g
      WHERE g.route_id = v_rid
        AND g.canceled_at IS NULL
        AND coalesce(g.waitlist, false) = false
    )
  INTO v_main;

  RETURN QUERY SELECT true, null::text, v_max, coalesce(v_main, 0), v_ride;
END;
$$;

REVOKE ALL ON FUNCTION public._guest_route_is_open_for_public(text) FROM PUBLIC;

-- Capacité partagée : inclure les invités actifs (hors waitlist)
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
      )
      +
      (
        SELECT count(*)::int
        FROM public.guest_participants g
        WHERE g.route_id = v_rid
          AND g.canceled_at IS NULL
          AND coalesce(g.waitlist, false) = false
      )
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Liste publique des invités (actifs uniquement, pas de téléphone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_participants_list_for_route(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_rows jsonb;
  v_cnt  int;
BEGIN
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('ok', true, 'participants', '[]'::jsonb, 'count', 0);
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
          'waitlist', coalesce(g.waitlist, false)
        )
        ORDER BY g.created_at ASC
      ),
      '[]'::jsonb
    ),
    count(*)::int
  INTO v_rows, v_cnt
  FROM public.guest_participants g
  WHERE g.route_id = v_rid
    AND g.canceled_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'participants', v_rows,
    'count', v_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_participants_list_for_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participants_list_for_route(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Promotion file d'attente invités
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._guest_promote_waitlist(p_route_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_cap record;
  v_next uuid;
BEGIN
  SELECT * INTO v_cap FROM public._signup_route_capacity(v_rid);
  IF NOT v_cap.route_ok THEN
    RETURN;
  END IF;
  IF v_cap.max_participants IS NULL THEN
    RETURN;
  END IF;
  IF v_cap.main_count >= v_cap.max_participants THEN
    RETURN;
  END IF;

  SELECT g.id INTO v_next
  FROM public.guest_participants g
  WHERE g.route_id = v_rid
    AND g.canceled_at IS NULL
    AND coalesce(g.waitlist, false) = true
  ORDER BY g.created_at ASC
  LIMIT 1;

  IF v_next IS NOT NULL THEN
    UPDATE public.guest_participants
    SET waitlist = false
    WHERE id = v_next;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._guest_promote_waitlist(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Inscription publique (anon) — distincte de guest_participant_add
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
  v_gate    record;
  v_waitlist boolean := false;
  v_token   text;
  v_token_hash text;
  v_row     public.guest_participants%ROWTYPE;
  v_cnt     int;
  v_attempts_client int;
  v_attempts_route int;
BEGIN
  -- Honeypot : bots remplissent le champ caché → faux succès silencieux
  IF nullif(trim(coalesce(p_hp, '')), '') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'honeypot', true,
      'participant', jsonb_build_object(
        'id', gen_random_uuid(),
        'route_id', v_rid,
        'first_name', left(v_pseudo, 40),
        'is_guest', true,
        'source', 'guest'
      )
    );
  END IF;

  IF length(v_pseudo) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pseudo_too_short');
  END IF;
  IF length(v_pseudo) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pseudo_too_long');
  END IF;

  -- Caractères raisonnables (lettres, chiffres, espaces, tirets, apostrophes)
  IF v_pseudo !~ '^[[:alnum:]À-ÖØ-öø-ÿĀ-žḀ-ỿ ''’\-_.]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pseudo_invalid');
  END IF;

  SELECT * INTO v_gate FROM public._guest_route_is_open_for_public(v_rid);
  IF NOT v_gate.ok THEN
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_gate.error_code, 'invalid_route'));
  END IF;

  IF v_client IS NULL OR length(v_client) < 8 OR length(v_client) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_key_required');
  END IF;

  v_ck_hash := public._guest_hash_token(v_client);

  -- Déjà inscrit avec ce client sur cette sortie
  IF EXISTS (
    SELECT 1 FROM public.guest_participants g
    WHERE g.route_id = v_rid
      AND g.client_key_hash = v_ck_hash
      AND g.canceled_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END IF;

  -- Anti-abus : max 8 inscriptions / client / 24 h
  SELECT count(*)::int INTO v_attempts_client
  FROM public.guest_signup_attempts a
  WHERE a.client_key_hash = v_ck_hash
    AND a.created_at > now() - interval '24 hours';

  IF v_attempts_client >= 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  -- Anti-abus : max 40 inscriptions / sortie / heure
  SELECT count(*)::int INTO v_attempts_route
  FROM public.guest_signup_attempts a
  WHERE a.route_id = v_rid
    AND a.created_at > now() - interval '1 hour';

  IF v_attempts_route >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  INSERT INTO public.guest_signup_attempts (client_key_hash, route_id)
  VALUES (v_ck_hash, v_rid);

  IF v_gate.max_participants IS NOT NULL
     AND v_gate.main_count >= v_gate.max_participants THEN
    v_waitlist := true;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := public._guest_hash_token(v_token);

  INSERT INTO public.guest_participants (
    route_id, first_name, last_name, phone, created_by,
    manage_token_hash, client_key_hash, waitlist, canceled_at
  )
  VALUES (
    v_rid, v_pseudo, NULL, NULL, NULL,
    v_token_hash, v_ck_hash, v_waitlist, NULL
  )
  RETURNING * INTO v_row;

  SELECT count(*)::int INTO v_cnt
  FROM public.guest_participants g
  WHERE g.route_id = v_rid AND g.canceled_at IS NULL;

  SELECT v_cnt + (
    SELECT count(*)::int
    FROM (
      SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
      FROM public.signups s
      WHERE s.route_id = v_rid AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    WHERE latest.status IN ('joined', 'waiting') AND latest.canceled_at IS NULL
  )
  INTO v_cnt;

  RETURN jsonb_build_object(
    'ok', true,
    'waitlist', v_waitlist,
    'manage_token', v_token,
    'count', v_cnt,
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
  'Inscription publique sans compte (pseudo seul). Retourne manage_token une seule fois.';

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
  v_cnt   int;
BEGIN
  IF length(v_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_hash := public._guest_hash_token(v_token);

  SELECT * INTO v_row
  FROM public.guest_participants g
  WHERE g.manage_token_hash = v_hash
    AND g.canceled_at IS NULL
  LIMIT 1;

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

  IF v_was_main THEN
    -- Priorité : promouvoir un membre en attente, puis un invité
    PERFORM public._signup_promote_waitlist(v_row.route_id);
    PERFORM public._guest_promote_waitlist(v_row.route_id);
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.guest_participants g
  WHERE g.route_id = v_row.route_id AND g.canceled_at IS NULL;

  SELECT v_cnt + (
    SELECT count(*)::int
    FROM (
      SELECT DISTINCT ON (s.user_id) s.status, s.canceled_at
      FROM public.signups s
      WHERE s.route_id = v_row.route_id AND s.user_id IS NOT NULL
      ORDER BY s.user_id, s.created_at DESC NULLS LAST, s.id DESC
    ) latest
    WHERE latest.status IN ('joined', 'waiting') AND latest.canceled_at IS NULL
  )
  INTO v_cnt;

  RETURN jsonb_build_object(
    'ok', true,
    'route_id', v_row.route_id,
    'count', v_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_self_cancel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_self_cancel(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.guest_self_cancel(text) IS
  'Annule une inscription invité uniquement avec le jeton personnel (pas le pseudo).';

-- Admin add : inchangé fonctionnellement (pas de jeton public)
-- S'assurer que guest_participant_add reste sans GRANT anon
REVOKE ALL ON FUNCTION public.guest_participant_add(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participant_add(text, text, text, text)
  TO authenticated, service_role;
