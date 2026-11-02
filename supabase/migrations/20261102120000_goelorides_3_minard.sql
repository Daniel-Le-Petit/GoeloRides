-- Source : publication Facebook transmise par Daniel (20 juillet 2026).
-- Date de la sortie : mardi 21 juillet 2026, et non date de publication.
DO $$
DECLARE
  existing_id text;
  details jsonb := jsonb_build_object(
    'visibility', 'public',
    'sortieStatus', 'publiee',
    'raceType', 'route',
    'rideDateIso', '2026-07-21',
    'rideTime', '09:00',
    'meetPlace', 'Parking du Casino - Saint-Quay-Portrieux',
    'city', 'Saint-Quay-Portrieux',
    'cp', '22410',
    'routeCities', jsonb_build_array('Saint-Quay-Portrieux', 'Pléhédel', 'Lanloup', 'Pointe de Minard'),
    'description', '<p>Après deux belles sorties, on se retrouve pour une nouvelle balade sur les routes du Goëlo !</p><p>Saint-Quay-Portrieux → Pléhédel → Lanloup → Pointe de Minard → retour par les routes du Goëlo.</p><p>Entre mer et campagne, cette sortie nous emmènera sur quelques-unes des plus belles routes du secteur, dans une ambiance conviviale et avec un rythme adapté au groupe.</p>'
  );
BEGIN
  -- Réutiliser une éventuelle fiche existante afin de conserver ses associations.
  SELECT id INTO existing_id FROM public.routes
  WHERE id = 'goelorides_3'
     OR (front_config->>'rideDateIso' = '2026-07-21'
         AND (track_name ~ '#3([^0-9]|$)' OR track_name ILIKE '%Pointe de Minard%'))
  ORDER BY CASE WHEN id = 'goelorides_3' THEN 0 ELSE 1 END, id LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.routes(id, track_name, group_label, pace_label, sort_order, is_active, route_kind, front_config)
    VALUES ('goelorides_3', 'GoëloRides #3 - Direction la Pointe de Minard !',
            NULL, NULL, 3, true, 'custom', details);
  ELSE
    UPDATE public.routes SET
      track_name = 'GoëloRides #3 - Direction la Pointe de Minard !',
      is_active = true,
      front_config = coalesce(front_config, '{}'::jsonb) || details
    WHERE id = existing_id;
  END IF;
END $$;
