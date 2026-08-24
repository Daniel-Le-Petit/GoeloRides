-- ============================================================================
-- GoëloRides — Optimisation homepage : RPC routes_upcoming_homepage
-- ============================================================================
-- Retourne directement les 3 prochaines sorties publiques actives avec :
-- - seulement les champs front_config nécessaires (pas de GPX, descriptions)
-- - calcul côté serveur de la date de sortie
-- - filtrage côté serveur (public, non annulées, futures)
-- - tri par date de sortie
-- - limite à 3 résultats
-- ============================================================================

CREATE OR REPLACE FUNCTION public.routes_upcoming_homepage(p_limit int DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_limit int := coalesce(nullif(p_limit, 0), 3);
BEGIN
  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'track_name', r.track_name,
          'group_label', r.group_label,
          'pace_label', r.pace_label,
          'assigned_team_rider_id', r.assigned_team_rider_id,
          'team_rider_pseudo', tr.pseudo,
          'created_at', r.created_at,
          -- Champs front_config nécessaires uniquement
          'rideDateIso', r.front_config->>'rideDateIso',
          'rideTime', r.front_config->>'rideTime',
          'meetTime', r.front_config->>'meetTime',
          'meetPlace', r.front_config->>'meetPlace',
          'meet_place', r.front_config->>'meet_place',
          'meetLat', r.front_config->>'meetLat',
          'meetLon', r.front_config->>'meetLon',
          'levelClass', r.front_config->>'levelClass',
          'raceType', r.front_config->>'raceType',
          'sortieStatus', r.front_config->>'sortieStatus',
          'visibility', r.front_config->>'visibility',
          'thumbSrc', r.front_config->>'thumbSrc',
          'coverImageUrl', r.front_config->>'coverImageUrl',
          'coverImageDataUrl', r.front_config->>'coverImageDataUrl',
          'km', r.front_config->'stats'->>'totalKm',
          'totalKm', r.front_config->'stats'->>'totalKm',
          'dplus', r.front_config->'stats'->>'elevGainM',
          'elevGainM', r.front_config->'stats'->>'elevGainM',
          'estimatedDurationHm', r.front_config->>'estimatedDurationHm',
          'estimated_duration_hm', r.front_config->>'estimated_duration_hm',
          'embeddedPoints', r.front_config->'embeddedPoints'
        )
        ORDER BY computed_date ASC NULLS LAST
      )
      FROM (
        SELECT
          r.*,
          tr.pseudo,
          -- Calcul de la date côté serveur
          CASE
            -- Cas 1: rideDateIso + rideTime
            WHEN r.front_config->>'rideDateIso' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (
              (r.front_config->>'rideDateIso')::date 
              + coalesce(
                  (r.front_config->>'rideTime')::time,
                  '08:30'::time
                )
            )::timestamptz
            -- Cas 2: fallback null si pas de date valide
            ELSE NULL
          END AS computed_date
        FROM public.routes r
        LEFT JOIN public.profiles tr ON tr.id = r.assigned_team_rider_id
        WHERE r.is_active = true
          -- Filtrage sortieStatus
          AND lower(trim(coalesce(r.front_config->>'sortieStatus', 'open'))) NOT IN ('cancelled', 'canceled', 'annulee', 'annulée')
          -- Filtrage visibility
          AND lower(trim(coalesce(r.front_config->>'visibility', 'public'))) = 'public'
      ) AS r
      WHERE r.computed_date IS NOT NULL
        AND r.computed_date >= v_now
      ORDER BY r.computed_date ASC
      LIMIT v_limit
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.routes_upcoming_homepage(int) IS
  'Retourne les N prochaines sorties publiques actives pour la homepage, avec seulement les champs front_config nécessaires.';

-- Droits d'exécution
REVOKE ALL ON FUNCTION public.routes_upcoming_homepage(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.routes_upcoming_homepage(int) TO anon, authenticated, service_role;
