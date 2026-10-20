-- ============================================================================
-- GoëloRides — Verrouillage inscription invité (PR #12 suite)
-- ============================================================================
-- 1) guest_self_register : SERVICE_ROLE uniquement (plus d'appel anon navigateur)
-- 2) Tickets Edge one-shot : anti-abus sans IP fiable (IP headers non garanties)
-- 3) Verrou capacité PARTAGÉ : toggle_signup (membres) + guest_self_register (invités)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Verrou capacité partagé (membres + invités)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._goelo_lock_route_capacity(p_route_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
BEGIN
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN false;
  END IF;

  -- Même clé pour toggle_signup et guest_self_register
  PERFORM pg_advisory_xact_lock(hashtext('goelo_capacity:' || v_rid));

  PERFORM 1
  FROM public.routes r
  WHERE r.id = v_rid AND r.is_active
  FOR UPDATE;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public._goelo_lock_route_capacity(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Tickets Edge (anti-abus indépendant de l'IP)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guest_signup_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key_hash text NOT NULL,
  route_id        text NOT NULL,
  ip_hash         text,
  ip_trusted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS guest_signup_tickets_client_created_idx
  ON public.guest_signup_tickets (client_key_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_signup_tickets_route_created_idx
  ON public.guest_signup_tickets (route_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_signup_tickets_open_idx
  ON public.guest_signup_tickets (id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.guest_signup_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_signup_tickets_deny_all" ON public.guest_signup_tickets;
CREATE POLICY "guest_signup_tickets_deny_all"
  ON public.guest_signup_tickets FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "guest_signup_tickets_service_role_all" ON public.guest_signup_tickets;
CREATE POLICY "guest_signup_tickets_service_role_all"
  ON public.guest_signup_tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.guest_signup_tickets IS
  'Tickets one-shot émis par Edge Function. Anti-abus sans dépendance à une IP fiable.';

-- Émission ticket : service_role only (Edge)
CREATE OR REPLACE FUNCTION public.guest_signup_ticket_issue(
  p_client_key text,
  p_route_id   text,
  p_ip_hash    text DEFAULT NULL,
  p_ip_trusted boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client text := nullif(trim(coalesce(p_client_key, '')), '');
  v_rid    text := trim(p_route_id);
  v_ck     text;
  v_ip     text := lower(nullif(trim(coalesce(p_ip_hash, '')), ''));
  v_trusted boolean := coalesce(p_ip_trusted, false);
  v_cnt_client int;
  v_cnt_route int;
  v_cnt_ip int;
  v_id uuid;
  v_exp timestamptz := now() + interval '2 minutes';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_client IS NULL OR length(v_client) < 8 OR length(v_client) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_key_required');
  END IF;
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  -- IP : uniquement si Edge marque ip_trusted=true (infra garantie).
  -- Sinon p_ip_hash est un signal soft optionnel, jamais seul rempart.
  IF v_ip IS NOT NULL AND v_ip !~ '^[0-9a-f]{64}$' THEN
    v_ip := NULL;
    v_trusted := false;
  END IF;
  IF NOT v_trusted THEN
    -- Ne pas stocker d'IP non fiable comme preuve d'identité
    v_ip := NULL;
  END IF;

  v_ck := public._guest_hash_token(v_client);

  SELECT count(*)::int INTO v_cnt_client
  FROM public.guest_signup_tickets t
  WHERE t.client_key_hash = v_ck
    AND t.created_at > now() - interval '1 hour';

  IF v_cnt_client >= 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT count(*)::int INTO v_cnt_route
  FROM public.guest_signup_tickets t
  WHERE t.route_id = v_rid
    AND t.created_at > now() - interval '1 hour';

  IF v_cnt_route >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  IF v_trusted AND v_ip IS NOT NULL THEN
    SELECT count(*)::int INTO v_cnt_ip
    FROM public.guest_signup_tickets t
    WHERE t.ip_hash = v_ip
      AND t.ip_trusted = true
      AND t.created_at > now() - interval '1 hour';
    IF v_cnt_ip >= 12 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
  END IF;

  INSERT INTO public.guest_signup_tickets (
    client_key_hash, route_id, ip_hash, ip_trusted, expires_at
  )
  VALUES (v_ck, v_rid, v_ip, v_trusted, v_exp)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ticket_id', v_id,
    'expires_at', v_exp,
    'ip_trusted', v_trusted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_signup_ticket_issue(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_signup_ticket_issue(text, text, text, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- guest_self_register : service_role + ticket obligatoire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_self_register(
  p_route_id     text,
  p_pseudo       text,
  p_client_key   text DEFAULT NULL,
  p_hp           text DEFAULT NULL,
  p_edge_ip_hash text DEFAULT NULL,
  p_ticket_id    uuid DEFAULT NULL
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
  v_main    int;
  v_wl_cnt  int;
  v_ticket  public.guest_signup_tickets%ROWTYPE;
  v_attempts_route int;
BEGIN
  -- Barrage rôle : même si GRANT fuité, refuse anon/authenticated
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

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

  IF p_ticket_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ticket_required');
  END IF;

  v_ck_hash := public._guest_hash_token(v_client);

  -- Consomme le ticket sous verrou (one-shot)
  SELECT * INTO v_ticket
  FROM public.guest_signup_tickets t
  WHERE t.id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_ticket.consumed_at IS NOT NULL
     OR v_ticket.expires_at < now()
     OR v_ticket.client_key_hash <> v_ck_hash
     OR v_ticket.route_id <> v_rid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ticket');
  END IF;

  UPDATE public.guest_signup_tickets
  SET consumed_at = now()
  WHERE id = v_ticket.id AND consumed_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ticket');
  END IF;

  -- Verrou capacité partagé avec toggle_signup
  IF NOT public._goelo_lock_route_capacity(v_rid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'route_not_found');
  END IF;

  SELECT * INTO v_gate FROM public._guest_route_is_open_for_public(v_rid);
  IF NOT v_gate.ok THEN
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_gate.error_code, 'invalid_route'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.guest_participants g
    WHERE g.route_id = v_rid
      AND g.client_key_hash = v_ck_hash
      AND g.canceled_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END IF;

  -- Plafond route global (indépendant IP)
  SELECT count(*)::int INTO v_attempts_route
  FROM public.guest_signup_attempts a
  WHERE a.route_id = v_rid
    AND a.created_at > now() - interval '1 hour';
  IF v_attempts_route >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  INSERT INTO public.guest_signup_attempts (client_key_hash, ip_hash, route_id)
  VALUES (
    v_ck_hash,
    CASE WHEN v_ticket.ip_trusted THEN v_ticket.ip_hash ELSE NULL END,
    v_rid
  );

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

-- Compat 5-args / 4-args → refusent sans ticket (et hors service_role)
CREATE OR REPLACE FUNCTION public.guest_self_register(
  p_route_id     text,
  p_pseudo       text,
  p_client_key   text DEFAULT NULL,
  p_hp           text DEFAULT NULL,
  p_edge_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.guest_self_register(
    p_route_id, p_pseudo, p_client_key, p_hp, p_edge_ip_hash, NULL::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.guest_self_register(
  p_route_id   text,
  p_pseudo     text,
  p_client_key text DEFAULT NULL,
  p_hp         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.guest_self_register(
    p_route_id, p_pseudo, p_client_key, p_hp, NULL::text, NULL::uuid
  );
$$;

REVOKE ALL ON FUNCTION public.guest_self_register(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_self_register(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_self_register(text, text, text, text, text, uuid) FROM PUBLIC;

-- Plus d'exécution publique : Edge Function (service_role) uniquement
GRANT EXECUTE ON FUNCTION public.guest_self_register(text, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.guest_self_register(text, text, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.guest_self_register(text, text, text, text, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.guest_self_register(text, text, text, text, text, uuid) IS
  'Inscription invité : service_role + ticket Edge one-shot. Pas d''accès anon.';

-- ---------------------------------------------------------------------------
-- toggle_signup : même verrou capacité que les invités
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

  -- Verrou partagé avec guest_self_register (anti-course dernière place)
  IF NOT public._goelo_lock_route_capacity(v_rid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

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

    -- Compteur confirmés partagé (membres + invités hors waitlist)
    v_cnt := public._guest_main_count(v_rid);

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'removed',
      'joined', false,
      'count', v_cnt,
      'confirmed_count', v_cnt,
      'waitlist_count', public._guest_waitlist_count(v_rid)
    );
  END IF;

  -- Recompte sous le même verrou
  SELECT * INTO v_cap FROM public._signup_route_capacity(v_rid);
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
    UPDATE public.signups
    SET status = 'cancelled',
        canceled_at = v_now
    WHERE route_id = v_rid
      AND user_id = v_uid
      AND status IN ('joined', 'waiting')
      AND canceled_at IS NULL;

    v_cnt := public._guest_main_count(v_rid);
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'removed',
      'joined', false,
      'count', v_cnt,
      'confirmed_count', v_cnt,
      'waitlist_count', public._guest_waitlist_count(v_rid)
    );
  END;

  -- Garde anti-overbook (course théorique)
  IF NOT v_waitlist AND v_cap.max_participants IS NOT NULL THEN
    IF public._guest_main_count(v_rid) > v_cap.max_participants THEN
      UPDATE public.signups
      SET status = 'waiting'
      WHERE route_id = v_rid
        AND user_id = v_uid
        AND status = 'joined'
        AND canceled_at IS NULL;
      v_waitlist := true;
    END IF;
  END IF;

  v_cnt := public._guest_main_count(v_rid);

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'added',
    'joined', NOT v_waitlist,
    'waitlist', v_waitlist,
    'count', v_cnt,
    'confirmed_count', v_cnt,
    'waitlist_count', public._guest_waitlist_count(v_rid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text)
  TO authenticated, service_role;
-- Pas de GRANT anon : inscription membre nécessite une session

-- Promotion waitlist : utilise aussi le verrou capacité
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
  PERFORM public._goelo_lock_route_capacity(v_rid);

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
