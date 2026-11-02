-- Alertes privées des administrateurs, à partir des participations réelles.
-- Pas de reprise des anciennes actions, pas de modification des RPC d'inscription.
LOCK TABLE public.signups, public.guest_participants IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.admin_participation_state (
  route_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('member','guest')), subject text NOT NULL,
  active boolean NOT NULL DEFAULT false, pseudo text NOT NULL DEFAULT 'Un cycliste',
  PRIMARY KEY(route_id,kind,subject)
);
CREATE TABLE IF NOT EXISTS public.admin_participation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), route_id text NOT NULL,
  route_title text NOT NULL, ride_date text, action text NOT NULL CHECK(action IN ('joined','left')),
  participant_name text NOT NULL, participant_count int NOT NULL CHECK(participant_count>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS admin_participation_notifications_time ON public.admin_participation_notifications(created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.admin_participation_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.admin_participation_notifications(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,notification_id)
);
CREATE TABLE IF NOT EXISTS public.admin_participation_devices (
  subscription_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_participation_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.admin_participation_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.admin_participation_devices(subscription_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','skipped')),
  attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
  last_error text, sent_at timestamptz, UNIQUE(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS admin_participation_deliveries_due ON public.admin_participation_deliveries(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS public.admin_participation_push_status (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), configured boolean NOT NULL DEFAULT false,
  checked_at timestamptz, last_sent_at timestamptz, problem text
);
INSERT INTO public.admin_participation_push_status(singleton) VALUES(true) ON CONFLICT DO NOTHING;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['admin_participation_state','admin_participation_notifications','admin_participation_reads','admin_participation_devices','admin_participation_deliveries','admin_participation_push_status'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',name);
    EXECUTE format('DROP POLICY IF EXISTS service_only ON public.%I',name);
    EXECUTE format('CREATE POLICY service_only ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',name);
  END LOOP;
END $$;

-- État de référence : les inscriptions existantes ne déclenchent aucune alerte.
INSERT INTO public.admin_participation_state(route_id,kind,subject,active,pseudo)
SELECT latest.route_id,'member',latest.user_id::text,latest.status='joined' AND latest.canceled_at IS NULL,
  coalesce(nullif(trim(p.pseudo),''),nullif(trim(p.username),''),'Un cycliste')
FROM (SELECT DISTINCT ON(route_id,user_id) route_id,user_id,status,canceled_at
      FROM public.signups WHERE user_id IS NOT NULL ORDER BY route_id,user_id,created_at DESC NULLS LAST,id DESC) latest
LEFT JOIN public.profiles p ON p.id=latest.user_id ON CONFLICT DO NOTHING;
INSERT INTO public.admin_participation_state(route_id,kind,subject,active,pseudo)
SELECT route_id,'guest',id::text,true,coalesce(nullif(trim(first_name),''),'Un cycliste') FROM public.guest_participants
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public._admin_participation_refresh(rid text,kind_name text,subject_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous boolean; current_active boolean:=false; who text; old_name text; title text; ride_day text; total int; nid uuid;
BEGIN
  IF rid IS NULL OR subject_id IS NULL THEN RETURN; END IF;
  SELECT coalesce(nullif(r.track_name,''),nullif(r.front_config->>'title',''),'Sortie'),r.front_config->>'rideDateIso'
    INTO title,ride_day FROM public.routes r WHERE r.id=rid;
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
  INSERT INTO public.admin_participation_notifications(route_id,route_title,ride_date,action,participant_name,participant_count)
    VALUES(rid,title,ride_day,CASE WHEN current_active THEN 'joined' ELSE 'left' END,left(who,100),total) RETURNING id INTO nid;
  INSERT INTO public.admin_participation_deliveries(notification_id,subscription_id,user_id)
    SELECT nid,d.subscription_id,d.user_id FROM public.admin_participation_devices d JOIN public.profiles p ON p.id=d.user_id
    WHERE d.enabled AND p.role='admin' ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public._admin_participation_refresh(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._admin_participation_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text:=CASE WHEN TG_TABLE_NAME='signups' THEN 'member' ELSE 'guest' END; old_subject text; new_subject text;
BEGIN
  IF TG_OP<>'INSERT' THEN old_subject:=CASE WHEN k='member' THEN to_jsonb(OLD)->>'user_id' ELSE to_jsonb(OLD)->>'id' END; END IF;
  IF TG_OP<>'DELETE' THEN new_subject:=CASE WHEN k='member' THEN to_jsonb(NEW)->>'user_id' ELSE to_jsonb(NEW)->>'id' END; END IF;
  IF TG_OP='DELETE' THEN PERFORM public._admin_participation_refresh(OLD.route_id,k,old_subject);
  ELSE
    IF TG_OP='UPDATE' AND (OLD.route_id IS DISTINCT FROM NEW.route_id OR old_subject IS DISTINCT FROM new_subject) THEN
      PERFORM public._admin_participation_refresh(OLD.route_id,k,old_subject);
    END IF;
    PERFORM public._admin_participation_refresh(NEW.route_id,k,new_subject);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Une panne de notification ne doit jamais empêcher une participation.
  RAISE WARNING 'admin_participation_notification_failed: %',SQLSTATE;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._admin_participation_changed() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS admin_participation_changed ON public.signups;
CREATE TRIGGER admin_participation_changed AFTER INSERT OR UPDATE OR DELETE ON public.signups FOR EACH ROW EXECUTE FUNCTION public._admin_participation_changed();
DROP TRIGGER IF EXISTS admin_participation_changed ON public.guest_participants;
CREATE TRIGGER admin_participation_changed AFTER INSERT OR UPDATE OR DELETE ON public.guest_participants FOR EACH ROW EXECUTE FUNCTION public._admin_participation_changed();

CREATE OR REPLACE FUNCTION public._admin_notifications_user() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public._goelo_caller_is_admin(),false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN auth.uid();
END $$;
REVOKE ALL ON FUNCTION public._admin_notifications_user() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_participation_notifications_list(p_subscription_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public._admin_notifications_user(); rows jsonb; unread int; service jsonb; device_enabled boolean;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO rows FROM (
    SELECT n.*,r.notification_id IS NOT NULL AS is_read FROM public.admin_participation_notifications n
      LEFT JOIN public.admin_participation_reads r ON r.notification_id=n.id AND r.user_id=uid
      ORDER BY n.created_at DESC,n.id DESC LIMIT 40
  ) q;
  SELECT count(*) INTO unread FROM public.admin_participation_notifications n WHERE NOT EXISTS(
    SELECT 1 FROM public.admin_participation_reads r WHERE r.notification_id=n.id AND r.user_id=uid);
  SELECT to_jsonb(s)-'singleton' INTO service FROM public.admin_participation_push_status s WHERE singleton;
  SELECT enabled INTO device_enabled FROM public.admin_participation_devices WHERE subscription_id=p_subscription_id AND user_id=uid;
  RETURN jsonb_build_object('ok',true,'items',rows,'unread_count',unread,'service',service,'device_enabled',coalesce(device_enabled,false));
END $$;
CREATE OR REPLACE FUNCTION public.admin_participation_notifications_read(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public._admin_notifications_user();
BEGIN
  IF coalesce(array_length(p_ids,1),0)>40 THEN RAISE EXCEPTION 'too_many'; END IF;
  INSERT INTO public.admin_participation_reads(user_id,notification_id)
    SELECT uid,id FROM public.admin_participation_notifications WHERE id=ANY(p_ids) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.admin_participation_device_set(p_subscription_id uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public._admin_notifications_user();
BEGIN
  IF p_subscription_id IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;
  IF p_enabled THEN
    INSERT INTO public.admin_participation_devices(subscription_id,user_id,enabled) VALUES(p_subscription_id,uid,true)
    ON CONFLICT(subscription_id) DO UPDATE SET user_id=uid,enabled=true,updated_at=now();
  ELSE
    UPDATE public.admin_participation_devices SET enabled=false,updated_at=now() WHERE subscription_id=p_subscription_id AND user_id=uid;
    UPDATE public.admin_participation_deliveries SET status='skipped',last_error='device_disabled' WHERE subscription_id=p_subscription_id AND user_id=uid AND status IN ('pending','processing');
  END IF;
  RETURN jsonb_build_object('ok',true,'enabled',p_enabled);
END $$;
REVOKE ALL ON FUNCTION public.admin_participation_notifications_list(uuid),public.admin_participation_notifications_read(uuid[]),public.admin_participation_device_set(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_participation_notifications_list(uuid),public.admin_participation_notifications_read(uuid[]),public.admin_participation_device_set(uuid,boolean) TO authenticated;

-- File d'envoi privée ; seules les identités serveur peuvent réserver des messages.
CREATE OR REPLACE FUNCTION public.admin_participation_push_claim(p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  UPDATE public.admin_participation_deliveries d SET status='skipped',last_error='recipient_inactive'
    WHERE d.status IN ('pending','processing') AND NOT EXISTS(
      SELECT 1 FROM public.admin_participation_devices v JOIN public.profiles p ON p.id=v.user_id
      WHERE v.subscription_id=d.subscription_id AND v.user_id=d.user_id AND v.enabled AND p.role='admin');
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('delivery_id',d.id,'subscription_id',d.subscription_id,'attempts',d.attempts,'notification',to_jsonb(n))),'[]'::jsonb)
  INTO result FROM claimed d JOIN public.admin_participation_notifications n ON n.id=d.notification_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_participation_push_claim(int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_participation_push_claim(int) TO service_role;
NOTIFY pgrst,'reload schema';
