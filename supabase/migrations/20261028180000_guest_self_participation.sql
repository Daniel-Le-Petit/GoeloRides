-- Participation sans compte : activation séparée après déploiement de l’Edge Function.
BEGIN;
CREATE TABLE IF NOT EXISTS public.guest_signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id text NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  email text NOT NULL,
  pseudo text NOT NULL CHECK (length(pseudo) BETWEEN 1 AND 60),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','joined','cancelled')),
  guest_id uuid REFERENCES public.guest_participants(id) ON DELETE SET NULL,
  visitor_session_id text,
  confirm_until timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  manage_until timestamptz NOT NULL DEFAULT now() + interval '400 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(route_id,email)
);
CREATE TABLE IF NOT EXISTS public.guest_signup_links (
  token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
  request_id uuid NOT NULL REFERENCES public.guest_signup_requests(id) ON DELETE CASCADE,
  confirm_until timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  expires_at timestamptz NOT NULL DEFAULT now()+interval '400 days'
);
ALTER TABLE public.guest_signup_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_signup_links FROM anon, authenticated;
GRANT ALL ON public.guest_signup_links TO service_role;
CREATE POLICY guest_signup_links_service ON public.guest_signup_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.guest_signup_mail_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_signup_limits_time_idx ON public.guest_signup_mail_limits(created_at);
ALTER TABLE public.guest_signup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_signup_mail_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_signup_requests, public.guest_signup_mail_limits FROM anon, authenticated;
GRANT ALL ON public.guest_signup_requests, public.guest_signup_mail_limits TO service_role;
CREATE POLICY guest_signup_requests_service ON public.guest_signup_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY guest_signup_limits_service ON public.guest_signup_mail_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

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
    (SELECT count(*)::int FROM public.guest_participants g WHERE g.route_id = v_rid) + (
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

-- Même verrou pour les inscriptions membres et les invités : éviter de dépasser la capacité.
ALTER FUNCTION public.toggle_signup(text) RENAME TO _goelo_member_toggle_signup;
REVOKE ALL ON FUNCTION public._goelo_member_toggle_signup(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.toggle_signup(p_route_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:' || trim(p_route_id),0));
  RETURN public._goelo_member_toggle_signup(p_route_id);
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text) TO anon, authenticated, service_role;

ALTER FUNCTION public.guest_participant_add(text,text,text,text) RENAME TO _goelo_manual_guest_add;
REVOKE ALL ON FUNCTION public._goelo_manual_guest_add(text,text,text,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.guest_participant_add(p_route_id text,p_first_name text,p_last_name text DEFAULT NULL,p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cap record;
BEGIN
  IF NOT public._goelo_caller_can_manage_guests() THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:' || trim(p_route_id),0));
  SELECT * INTO v_cap FROM public._signup_route_capacity(p_route_id);
  IF v_cap.max_participants IS NOT NULL AND v_cap.main_count >= v_cap.max_participants THEN
    RETURN jsonb_build_object('ok',false,'error','full');
  END IF;
  RETURN public._goelo_manual_guest_add(p_route_id,p_first_name,p_last_name,p_phone);
END;
$$;
REVOKE ALL ON FUNCTION public.guest_participant_add(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participant_add(text,text,text,text) TO authenticated,service_role;

CREATE FUNCTION public.guest_signup_prepare(
  p_route_id text, p_email text, p_pseudo text, p_token_hash text,
  p_email_hash text, p_ip_hash text, p_visitor_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cap record; v_title text; v_id uuid;
BEGIN
  IF length(p_token_hash) <> 64 OR length(p_email_hash) <> 64 OR length(p_ip_hash) <> 64
    OR length(trim(p_pseudo)) NOT BETWEEN 1 AND 60 OR length(p_email) > 254
    OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('guest-email:' || p_email_hash,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('guest-ip:' || p_ip_hash,0));
  IF (SELECT count(*) FROM public.guest_signup_mail_limits WHERE email_hash=p_email_hash AND created_at>now()-interval '1 hour') >= 3
    OR (SELECT count(*) FROM public.guest_signup_mail_limits WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok',false,'error','rate_limited');
  END IF;
  SELECT * INTO v_cap FROM public._signup_route_capacity(p_route_id);
  IF NOT v_cap.route_ok OR v_cap.visibility <> 'public' OR v_cap.sortie_status NOT IN ('open','published','publiee','publiée') THEN
    RETURN jsonb_build_object('ok',false,'error','unavailable');
  END IF;
  INSERT INTO public.guest_signup_mail_limits(email_hash,ip_hash) VALUES(p_email_hash,p_ip_hash);
  INSERT INTO public.guest_signup_requests(route_id,email,pseudo,token_hash,visitor_session_id)
  VALUES(trim(p_route_id),lower(trim(p_email)),trim(p_pseudo),p_token_hash,left(p_visitor_session_id,100))
  ON CONFLICT(route_id,email) DO UPDATE SET
    token_hash=excluded.token_hash,
    pseudo=CASE WHEN guest_signup_requests.status='joined' THEN guest_signup_requests.pseudo ELSE excluded.pseudo END,
    status=CASE WHEN guest_signup_requests.status='joined' THEN 'joined' ELSE 'pending' END,
    visitor_session_id=excluded.visitor_session_id,
    confirm_until=now()+interval '24 hours', manage_until=now()+interval '400 days'
  RETURNING id INTO v_id;
  INSERT INTO public.guest_signup_links(token_hash,request_id) VALUES(p_token_hash,v_id);
  SELECT coalesce(front_config->>'title','Sortie GoëloRides') INTO v_title FROM public.routes WHERE id=trim(p_route_id);
  RETURN jsonb_build_object('ok',true,'title',v_title);
END;
$$;

CREATE FUNCTION public.guest_signup_manage(p_token_hash text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request public.guest_signup_requests; v_cap record; v_guest uuid; v_title text;
BEGIN
  SELECT r.* INTO v_request FROM public.guest_signup_requests r JOIN public.guest_signup_links l ON l.request_id=r.id
  WHERE l.token_hash=p_token_hash AND l.expires_at>now();
  IF NOT FOUND OR v_request.manage_until < now() THEN RETURN jsonb_build_object('ok',false,'error','invalid_link'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:' || v_request.route_id,0));
  SELECT * INTO v_request FROM public.guest_signup_requests WHERE id=v_request.id FOR UPDATE;
  IF v_request.status='joined' AND v_request.guest_id IS NULL THEN
    UPDATE public.guest_signup_requests SET status='cancelled' WHERE id=v_request.id;
    v_request.status := 'cancelled';
  END IF;
  SELECT coalesce(front_config->>'title','Sortie GoëloRides') INTO v_title FROM public.routes WHERE id=v_request.route_id;
  IF p_action='confirm' AND v_request.status='pending' THEN
    IF v_request.confirm_until < now() OR NOT EXISTS (SELECT 1 FROM public.guest_signup_links WHERE token_hash=p_token_hash AND confirm_until > now()) THEN RETURN jsonb_build_object('ok',false,'error','expired_link'); END IF;
    SELECT * INTO v_cap FROM public._signup_route_capacity(v_request.route_id);
    IF NOT v_cap.route_ok OR v_cap.visibility <> 'public' OR v_cap.sortie_status NOT IN ('open','published','publiee','publiée') THEN
      RETURN jsonb_build_object('ok',false,'error','unavailable');
    END IF;
    -- Promouvoir d’abord les membres déjà sur liste d’attente.
    PERFORM public._signup_promote_waitlist(v_request.route_id);
    SELECT * INTO v_cap FROM public._signup_route_capacity(v_request.route_id);
    IF v_cap.max_participants IS NOT NULL AND v_cap.main_count >= v_cap.max_participants THEN
      RETURN jsonb_build_object('ok',false,'error','full');
    END IF;
    INSERT INTO public.guest_participants(route_id,first_name) VALUES(v_request.route_id,v_request.pseudo) RETURNING id INTO v_guest;
    UPDATE public.guest_signup_requests SET status='joined',guest_id=v_guest WHERE id=v_request.id;
    v_request.status := 'joined';
    PERFORM public.activity_event_log(p_event_type=>'RIDE_JOINED',p_metadata=>jsonb_build_object(
      'source','guest_participation','actor_pseudo',v_request.pseudo,'route_id',v_request.route_id,
      'route_title',v_title,'visitor_session_id',v_request.visitor_session_id),
      p_actor_id=>NULL,p_entity_type=>'route',p_entity_id=>v_request.route_id);
  ELSIF p_action='cancel' AND v_request.status='joined' THEN
    DELETE FROM public.guest_participants WHERE id=v_request.guest_id;
    UPDATE public.guest_signup_requests SET status='cancelled',guest_id=NULL WHERE id=v_request.id;
    v_request.status := 'cancelled';
    PERFORM public._signup_promote_waitlist(v_request.route_id);
    PERFORM public.activity_event_log(p_event_type=>'RIDE_LEFT',p_metadata=>jsonb_build_object(
      'source','guest_participation','actor_pseudo',v_request.pseudo,'route_id',v_request.route_id,
      'route_title',v_title,'visitor_session_id',v_request.visitor_session_id),
      p_actor_id=>NULL,p_entity_type=>'route',p_entity_id=>v_request.route_id);
  ELSIF p_action NOT IN ('status','confirm','cancel') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_action');
  END IF;
  RETURN jsonb_build_object('ok',true,'status',v_request.status,'pseudo',v_request.pseudo,'title',v_title,'route_id',v_request.route_id);
END;
$$;
REVOKE ALL ON FUNCTION public.guest_signup_prepare(text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guest_signup_manage(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_signup_prepare(text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guest_signup_manage(text,text) TO service_role;
COMMIT;
