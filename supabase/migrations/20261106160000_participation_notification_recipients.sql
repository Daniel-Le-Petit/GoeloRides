-- Extend the existing transactional outbox; no historical registrations are replayed.
BEGIN;
LOCK TABLE public.signups, public.guest_participants IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.admin_participation_notifications ADD COLUMN IF NOT EXISTS participant_user_id uuid;
ALTER TABLE public.admin_participation_notifications ADD COLUMN IF NOT EXISTS participant_guest_id uuid;
ALTER TABLE public.admin_participation_notifications ADD COLUMN IF NOT EXISTS assigned_leader_id uuid;
ALTER TABLE public.admin_participation_devices ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.admin_participation_devices ADD COLUMN IF NOT EXISTS admin_alerts_enabled boolean;
UPDATE public.admin_participation_devices SET admin_alerts_enabled=enabled WHERE admin_alerts_enabled IS NULL;
ALTER TABLE public.admin_participation_devices ALTER COLUMN admin_alerts_enabled SET DEFAULT true;
ALTER TABLE public.admin_participation_devices ALTER COLUMN admin_alerts_enabled SET NOT NULL;
ALTER TABLE public.admin_participation_deliveries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.admin_participation_deliveries ADD COLUMN IF NOT EXISTS recipient_kind text NOT NULL DEFAULT 'admin'
  CHECK(recipient_kind IN ('admin','leader','participant','guest'));
ALTER TABLE public.admin_participation_deliveries ADD COLUMN IF NOT EXISTS guest_token_hash text;
CREATE TABLE IF NOT EXISTS public.participation_guest_devices (
  route_id text NOT NULL, token_hash text NOT NULL,
  subscription_id uuid NOT NULL REFERENCES public.admin_participation_devices(subscription_id) ON DELETE CASCADE,
  PRIMARY KEY(route_id,token_hash,subscription_id),
  FOREIGN KEY(route_id,token_hash) REFERENCES public.guest_pseudo_registrations(route_id,token_hash) ON DELETE CASCADE
);
ALTER TABLE public.participation_guest_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.participation_guest_devices FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.participation_guest_devices TO service_role;
DROP POLICY IF EXISTS service_only ON public.participation_guest_devices;
CREATE POLICY service_only ON public.participation_guest_devices FOR ALL TO service_role USING(true) WITH CHECK(true);

-- Authenticate account ownership at registration, never accept a caller-supplied user/role.
CREATE OR REPLACE FUNCTION public.participation_device_set(p_subscription_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_subscription_id IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;
  IF p_enabled THEN
    DELETE FROM public.participation_guest_devices gd USING public.admin_participation_devices d
      WHERE gd.subscription_id=p_subscription_id AND d.subscription_id=gd.subscription_id AND d.user_id IS DISTINCT FROM uid;
    -- Inspect the previous owner before rebinding. A routine refresh must not
    -- invalidate guest confirmations made by the same logged-in account.
    UPDATE public.admin_participation_deliveries delivery SET status='skipped',last_error='account_changed'
      FROM public.admin_participation_devices device
      WHERE delivery.subscription_id=p_subscription_id AND device.subscription_id=delivery.subscription_id
        AND device.user_id IS DISTINCT FROM uid AND delivery.status IN ('pending','processing');
    INSERT INTO public.admin_participation_devices(subscription_id,user_id,enabled) VALUES(p_subscription_id,uid,true)
    ON CONFLICT(subscription_id) DO UPDATE SET user_id=uid,enabled=true,updated_at=now();
    INSERT INTO public.admin_participation_deliveries(notification_id,subscription_id,user_id,recipient_kind)
      SELECT n.id,p_subscription_id,uid,'participant' FROM public.admin_participation_notifications n
      WHERE n.participant_user_id=uid AND n.action='joined' AND n.created_at>now()-interval '5 minutes'
        AND EXISTS(SELECT 1 FROM public.admin_participation_state s WHERE s.route_id=n.route_id AND s.kind='member' AND s.subject=uid::text AND s.active)
      ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.admin_participation_devices SET enabled=false,updated_at=now() WHERE subscription_id=p_subscription_id AND user_id=uid;
    UPDATE public.admin_participation_deliveries SET status='skipped',last_error='device_disabled'
      WHERE subscription_id=p_subscription_id AND user_id=uid AND status IN ('pending','processing');
  END IF;
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled);
END $$;
REVOKE ALL ON FUNCTION public.participation_device_set(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.participation_device_set(uuid,boolean) TO authenticated;

-- Proof of guest ownership is the existing 256-bit participation token, never a pseudo.
CREATE OR REPLACE FUNCTION public.participation_guest_device_set(p_route_id text,p_token text,p_subscription_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE th text; gid uuid; nid uuid;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_subscription_id IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;
  th:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  SELECT guest_id INTO gid FROM public.guest_pseudo_registrations WHERE route_id=p_route_id AND token_hash=th;
  IF gid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.admin_participation_devices(subscription_id,user_id,enabled) VALUES(p_subscription_id,NULL,true) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.admin_participation_devices WHERE subscription_id=p_subscription_id AND enabled
      AND (user_id IS NULL OR user_id=auth.uid())) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO public.participation_guest_devices VALUES(p_route_id,th,p_subscription_id) ON CONFLICT DO NOTHING;
  -- The guest row is created before its token mapping. Enqueue the current confirmation
  -- after proof has been checked; repeats use the existing unique delivery key.
  SELECT id INTO nid FROM public.admin_participation_notifications
    WHERE route_id=p_route_id AND participant_guest_id=gid AND action='joined'
      AND created_at>now()-interval '5 minutes' ORDER BY created_at DESC LIMIT 1;
  IF nid IS NOT NULL THEN
    INSERT INTO public.admin_participation_deliveries(notification_id,subscription_id,user_id,recipient_kind,guest_token_hash)
      VALUES(nid,p_subscription_id,NULL,'guest',th)
      ON CONFLICT(notification_id,subscription_id) DO UPDATE
        SET user_id=NULL,recipient_kind='guest',guest_token_hash=th
        WHERE admin_participation_deliveries.status='pending';
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.participation_guest_device_set(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participation_guest_device_set(text,text,uuid) TO anon,authenticated;

-- Shared by claim and the immediate pre-send check, so stale roles/assignments
-- and switched accounts cannot continue receiving private messages.
CREATE OR REPLACE FUNCTION public._participation_delivery_allowed(did uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.admin_participation_deliveries d
  JOIN public.admin_participation_notifications n ON n.id=d.notification_id
  JOIN public.admin_participation_devices v ON v.subscription_id=d.subscription_id
  WHERE d.id=did AND v.enabled AND (
   (d.recipient_kind<>'guest' AND v.user_id=d.user_id AND NOT EXISTS(
      SELECT 1 FROM public.admin_participation_reads r WHERE r.notification_id=n.id AND r.user_id=d.user_id)
    AND (
     d.recipient_kind='admin' AND v.admin_alerts_enabled AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=d.user_id AND p.role='admin')
     OR d.recipient_kind='leader' AND EXISTS(SELECT 1 FROM public.routes r WHERE r.id=n.route_id AND r.assigned_team_rider_id=d.user_id)
     OR d.recipient_kind='participant' AND n.action='joined' AND n.participant_user_id=d.user_id
       AND EXISTS(SELECT 1 FROM public.admin_participation_state s WHERE s.route_id=n.route_id AND s.kind='member' AND s.subject=d.user_id::text AND s.active)
       AND n.id=(SELECT recent.id FROM public.admin_participation_notifications recent WHERE recent.route_id=n.route_id AND recent.participant_user_id=d.user_id ORDER BY recent.created_at DESC,recent.id DESC LIMIT 1)
    ))
   OR d.recipient_kind='guest' AND n.action='joined' AND EXISTS(
    SELECT 1 FROM public.participation_guest_devices gd JOIN public.guest_pseudo_registrations g USING(route_id,token_hash)
    WHERE gd.subscription_id=d.subscription_id AND gd.route_id=n.route_id AND gd.token_hash=d.guest_token_hash AND g.guest_id=n.participant_guest_id)
  )
 )
$$;
REVOKE ALL ON FUNCTION public._participation_delivery_allowed(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._participation_delivery_allowed(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._admin_participation_refresh(rid text,kind_name text,subject_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous boolean; current_active boolean:=false; who text; old_name text; title text; ride_day text; total int; nid uuid; leader uuid;
BEGIN
  IF rid IS NULL OR subject_id IS NULL THEN RETURN; END IF;
  SELECT coalesce(nullif(r.track_name,''),nullif(r.front_config->>'title',''),'Sortie'),r.front_config->>'rideDateIso',r.assigned_team_rider_id
    INTO title,ride_day,leader FROM public.routes r WHERE r.id=rid;
  IF NOT FOUND THEN RETURN; END IF; -- Suppression de la sortie : pas de fausse désinscription.
  INSERT INTO public.admin_participation_state(route_id,kind,subject) VALUES(rid,kind_name,subject_id) ON CONFLICT DO NOTHING;
  SELECT active,pseudo INTO previous,old_name FROM public.admin_participation_state
    WHERE route_id=rid AND kind=kind_name AND subject=subject_id FOR UPDATE;
  IF kind_name='member' THEN
    SELECT s.status='joined' AND s.canceled_at IS NULL INTO current_active FROM public.signups s
      WHERE s.route_id=rid AND s.user_id::text=subject_id ORDER BY s.created_at DESC NULLS LAST,s.id DESC LIMIT 1;
    SELECT coalesce(nullif(trim(p.pseudo),''),nullif(trim(p.username),'')) INTO who FROM public.profiles p WHERE p.id::text=subject_id;
  ELSE
    SELECT true,nullif(trim(g.first_name),'') INTO current_active,who FROM public.guest_participants g WHERE g.route_id=rid AND g.id::text=subject_id;
  END IF;
  current_active:=coalesce(current_active,false); who:=coalesce(who,old_name,'Un cycliste');
  UPDATE public.admin_participation_state SET active=current_active,pseudo=who WHERE route_id=rid AND kind=kind_name AND subject=subject_id;
  IF previous=current_active THEN RETURN; END IF;
  SELECT (SELECT count(*) FROM public.guest_participants WHERE route_id=rid)+count(*) INTO total FROM (
    SELECT DISTINCT ON(s.user_id) s.status,s.canceled_at FROM public.signups s
      WHERE s.route_id=rid AND s.user_id IS NOT NULL ORDER BY s.user_id,s.created_at DESC NULLS LAST,s.id DESC
  ) latest WHERE latest.status='joined' AND latest.canceled_at IS NULL;
  INSERT INTO public.admin_participation_notifications(route_id,route_title,ride_date,action,participant_name,participant_count,participant_user_id,participant_guest_id,assigned_leader_id)
    VALUES(rid,title,ride_day,CASE WHEN current_active THEN 'joined' ELSE 'left' END,left(who,100),total,CASE WHEN kind_name='member' THEN subject_id::uuid END,CASE WHEN kind_name='guest' THEN subject_id::uuid END,leader) RETURNING id INTO nid;
  INSERT INTO public.admin_participation_deliveries(notification_id,subscription_id,user_id,recipient_kind)
    SELECT nid,d.subscription_id,d.user_id,
      CASE WHEN current_active AND kind_name='member' AND d.user_id::text=subject_id THEN 'participant'
           WHEN p.role='admin' AND d.admin_alerts_enabled THEN 'admin' ELSE 'leader' END
    FROM public.admin_participation_devices d LEFT JOIN public.profiles p ON p.id=d.user_id
    WHERE d.enabled AND d.user_id IS NOT NULL AND (
      p.role='admin' AND d.admin_alerts_enabled OR d.user_id=leader OR current_active AND kind_name='member' AND d.user_id::text=subject_id)
    ON CONFLICT DO NOTHING;
  IF current_active AND kind_name='guest' THEN
    INSERT INTO public.admin_participation_deliveries(notification_id,subscription_id,user_id,recipient_kind,guest_token_hash)
      SELECT nid,gd.subscription_id,NULL,'guest',gd.token_hash FROM public.participation_guest_devices gd
      JOIN public.guest_pseudo_registrations g USING(route_id,token_hash)
      JOIN public.admin_participation_devices d ON d.subscription_id=gd.subscription_id AND d.enabled
      WHERE g.route_id=rid AND g.guest_id::text=subject_id ON CONFLICT DO NOTHING;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._admin_participation_refresh(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_participation_push_claim(p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  UPDATE public.admin_participation_deliveries d SET status='skipped',last_error='recipient_inactive'
    WHERE d.status IN ('pending','processing') AND NOT public._participation_delivery_allowed(d.id);
  UPDATE public.admin_participation_deliveries d SET status='failed',last_error='expired'
    FROM public.admin_participation_notifications n WHERE n.id=d.notification_id AND d.status IN ('pending','processing') AND n.created_at<now()-interval '24 hours';
  UPDATE public.admin_participation_deliveries SET status='failed',last_error='attempts_exhausted' WHERE attempts>=5 AND (status='pending' OR status='processing' AND lease_until<now());
  WITH candidates AS (
    SELECT d.id FROM public.admin_participation_deliveries d
    WHERE (d.status='pending' AND d.next_attempt_at<=now() OR d.status='processing' AND d.lease_until<now()) AND d.attempts<5
    ORDER BY d.next_attempt_at,d.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,20))
  ), claimed AS (
    UPDATE public.admin_participation_deliveries d SET status='processing',attempts=attempts+1,lease_until=now()+interval '3 minutes'
    FROM candidates c WHERE d.id=c.id RETURNING d.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('delivery_id',d.id,'subscription_id',d.subscription_id,'attempts',d.attempts,'recipient_kind',d.recipient_kind,'notification',to_jsonb(n))),'[]'::jsonb)
  INTO result FROM claimed d JOIN public.admin_participation_notifications n ON n.id=d.notification_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_participation_push_claim(int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_participation_push_claim(int) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_participation_notifications_list(p_subscription_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public._admin_notifications_user(); rows jsonb; unread int; service jsonb; device_enabled boolean;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.is_read ASC,q.created_at DESC,q.id DESC),'[]'::jsonb) INTO rows FROM (
    SELECT n.*,r.notification_id IS NOT NULL AS is_read FROM public.admin_participation_notifications n
      LEFT JOIN public.admin_participation_reads r ON r.notification_id=n.id AND r.user_id=uid
      ORDER BY (r.notification_id IS NULL) DESC,n.created_at DESC,n.id DESC LIMIT 40
  ) q;
  SELECT count(*) INTO unread FROM public.admin_participation_notifications n WHERE NOT EXISTS(
    SELECT 1 FROM public.admin_participation_reads r WHERE r.notification_id=n.id AND r.user_id=uid);
  SELECT to_jsonb(s)-'singleton' INTO service FROM public.admin_participation_push_status s WHERE singleton;
  SELECT enabled AND admin_alerts_enabled INTO device_enabled FROM public.admin_participation_devices WHERE subscription_id=p_subscription_id AND user_id=uid;
  RETURN jsonb_build_object('ok',true,'items',rows,'unread_count',unread,'service',service,'device_enabled',coalesce(device_enabled,false));
END $$;

CREATE OR REPLACE FUNCTION public.admin_participation_device_set(p_subscription_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public._admin_notifications_user();
BEGIN
  IF p_subscription_id IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;
  IF p_enabled THEN
    PERFORM public.participation_device_set(p_subscription_id,true);
  END IF;
  UPDATE public.admin_participation_devices SET admin_alerts_enabled=p_enabled,updated_at=now()
    WHERE subscription_id=p_subscription_id AND user_id=uid;
  IF NOT p_enabled THEN
    UPDATE public.admin_participation_deliveries SET status='skipped',last_error='admin_alerts_disabled'
      WHERE subscription_id=p_subscription_id AND user_id=uid AND recipient_kind='admin' AND status IN ('pending','processing');
  END IF;
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled);
END $$;
REVOKE ALL ON FUNCTION public.admin_participation_device_set(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_participation_device_set(uuid,boolean) TO authenticated;

-- Account creation is a distinct event in the same outbox. No existing accounts
-- are scanned, and reconnecting/updating a profile cannot enqueue another alert.
ALTER TABLE public.admin_participation_notifications DROP CONSTRAINT IF EXISTS admin_participation_notifications_action_check;
ALTER TABLE public.admin_participation_notifications ADD CONSTRAINT admin_participation_notifications_action_check
  CHECK(action IN ('joined','left','account_created'));
CREATE UNIQUE INDEX IF NOT EXISTS participation_account_created_once
  ON public.admin_participation_notifications(participant_user_id) WHERE action='account_created';
CREATE OR REPLACE FUNCTION public._cyclist_account_created_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid uuid; who text;
BEGIN
  -- on_auth_user_created runs first and creates the canonical profile.
  SELECT coalesce(nullif(trim(p.pseudo),''),nullif(trim(p.username),''),'Un cycliste')
    INTO who FROM public.profiles p WHERE p.id=NEW.id AND p.role='user';
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.admin_participation_notifications(route_id,route_title,action,participant_name,participant_count,participant_user_id)
    VALUES('account:'||NEW.id::text,'Nouveau compte cycliste','account_created',left(who,100),0,NEW.id)
    ON CONFLICT DO NOTHING RETURNING id INTO nid;
  IF nid IS NOT NULL THEN
    INSERT INTO public.admin_participation_deliveries(notification_id,subscription_id,user_id,recipient_kind)
      SELECT nid,d.subscription_id,d.user_id,'admin' FROM public.admin_participation_devices d
      JOIN public.profiles p ON p.id=d.user_id WHERE d.enabled AND d.admin_alerts_enabled AND p.role='admin'
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cyclist_account_notification_failed: %',SQLSTATE;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._cyclist_account_created_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS z_goelo_cyclist_account_created ON auth.users;
CREATE TRIGGER z_goelo_cyclist_account_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public._cyclist_account_created_notification();

NOTIFY pgrst,'reload schema';
COMMIT;
