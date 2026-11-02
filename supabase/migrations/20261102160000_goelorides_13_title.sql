-- Corriger le titre canonique de la sortie #13 et ses copies affichées.
DO $$
DECLARE
  rid text;
  old_title text;
  new_title constant text := 'GoëloRides #13 - Le circuit des falaises';
BEGIN
  SELECT id, track_name INTO STRICT rid, old_title
  FROM public.routes WHERE track_name ~ '#13([^0-9]|$)';

  UPDATE public.routes
  SET track_name = new_title,
      front_config = replace(coalesce(front_config, '{}'::jsonb)::text,
        to_jsonb(old_title)::text, to_jsonb(new_title)::text)::jsonb
  WHERE id = rid;

  UPDATE public.ride_albums
  SET title = new_title, updated_at = now()
  WHERE route_id = rid OR title ~ '#13([^0-9]|$)';

  UPDATE public.activity_events
  SET metadata = coalesce(metadata, '{}'::jsonb) ||
      jsonb_build_object('route_title', new_title)
  WHERE (entity_type = 'route' AND entity_id = rid)
     OR metadata->>'route_id' = rid
     OR metadata->>'route_title' = old_title;

  IF NOT EXISTS (SELECT 1 FROM public.routes WHERE id = rid AND track_name = new_title)
     OR EXISTS (SELECT 1 FROM public.ride_albums
                WHERE (route_id = rid OR title ~ '#13([^0-9]|$)') AND title <> new_title)
  THEN
    RAISE EXCEPTION 'Correction du titre #13 incomplète';
  END IF;
END $$;

SELECT id, track_name FROM public.routes WHERE track_name ~ '#13([^0-9]|$)';
SELECT route_id, title FROM public.ride_albums WHERE title ~ '#13([^0-9]|$)';
