-- activity_admin_dashboard : autoriser SQL Editor (postgres) et service_role,
-- tout en refusant anon / utilisateurs non admin via l'API.

CREATE OR REPLACE FUNCTION public._goelo_activity_dashboard_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public._goelo_caller_is_admin()
    OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR coalesce(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');
$$;

REVOKE ALL ON FUNCTION public._goelo_activity_dashboard_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_activity_dashboard_allowed() TO authenticated, service_role;

-- Garde mise à jour (corps inchangé par rapport à 20250630190000)
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

  WITH logged AS (
    SELECT
      ae.id::text AS id,
      ae.event_type,
      ae.actor_pseudo,
      ae.route_id,
      ae.route_title,
      coalesce(ae.metadata, '{}'::jsonb) || jsonb_build_object('feed_source', 'activity_events') AS metadata,
      ae.created_at
    FROM public.activity_events ae
    ORDER BY ae.created_at DESC
    LIMIT lim
  ),
  synth_routes AS (
    SELECT
      'route-' || r.id AS id,
      'RIDE_CREATED'::text AS event_type,
      coalesce(r.front_config->>'organizer', r.front_config->>'title', 'Team Rider') AS actor_pseudo,
      r.id AS route_id,
      coalesce(r.front_config->>'title', r.id) AS route_title,
      jsonb_build_object(
        'feed_source', 'routes',
        'route_kind', r.route_kind,
        'km', r.front_config->'profile'->>'totalKm'
      ) AS metadata,
      coalesce(
        nullif(trim(r.front_config->>'createdAt'), '')::timestamptz,
        r.created_at
      ) AS created_at
    FROM public.routes r
    WHERE r.is_active = true
      AND r.route_kind = 'custom'
    ORDER BY coalesce(
      nullif(trim(r.front_config->>'createdAt'), '')::timestamptz,
      r.created_at
    ) DESC NULLS LAST
    LIMIT 20
  ),
  synth_signups AS (
    SELECT
      'signup-' || s.id::text AS id,
      'RIDE_JOINED'::text AS event_type,
      coalesce(
        nullif(trim(public.get_display_name(pr.pseudo, pr.username, au.email)), ''),
        'Cycliste'
      ) AS actor_pseudo,
      s.route_id,
      coalesce(rt.front_config->>'title', s.route_id) AS route_title,
      jsonb_build_object('feed_source', 'signups', 'status', s.status) AS metadata,
      s.created_at
    FROM public.signups s
    LEFT JOIN public.profiles pr ON pr.id = s.user_id
    LEFT JOIN auth.users au ON au.id = pr.id
    LEFT JOIN public.routes rt ON rt.id = s.route_id
    WHERE s.status IN ('joined', 'active')
    ORDER BY s.created_at DESC
    LIMIT 25
  ),
  synth_profiles AS (
    SELECT
      'profile-' || pr.id::text AS id,
      'USER_REGISTERED'::text AS event_type,
      coalesce(
        nullif(trim(public.get_display_name(pr.pseudo, pr.username, au.email)), ''),
        'Nouveau'
      ) AS actor_pseudo,
      NULL::text AS route_id,
      NULL::text AS route_title,
      jsonb_build_object('feed_source', 'profiles', 'role', pr.role) AS metadata,
      pr.created_at
    FROM public.profiles pr
    LEFT JOIN auth.users au ON au.id = pr.id
    WHERE pr.role IN ('user', 'team_rider', 'admin')
    ORDER BY pr.created_at DESC
    LIMIT 15
  ),
  synth_comments AS (
    SELECT
      'comment-' || c.id::text AS id,
      'COMMENT_CREATED'::text AS event_type,
      c.pseudo AS actor_pseudo,
      c.route_id,
      coalesce(rt.front_config->>'title', c.route_id) AS route_title,
      jsonb_build_object(
        'feed_source', 'route_comments',
        'preview', left(trim(c.body), 80)
      ) AS metadata,
      c.created_at
    FROM public.route_comments c
    LEFT JOIN public.routes rt ON rt.id = c.route_id
    ORDER BY c.created_at DESC
    LIMIT 20
  ),
  synth_demandes AS (
    SELECT
      'demande-' || d.id::text AS id,
      CASE WHEN d.status = 'approved' THEN 'USER_REGISTERED' ELSE 'USER_LOGIN' END AS event_type,
      coalesce(
        nullif(trim(d.first_name || ' ' || d.last_name), ''),
        nullif(trim(split_part(lower(coalesce(d.email, '')), '@', 1)), ''),
        'Candidat'
      ) AS actor_pseudo,
      NULL::text AS route_id,
      NULL::text AS route_title,
      jsonb_build_object(
        'feed_source', 'demandes',
        'demande_status', d.status,
        'level', d.level
      ) AS metadata,
      coalesce(d.approved_at, d.created_at) AS created_at
    FROM public.demandes d
    ORDER BY coalesce(d.approved_at, d.created_at) DESC NULLS LAST
    LIMIT 15
  ),
  merged AS (
    SELECT * FROM logged
    UNION ALL
    SELECT * FROM synth_routes
    UNION ALL
    SELECT * FROM synth_signups
    UNION ALL
    SELECT * FROM synth_profiles
    UNION ALL
    SELECT * FROM synth_comments
    UNION ALL
    SELECT * FROM synth_demandes
  ),
  ranked AS (
    SELECT DISTINCT ON (m.id)
      m.id, m.event_type, m.actor_pseudo, m.route_id, m.route_title, m.metadata, m.created_at
    FROM merged m
    ORDER BY m.id, m.created_at DESC
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'event_type', r.event_type,
        'actor_pseudo', r.actor_pseudo,
        'route_id', r.route_id,
        'route_title', r.route_title,
        'metadata', r.metadata,
        'created_at', r.created_at
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO events
  FROM (
    SELECT * FROM ranked
    ORDER BY created_at DESC
    LIMIT lim
  ) r;

  SELECT jsonb_build_object(
    'rides_active', (
      SELECT count(*)::int FROM public.routes r WHERE r.is_active = true
    ),
    'rides_created_today', (
      SELECT count(*)::int FROM public.routes r
      WHERE r.is_active = true AND r.route_kind = 'custom'
        AND coalesce((r.front_config->>'createdAt')::timestamptz, r.created_at) >= today_start
    ),
    'cyclists_registered', (
      SELECT count(DISTINCT s.user_id)::int FROM public.signups s WHERE s.status IN ('joined', 'active')
    ),
    'cyclists_new_today', (
      SELECT count(DISTINCT s.user_id)::int FROM public.signups s
      WHERE s.status IN ('joined', 'active') AND s.created_at >= today_start
    ),
    'events_today', (
      SELECT count(*)::int FROM (
        SELECT created_at FROM public.activity_events WHERE created_at >= today_start
        UNION ALL
        SELECT s.created_at FROM public.signups s WHERE s.created_at >= today_start
      ) x
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
    'feed_sources', jsonb_build_object(
      'activity_events', logged_total,
      'routes', (SELECT count(*)::int FROM public.routes WHERE is_active AND route_kind = 'custom'),
      'signups', (SELECT count(*)::int FROM public.signups WHERE status IN ('joined', 'active')),
      'profiles', (SELECT count(*)::int FROM public.profiles WHERE role IN ('user', 'team_rider', 'admin')),
      'route_comments', (SELECT count(*)::int FROM public.route_comments),
      'demandes', (SELECT count(*)::int FROM public.demandes)
    ),
    'feed_mode', CASE
      WHEN logged_total = 0 THEN 'synthesized_legacy_tables'
      ELSE 'activity_events_plus_synthesis'
    END
  ) INTO stats;

  RETURN jsonb_build_object('stats', stats, 'events', coalesce(events, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.activity_admin_dashboard(int) IS
  'Feed admin. Appel API : admin JWT requis. SQL Editor (postgres) et service_role autorisés pour maintenance.';

REVOKE ALL ON FUNCTION public.activity_admin_dashboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_admin_dashboard(int) TO authenticated, service_role;
