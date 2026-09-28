-- ============================================================================
-- GoëloRides #15 - Sortie du 5 octobre 2026
-- ============================================================================

INSERT INTO public.routes (
  id,
  track_name,
  group_label,
  pace_label,
  sort_order,
  is_active,
  route_kind,
  front_config,
  created_at
) VALUES (
  'goelorides_15',
  'GoëloRides #15 - Les Falaises du Goëlo',
  'Groupe Vert · Intermédiaire',
  '18–22 km/h',
  15,
  true,
  'custom',
  jsonb_build_object(
    'visibility', 'public',
    'sortieStatus', 'publiee',
    'raceType', 'route',
    'levelClass', 'level-vert',
    'rideDateIso', '2026-10-05',
    'rideTime', '09:00',
    'meetTime', '08:45',
    'meetPlace', 'Parking du Casino — Port d''Armor',
    'meetLat', 48.654786,
    'meetLon', -2.836854,
    'city', 'Saint-Quay-Portrieux',
    'cp', '22410',
    'captain', 'GoëloRides Team',
    'niveau', 'intermediaire',
    'maxParticipants', 35,
    'description', '<p><strong>GoëloRides #15</strong> — Découverte des falaises et panoramas de la Côte du Goëlo.</p><p>Parcours vallonné avec quelques montées, départ et arrivée au <em>Port d''Armor</em> (parking du Casino).</p><p>Sortie conviviale niveau intermédiaire, ouvert aux cyclistes du groupe <strong>Vert</strong>.</p><p>Itinéraire : Plouha → Falaises → Plouézec → Paimpol (pause) → retour Saint-Quay-Portrieux.</p>',
    'km', 52.5,
    'dplus', 620,
    'estimatedDurationHm', '2h45',
    'stats', jsonb_build_object(
      'totalKm', 52.5,
      'elevGainM', 620
    ),
    'thumbSrc', 'assets/goeloRidesHomePage-thumb.jpg'
  ),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  track_name = EXCLUDED.track_name,
  group_label = EXCLUDED.group_label,
  pace_label = EXCLUDED.pace_label,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  route_kind = EXCLUDED.route_kind,
  front_config = EXCLUDED.front_config;

COMMENT ON TABLE public.routes IS 'GoëloRides #15 ajoutée le 28 septembre 2026';
