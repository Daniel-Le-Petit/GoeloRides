-- Rapprochement réseau temporaire. Aucune IP brute conservée.
CREATE TABLE IF NOT EXISTS public.activity_network_secret(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 secret text NOT NULL DEFAULT (gen_random_uuid()::text||gen_random_uuid()::text),
 purged_on date NOT NULL DEFAULT current_date
);
INSERT INTO public.activity_network_secret(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.activity_network_links(
 event_id uuid PRIMARY KEY REFERENCES public.activity_events(id) ON DELETE CASCADE,
 network_key text NOT NULL CHECK(network_key ~ '^[a-f0-9]{64}$'),
 period text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS activity_network_links_expiry ON public.activity_network_links(captured_at);
ALTER TABLE public.activity_network_secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_network_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_network_secret,public.activity_network_links FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public._activity_network_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE headers jsonb; candidate text; address inet; salt text; bucket text; purge boolean;
BEGIN
 IF NEW.metadata->>'source' IS DISTINCT FROM 'rpc:activity_event_log' THEN RETURN NEW; END IF;
 headers:=nullif(current_setting('request.headers',true),'')::jsonb;
 -- Adresse transmise par le proxy HTTP. Indice réseau, jamais preuve d’identité.
 candidate:=coalesce(nullif(trim(headers->>'cf-connecting-ip'),''),nullif(trim(headers->>'x-real-ip'),''),
   nullif(trim(split_part(headers->>'x-forwarded-for',',',1)),''));
 IF candidate IS NULL OR length(candidate)>64 OR candidate LIKE '%/%' THEN RETURN NEW; END IF;
 address:=candidate::inet;
 IF address IS NULL THEN RETURN NEW; END IF;
 SELECT secret INTO salt FROM public.activity_network_secret WHERE singleton;
 IF salt IS NULL THEN RETURN NEW; END IF;
 bucket:=to_char(now() AT TIME ZONE 'Europe/Paris','YYYY-MM');
 INSERT INTO public.activity_network_links(event_id,network_key,period)
 VALUES(NEW.id,encode(sha256(convert_to(salt||':'||bucket||':'||host(address),'UTF8')),'hex'),bucket)
 ON CONFLICT(event_id) DO NOTHING;
 UPDATE public.activity_network_secret SET purged_on=current_date WHERE singleton AND purged_on<current_date RETURNING true INTO purge;
 IF purge THEN DELETE FROM public.activity_network_links WHERE captured_at<now()-interval '30 days'; END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- La mesure ne doit jamais empêcher une activité ni une participation.
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._activity_network_capture() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS activity_network_capture ON public.activity_events;
CREATE TRIGGER activity_network_capture AFTER INSERT ON public.activity_events FOR EACH ROW EXECUTE FUNCTION public._activity_network_capture();
CREATE OR REPLACE FUNCTION public.admin_activity_network_links(p_event_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF coalesce(cardinality(p_event_ids),0)>5000 THEN RAISE EXCEPTION 'too_many_events'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('event_id',event_id,'network_key',network_key,'period',period)),'[]'::jsonb)
 INTO result FROM public.activity_network_links WHERE event_id=ANY(p_event_ids) AND captured_at>=now()-interval '30 days';
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_activity_network_links(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_network_links(uuid[]) TO authenticated;
COMMENT ON TABLE public.activity_network_links IS 'Identifiants réseau salés, mensuels et accessibles uniquement à un admin. Expiration à 30 jours, purge quotidienne à la prochaine activité mesurable. Ne prouvent ni une personne unique ni une cause d’abandon.';
NOTIFY pgrst,'reload schema';
