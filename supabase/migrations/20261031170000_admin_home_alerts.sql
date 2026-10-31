-- Commandes admin des alertes, distinctes des modifications de la sortie.
ALTER TABLE public.ride_priority_alerts ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false;
ALTER TABLE public.ride_priority_alerts ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.ride_priority_alerts DROP CONSTRAINT IF EXISTS ride_priority_alerts_kind_check;
ALTER TABLE public.ride_priority_alerts ADD CONSTRAINT ride_priority_alerts_kind_check CHECK(kind IN ('cancelled','schedule','information'));

CREATE OR REPLACE FUNCTION public.capture_ride_priority_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  old_fc jsonb := coalesce(OLD.front_config,'{}');
  fc jsonb := coalesce(NEW.front_config,'{}');
  old_status text := lower(trim(coalesce(old_fc->>'sortieStatus','open')));
  status text := lower(trim(coalesce(fc->>'sortieStatus','open')));
  visibility text := lower(trim(coalesce(fc->>'visibility','public')));
  was_public boolean := lower(trim(coalesce(old_fc->>'visibility','public')))='public';
  is_cancelled boolean := status IN ('cancelled','canceled','annulee','annulée');
  old_schedule jsonb;
  new_schedule jsonb;
BEGIN
  IF NOT NEW.is_active OR visibility IN ('private','prive','privee','privée','invitation','invite','invitation_only') THEN
    DELETE FROM public.ride_priority_alerts WHERE route_id=NEW.id;
    RETURN NEW;
  END IF;
  IF visibility <> 'public' AND NOT (is_cancelled AND (was_public OR EXISTS (SELECT 1 FROM public.ride_priority_alerts WHERE route_id=NEW.id AND kind='cancelled'))) THEN
    DELETE FROM public.ride_priority_alerts WHERE route_id=NEW.id;
    RETURN NEW;
  END IF;
  old_schedule := jsonb_build_object('date',old_fc->>'rideDateIso','departure',old_fc->>'rideTime','meeting',old_fc->>'meetTime');
  new_schedule := jsonb_build_object('date',fc->>'rideDateIso','departure',fc->>'rideTime','meeting',fc->>'meetTime');
  IF is_cancelled AND old_status NOT IN ('cancelled','canceled','annulee','annulée') AND was_public THEN
    INSERT INTO public.ride_priority_alerts(route_id,kind,previous_schedule,changed_at)
    VALUES(NEW.id,'cancelled',old_schedule,now())
    ON CONFLICT(route_id) DO UPDATE SET kind=EXCLUDED.kind,previous_schedule=EXCLUDED.previous_schedule,changed_at=EXCLUDED.changed_at,suppressed=false,message=NULL;
  ELSIF NOT is_cancelled AND old_status IN ('cancelled','canceled','annulee','annulée') THEN
    DELETE FROM public.ride_priority_alerts WHERE route_id=NEW.id;
  ELSIF NOT is_cancelled AND status IN ('open','published','publiee','publiée','reportee','reportée','postponed') AND was_public AND old_schedule IS DISTINCT FROM new_schedule THEN
    INSERT INTO public.ride_priority_alerts(route_id,kind,previous_schedule,changed_at)
    VALUES(NEW.id,'schedule',old_schedule,now())
    ON CONFLICT(route_id) DO UPDATE SET kind=EXCLUDED.kind,previous_schedule=EXCLUDED.previous_schedule,changed_at=EXCLUDED.changed_at,suppressed=false,message=NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_ride_priority_alert() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.home_priority_alerts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY ride_day,priority,changed_at DESC),'[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'route_id',r.id,'kind',a.kind,'title',r.track_name,'group',r.group_label,
      'date',r.front_config->>'rideDateIso','departure',r.front_config->>'rideTime',
      'meeting',r.front_config->>'meetTime','place',r.front_config->>'meetPlace',
      'message',a.message,'previous',a.previous_schedule,'changed_at',a.changed_at
    ) AS item, r.front_config->>'rideDateIso' AS ride_day,
    CASE WHEN a.kind='cancelled' THEN 0 ELSE 1 END AS priority,a.changed_at
    FROM public.ride_priority_alerts a JOIN public.routes r ON r.id=a.route_id
    WHERE NOT a.suppressed AND r.is_active AND (
      lower(coalesce(r.front_config->>'visibility','public'))='public'
      OR (a.kind='cancelled' AND lower(coalesce(r.front_config->>'visibility',''))='draft')
    )
    AND (r.front_config->>'rideDateIso') ~ '^\d{4}-\d{2}-\d{2}$'
    AND (
      (r.front_config->>'rideDateIso') BETWEEN to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AND to_char((now() AT TIME ZONE 'Europe/Paris')::date+7,'YYYY-MM-DD')
      OR (a.previous_schedule->>'date') BETWEEN to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AND to_char((now() AT TIME ZONE 'Europe/Paris')::date+7,'YYYY-MM-DD')
    )
  ) relevant;
$$;
REVOKE ALL ON FUNCTION public.home_priority_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_priority_alerts() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public._home_alerts_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND CASE
    WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','team_rider','user'))
      THEN EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin')
    ELSE coalesce(auth.jwt()->'app_metadata'->>'goelo_super_admin','') IN ('true','1','t')
  END;
$$;
REVOKE ALL ON FUNCTION public._home_alerts_is_admin() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_home_alerts_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public._home_alerts_is_admin() THEN RAISE EXCEPTION 'Accès administrateur requis' USING ERRCODE='42501'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'route_id',r.id,'title',r.track_name,'group',r.group_label,
      'date',r.front_config->>'rideDateIso','departure',r.front_config->>'rideTime',
      'status',r.front_config->>'sortieStatus','kind',a.kind,'message',a.message,
      'suppressed',coalesce(a.suppressed,false),
      'visible',EXISTS(SELECT 1 FROM jsonb_array_elements(public.home_priority_alerts()) p WHERE p->>'route_id'=r.id)
    ) ORDER BY r.front_config->>'rideDateIso',r.id),'[]'::jsonb)
    FROM public.routes r LEFT JOIN public.ride_priority_alerts a ON a.route_id=r.id
    WHERE r.is_active AND (
      lower(coalesce(r.front_config->>'visibility','public'))='public'
      OR (a.kind='cancelled' AND lower(coalesce(r.front_config->>'visibility',''))='draft')
    ) AND (r.front_config->>'rideDateIso') ~ '^\d{4}-\d{2}-\d{2}$' AND (
      (r.front_config->>'rideDateIso') BETWEEN to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AND to_char((now() AT TIME ZONE 'Europe/Paris')::date+7,'YYYY-MM-DD')
      OR (a.previous_schedule->>'date') BETWEEN to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AND to_char((now() AT TIME ZONE 'Europe/Paris')::date+7,'YYYY-MM-DD')
    )
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_home_alerts_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_home_alerts_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_home_alert_set(p_route_id text,p_enabled boolean,p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r public.routes;
  visible boolean;
  status text;
  msg text := nullif(trim(p_message),'');
BEGIN
  IF NOT public._home_alerts_is_admin() THEN RAISE EXCEPTION 'Accès administrateur requis' USING ERRCODE='42501'; END IF;
  IF p_enabled IS NULL OR length(coalesce(msg,''))>400 THEN RAISE EXCEPTION 'Message limité à 400 caractères' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.routes WHERE id=trim(p_route_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sortie introuvable' USING ERRCODE='22023'; END IF;
  IF NOT p_enabled THEN
    UPDATE public.ride_priority_alerts SET suppressed=true WHERE route_id=r.id;
    RETURN jsonb_build_object('ok',true,'visible',false);
  END IF;
  -- Même périmètre de publication que la liste ; aucune sortie privée ne peut être annoncée.
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.admin_home_alerts_list()) p WHERE p->>'route_id'=r.id) THEN
    RAISE EXCEPTION 'Cette sortie ne peut pas être annoncée sur l’accueil' USING ERRCODE='22023';
  END IF;
  status := lower(coalesce(r.front_config->>'sortieStatus','open'));
  INSERT INTO public.ride_priority_alerts(route_id,kind,message,suppressed,changed_at)
  VALUES(r.id,CASE WHEN status IN ('cancelled','canceled','annulee','annulée') THEN 'cancelled' ELSE 'information' END,msg,false,now())
  ON CONFLICT(route_id) DO UPDATE SET message=EXCLUDED.message,suppressed=false,changed_at=EXCLUDED.changed_at;
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(public.home_priority_alerts()) p WHERE p->>'route_id'=r.id) INTO visible;
  RETURN jsonb_build_object('ok',true,'visible',visible);
END $$;
REVOKE ALL ON FUNCTION public.admin_home_alert_set(text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_home_alert_set(text,boolean,text) TO authenticated;
