-- Participation invitée par pseudo uniquement. Aucun compte ni e-mail.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('goelo:guest-pseudo-migration',0));
CREATE TABLE IF NOT EXISTS public.guest_pseudo_registrations (
  route_id text NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  guest_id uuid REFERENCES public.guest_participants(id) ON DELETE SET NULL,
  pseudo text NOT NULL CHECK (length(pseudo) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(route_id,token_hash)
);
CREATE TABLE IF NOT EXISTS public.guest_pseudo_attempts (
  token_hash text NOT NULL,
  route_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_pseudo_attempt_time ON public.guest_pseudo_attempts(created_at);
ALTER TABLE public.guest_pseudo_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_pseudo_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_pseudo_registrations, public.guest_pseudo_attempts FROM anon, authenticated;
GRANT ALL ON public.guest_pseudo_registrations, public.guest_pseudo_attempts TO service_role;
DROP POLICY IF EXISTS guest_pseudo_reg_service ON public.guest_pseudo_registrations;
CREATE POLICY guest_pseudo_reg_service ON public.guest_pseudo_registrations FOR ALL TO service_role USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS guest_pseudo_attempt_service ON public.guest_pseudo_attempts;
CREATE POLICY guest_pseudo_attempt_service ON public.guest_pseudo_attempts FOR ALL TO service_role USING(true) WITH CHECK(true);
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
-- Partager le verrou de capacité avec les inscriptions des membres et les ajouts manuels.
DO $$ BEGIN
  IF to_regprocedure('public._goelo_member_before_guest_pseudo(text)') IS NULL THEN
    ALTER FUNCTION public.toggle_signup(text) RENAME TO _goelo_member_before_guest_pseudo;
  END IF;
  IF to_regprocedure('public._goelo_manual_before_guest_pseudo(text,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.guest_participant_add(text,text,text,text) RENAME TO _goelo_manual_before_guest_pseudo;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._goelo_member_before_guest_pseudo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._goelo_manual_before_guest_pseudo(text,text,text,text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.toggle_signup(p_route_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:'||trim(p_route_id),0));
  RETURN public._goelo_member_before_guest_pseudo(p_route_id);
END $$;
REVOKE ALL ON FUNCTION public.toggle_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_signup(text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guest_participant_add(p_route_id text,p_first_name text,p_last_name text DEFAULT NULL,p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cap record;
BEGIN
  IF NOT public._goelo_caller_can_manage_guests() THEN RETURN jsonb_build_object('ok',false,'error','forbidden'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:'||trim(p_route_id),0));
  SELECT * INTO cap FROM public._signup_route_capacity(p_route_id);
  IF NOT cap.route_ok THEN RETURN jsonb_build_object('ok',false,'error','invalid_route'); END IF;
  IF cap.max_participants IS NOT NULL AND cap.main_count >= cap.max_participants THEN RETURN jsonb_build_object('ok',false,'error','full'); END IF;
  RETURN public._goelo_manual_before_guest_pseudo(p_route_id,p_first_name,p_last_name,p_phone);
END $$;
REVOKE ALL ON FUNCTION public.guest_participant_add(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participant_add(text,text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guest_pseudo_participation(
  p_action text,p_route_id text,p_token text,p_pseudo text DEFAULT NULL,p_visitor_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  rid text := trim(p_route_id);
  th text;
  nickname text := trim(regexp_replace(coalesce(p_pseudo,''),'[[:space:]]+',' ','g'));
  registration public.guest_pseudo_registrations;
  cap record;
  fc jsonb;
  new_id uuid;
  route_title text;
  ride_day date;
BEGIN
  IF rid IS NULL OR length(rid) NOT BETWEEN 1 AND 150 OR p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$'
    OR p_action IS NULL OR p_action NOT IN ('status','join','cancel') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_input');
  END IF;
  th := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  -- Même ordre de verrouillage pour tous les appels invités : jeton puis sortie.
  PERFORM pg_advisory_xact_lock(hashtextextended('guest-token:'||th,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:'||rid,0));
  SELECT * INTO registration FROM public.guest_pseudo_registrations WHERE route_id=rid AND token_hash=th FOR UPDATE;
  IF p_action='status' THEN
    RETURN jsonb_build_object('ok',true,'joined',registration.guest_id IS NOT NULL,'pseudo',registration.pseudo);
  END IF;
  IF p_action='cancel' THEN
    IF registration.guest_id IS NOT NULL THEN
      DELETE FROM public.guest_participants WHERE id=registration.guest_id;
      UPDATE public.guest_pseudo_registrations SET guest_id=NULL WHERE route_id=rid AND token_hash=th;
      PERFORM public._signup_promote_waitlist(rid);
      PERFORM public.activity_event_log(p_event_type=>'RIDE_LEFT',p_actor_id=>NULL,p_entity_type=>'route',p_entity_id=>rid,
        p_metadata=>jsonb_build_object('actor_pseudo',registration.pseudo,'route_id',rid,'visitor_session_id',left(p_visitor_session_id,100),'participation_method','guest_pseudo'));
    END IF;
    RETURN jsonb_build_object('ok',true,'joined',false,'action','removed');
  END IF;
  -- Relancer après une réponse perdue ne doit jamais créer un second participant.
  IF registration.guest_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'joined',true,'pseudo',registration.pseudo,'action','existing');
  END IF;
  IF length(nickname) NOT BETWEEN 2 AND 60 OR nickname ~ '[[:cntrl:]]' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_pseudo');
  END IF;
  SELECT * INTO cap FROM public._signup_route_capacity(rid);
  IF NOT cap.route_ok OR cap.visibility<>'public' OR cap.sortie_status NOT IN ('open','published','publiee','publiée') THEN
    RETURN jsonb_build_object('ok',false,'error','unavailable');
  END IF;
  SELECT front_config,coalesce(track_name,'Sortie') INTO fc,route_title FROM public.routes WHERE id=rid;
  BEGIN
    IF coalesce(fc->>'rideDateIso','') ~ '^\d{4}-\d{2}-\d{2}$' THEN ride_day := (fc->>'rideDateIso')::date; END IF;
  EXCEPTION WHEN OTHERS THEN ride_day := NULL;
  END;
  IF ride_day IS NOT NULL AND ride_day < (now() AT TIME ZONE 'Europe/Paris')::date THEN
    RETURN jsonb_build_object('ok',false,'error','past');
  END IF;
  PERFORM public._signup_promote_waitlist(rid);
  SELECT * INTO cap FROM public._signup_route_capacity(rid);
  IF cap.max_participants IS NOT NULL AND cap.main_count >= cap.max_participants THEN
    RETURN jsonb_build_object('ok',false,'error','full');
  END IF;
  IF EXISTS(SELECT 1 FROM public.guest_participants WHERE route_id=rid AND lower(trim(first_name))=lower(nickname)) THEN
    RETURN jsonb_build_object('ok',false,'error','pseudo_taken');
  END IF;
  DELETE FROM public.guest_pseudo_attempts WHERE created_at<now()-interval '48 hours';
  IF (SELECT count(*) FROM public.guest_pseudo_attempts WHERE token_hash=th AND created_at>now()-interval '1 hour') >= 5
    OR (SELECT count(*) FROM public.guest_pseudo_attempts WHERE route_id=rid AND created_at>now()-interval '5 minutes') >= 30 THEN
    RETURN jsonb_build_object('ok',false,'error','rate_limited');
  END IF;
  INSERT INTO public.guest_pseudo_attempts(token_hash,route_id) VALUES(th,rid);
  INSERT INTO public.guest_participants(route_id,first_name) VALUES(rid,nickname) RETURNING id INTO new_id;
  INSERT INTO public.guest_pseudo_registrations(route_id,token_hash,guest_id,pseudo) VALUES(rid,th,new_id,nickname)
  ON CONFLICT(route_id,token_hash) DO UPDATE SET guest_id=excluded.guest_id,pseudo=excluded.pseudo;
  PERFORM public.activity_event_log(p_event_type=>'RIDE_JOINED',p_actor_id=>NULL,p_entity_type=>'route',p_entity_id=>rid,
    p_metadata=>jsonb_build_object('actor_pseudo',nickname,'route_id',rid,'route_title',route_title,'visitor_session_id',left(p_visitor_session_id,100),'participation_method','guest_pseudo'));
  RETURN jsonb_build_object('ok',true,'joined',true,'pseudo',nickname,'action','added');
END $$;
REVOKE ALL ON FUNCTION public.guest_pseudo_participation(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_pseudo_participation(text,text,text,text,text) TO anon,authenticated,service_role;
COMMENT ON FUNCTION public.guest_pseudo_participation(text,text,text,text,text) IS 'Participation sans compte par pseudo. Le jeton privé ne donne accès qu’à sa propre participation ; aucun e-mail.';
NOTIFY pgrst,'reload schema';
COMMIT;
