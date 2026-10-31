-- Annonces partagées : aucune dépendance au cache du visiteur.
CREATE TABLE IF NOT EXISTS public.ride_priority_alerts (
  route_id text PRIMARY KEY REFERENCES public.routes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cancelled','schedule')),
  previous_schedule jsonb NOT NULL DEFAULT '{}',
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ride_priority_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ride_priority_alerts FROM PUBLIC, anon, authenticated;

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
    ON CONFLICT(route_id) DO UPDATE SET kind=EXCLUDED.kind,previous_schedule=EXCLUDED.previous_schedule,changed_at=EXCLUDED.changed_at;
  ELSIF NOT is_cancelled AND old_status IN ('cancelled','canceled','annulee','annulée') THEN
    DELETE FROM public.ride_priority_alerts WHERE route_id=NEW.id;
  ELSIF NOT is_cancelled AND status IN ('open','published','publiee','publiée','reportee','reportée','postponed') AND was_public AND old_schedule IS DISTINCT FROM new_schedule THEN
    INSERT INTO public.ride_priority_alerts(route_id,kind,previous_schedule,changed_at)
    VALUES(NEW.id,'schedule',old_schedule,now())
    ON CONFLICT(route_id) DO UPDATE SET kind=EXCLUDED.kind,previous_schedule=EXCLUDED.previous_schedule,changed_at=EXCLUDED.changed_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_ride_priority_alert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS capture_ride_priority_alert ON public.routes;
CREATE TRIGGER capture_ride_priority_alert AFTER UPDATE OF front_config,is_active ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.capture_ride_priority_alert();

-- Reprendre les annulations déjà enregistrées ; aucun ancien horaire n'est inventé.
INSERT INTO public.ride_priority_alerts(route_id,kind)
SELECT id,'cancelled' FROM public.routes
WHERE is_active AND lower(coalesce(front_config->>'visibility','public'))='public'
  AND lower(coalesce(front_config->>'sortieStatus','')) IN ('cancelled','canceled','annulee','annulée')
ON CONFLICT(route_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.home_priority_alerts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY ride_day,priority,changed_at DESC),'[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'route_id',r.id,'kind',a.kind,'title',r.track_name,'group',r.group_label,
      'date',r.front_config->>'rideDateIso','departure',r.front_config->>'rideTime',
      'meeting',r.front_config->>'meetTime','place',r.front_config->>'meetPlace',
      'previous',a.previous_schedule,'changed_at',a.changed_at
    ) AS item, r.front_config->>'rideDateIso' AS ride_day,
    CASE WHEN a.kind='cancelled' THEN 0 ELSE 1 END AS priority,a.changed_at
    FROM public.ride_priority_alerts a JOIN public.routes r ON r.id=a.route_id
    WHERE r.is_active AND (
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
