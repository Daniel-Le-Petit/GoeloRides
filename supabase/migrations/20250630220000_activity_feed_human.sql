  -- GoëloRides — Vue activity_feed_human : labels humanisés (source unique du texte UI).

-- DROP + CREATE : PostgreSQL interdit CREATE OR REPLACE si le type d'une colonne change (ex. id uuid → text).
DROP VIEW IF EXISTS public.activity_feed_human;

CREATE VIEW public.activity_feed_human AS
SELECT
  ae.id AS id,
    ae.event_type,
    ae.created_at,
    ae.entity_type,
    ae.entity_id,
    coalesce(ae.metadata, '{}'::jsonb) AS metadata,
    coalesce(
      nullif(trim(ae.metadata->>'actor_pseudo'), ''),
      nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
      'Quelqu''un'
    ) AS actor_pseudo,
    coalesce(
      nullif(trim(ae.metadata->>'route_title'), ''),
      CASE WHEN ae.entity_type = 'route' THEN (
        SELECT coalesce(r.front_config->>'title', r.id)
        FROM public.routes r
        WHERE r.id = ae.entity_id
      ) ELSE NULL END,
      CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
        SELECT coalesce(r.front_config->>'title', r.id)
        FROM public.routes r
        WHERE r.id = trim(ae.metadata->>'route_id')
      ) ELSE NULL END
    ) AS route_title,
    CASE ae.event_type
      WHEN 'USER_REGISTERED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' a créé un compte'
      WHEN 'USER_LOGIN' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' s''est connecté'
      WHEN 'RIDE_CREATED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' a créé la sortie '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN ae.entity_type = 'route' THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = ae.entity_id
          ) ELSE 'une sortie' END
        )
        || CASE
          WHEN nullif(trim(ae.metadata->>'km'), '') IS NOT NULL
          THEN ' (' || trim(ae.metadata->>'km') || ' km)'
          ELSE ''
        END
      WHEN 'RIDE_JOINED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' s''est inscrit·e à '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = trim(ae.metadata->>'route_id')
          ) ELSE 'une sortie' END
        )
      WHEN 'RIDE_LEFT' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' s''est désinscrit·e de '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = trim(ae.metadata->>'route_id')
          ) ELSE 'une sortie' END
        )
      WHEN 'RIDE_VIEWED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' a consulté '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = trim(ae.metadata->>'route_id')
          ) ELSE 'une sortie' END
        )
      WHEN 'COMMENT_CREATED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' a commenté sur '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = trim(ae.metadata->>'route_id')
          ) ELSE 'une sortie' END
        )
        || CASE
          WHEN coalesce(
            nullif(trim(ae.metadata->>'excerpt'), ''),
            nullif(trim(ae.metadata->>'preview'), '')
          ) IS NOT NULL
          THEN ' : « ' || coalesce(
            nullif(trim(ae.metadata->>'excerpt'), ''),
            nullif(trim(ae.metadata->>'preview'), '')
          ) || ' »'
          ELSE ''
        END
      WHEN 'LIKE_ADDED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' a aimé '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = trim(ae.metadata->>'route_id')
          ) ELSE 'une sortie' END
        )
      WHEN 'LIKE_REMOVED' THEN
        coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) || ' a retiré son like sur '
        || coalesce(
          nullif(trim(ae.metadata->>'route_title'), ''),
          CASE WHEN nullif(trim(ae.metadata->>'route_id'), '') IS NOT NULL THEN (
            SELECT coalesce(r.front_config->>'title', 'une sortie')
            FROM public.routes r WHERE r.id = trim(ae.metadata->>'route_id')
          ) ELSE 'une sortie' END
        )
      WHEN 'ERROR_API' THEN
        'Erreur API'
        || coalesce(
          ' (' || nullif(trim(coalesce(ae.metadata->>'source', ae.metadata->>'endpoint')), '') || ')',
          ''
        )
        || coalesce(' : ' || nullif(trim(ae.metadata->>'message'), ''), '')
      WHEN 'SUSPICIOUS_LOGIN' THEN
        'Connexion suspecte'
        || coalesce(
          ' depuis ' || nullif(trim(coalesce(ae.metadata->>'location_hint', ae.metadata->>'ip')), ''),
          ''
        )
        || CASE
          WHEN coalesce(
            nullif(trim(ae.metadata->>'actor_pseudo'), ''),
            nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
            'Quelqu''un'
          ) <> 'Quelqu''un'
          THEN ' — ' || coalesce(
            nullif(trim(ae.metadata->>'actor_pseudo'), ''),
            nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
            'Quelqu''un'
          )
          ELSE ''
        END
      ELSE NULL
    END AS label
  FROM public.activity_events ae
  LEFT JOIN public.profiles p ON p.id = ae.actor_id
  LEFT JOIN auth.users u ON u.id = ae.actor_id;

  COMMENT ON VIEW public.activity_feed_human IS
    'Feed admin humanisé : label = phrase complète, jamais d''UUID dans le texte.';

  GRANT SELECT ON public.activity_feed_human TO authenticated, service_role;

  -- Dashboard admin : lecture via activity_feed_human (label inclus).
  CREATE OR REPLACE FUNCTION public.activity_admin_dashboard(p_limit int DEFAULT 60)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    lim int := greatest(10, least(coalesce(p_limit, 60), 200));
    today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris';
    events jsonb;
    stats jsonb;
    logged_total int;
  BEGIN
    IF NOT public._goelo_activity_dashboard_allowed() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::int INTO logged_total FROM public.activity_events;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'event_type', row.event_type,
          'actor_pseudo', row.actor_pseudo,
          'label', row.label,
          'route_title', row.route_title,
          'metadata', row.metadata,
          'created_at', row.created_at
        )
        ORDER BY row.created_at DESC
      ),
      '[]'::jsonb
    )
    INTO events
    FROM (
      SELECT
        h.id,
        h.event_type,
        h.actor_pseudo,
        h.label,
        h.route_title,
        h.metadata,
        h.created_at
      FROM public.activity_feed_human h
      ORDER BY h.created_at DESC
      LIMIT lim
    ) row;

    SELECT jsonb_build_object(
      'rides_active', (
        SELECT count(*)::int FROM public.routes r WHERE r.is_active = true
      ),
      'rides_created_today', (
        SELECT count(*)::int FROM public.activity_events ae
        WHERE ae.event_type = 'RIDE_CREATED'
          AND ae.created_at >= today_start
      ),
      'cyclists_registered', (
        SELECT count(DISTINCT s.user_id)::int
        FROM public.signups s
        WHERE s.status IN ('joined', 'waiting')
      ),
      'cyclists_new_today', (
        SELECT count(DISTINCT ae.actor_id)::int
        FROM public.activity_events ae
        WHERE ae.event_type = 'RIDE_JOINED'
          AND ae.created_at >= today_start
          AND ae.actor_id IS NOT NULL
      ),
      'events_today', (
        SELECT count(*)::int FROM public.activity_events ae
        WHERE ae.created_at >= today_start
      ),
      'alerts', (
        SELECT count(*)::int FROM public.activity_events ae
        WHERE ae.event_type IN ('ERROR_API', 'SUSPICIOUS_LOGIN')
          AND ae.created_at >= now() - interval '7 days'
      ),
      'pending_demands', (
        SELECT count(*)::int FROM public.demandes d WHERE d.status = 'pending'
      ),
      'activity_events_total', logged_total,
      'feed_mode', 'activity_feed_human',
      'event_types', (
        SELECT coalesce(
          jsonb_object_agg(t.event_type, t.cnt),
          '{}'::jsonb
        )
        FROM (
          SELECT ae.event_type, count(*)::int AS cnt
          FROM public.activity_events ae
          GROUP BY ae.event_type
        ) t
      )
    ) INTO stats;

    RETURN jsonb_build_object('stats', stats, 'events', coalesce(events, '[]'::jsonb));
  END;
  $$;

  COMMENT ON FUNCTION public.activity_admin_dashboard(int) IS
    'Feed admin depuis activity_feed_human (labels humanisés).';

  REVOKE ALL ON FUNCTION public.activity_admin_dashboard(int) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.activity_admin_dashboard(int) TO authenticated, service_role;
