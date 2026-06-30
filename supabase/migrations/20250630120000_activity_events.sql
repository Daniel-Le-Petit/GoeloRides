-- GoëloRides — Activity events (admin dashboard feed + stats)
-- Scalable : nouveaux event_type → formatter côté js/goelo-activity.js

CREATE TABLE IF NOT EXISTS public.activity_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  actor_user_id UUID,
  actor_pseudo  TEXT,
  route_id      TEXT,
  route_title   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_events_type_chk CHECK (
    event_type IN (
      'USER_REGISTERED', 'USER_LOGIN', 'RIDE_CREATED', 'RIDE_JOINED', 'RIDE_LEFT',
      'RIDE_VIEWED', 'COMMENT_CREATED', 'LIKE_ADDED', 'LIKE_REMOVED',
      'ERROR_API', 'SUSPICIOUS_LOGIN'
    )
  )
);

CREATE INDEX IF NOT EXISTS activity_events_created_idx
  ON public.activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_type_idx
  ON public.activity_events (event_type);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_events_deny_anon" ON public.activity_events;
CREATE POLICY "activity_events_deny_anon"
  ON public.activity_events FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "activity_events_service_role" ON public.activity_events;
CREATE POLICY "activity_events_service_role"
  ON public.activity_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activity_event_log(
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_route_id text DEFAULT NULL,
  p_route_title text DEFAULT NULL,
  p_actor_pseudo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  pseudo text;
BEGIN
  pseudo := coalesce(
    nullif(trim(p_actor_pseudo), ''),
    nullif(trim((SELECT p.pseudo FROM public.profiles p WHERE p.id = auth.uid())), ''),
    'User'
  );

  INSERT INTO public.activity_events (
    event_type, actor_user_id, actor_pseudo, route_id, route_title, metadata
  ) VALUES (
    p_event_type,
    auth.uid(),
    pseudo,
    p_route_id,
    p_route_title,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activity_event_log(text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_event_log(text, jsonb, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
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
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH logged AS (
    SELECT
      ae.id::text AS id,
      ae.event_type,
      ae.actor_pseudo,
      ae.route_id,
      ae.route_title,
      ae.metadata,
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
      coalesce(p.pseudo, p.display_name, 'Cycliste') AS actor_pseudo,
      s.route_id,
      coalesce(rt.front_config->>'title', s.route_id) AS route_title,
      jsonb_build_object('status', s.status) AS metadata,
      s.created_at
    FROM public.signups s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.routes rt ON rt.id = s.route_id
    WHERE s.status IN ('joined', 'active')
    ORDER BY s.created_at DESC
    LIMIT 25
  ),
  synth_profiles AS (
    SELECT
      'profile-' || p.id::text AS id,
      'USER_REGISTERED'::text AS event_type,
      coalesce(p.pseudo, p.display_name, 'Nouveau') AS actor_pseudo,
      NULL::text AS route_id,
      NULL::text AS route_title,
      jsonb_build_object('role', p.role) AS metadata,
      p.created_at
    FROM public.profiles p
    WHERE p.role IN ('user', 'team_rider', 'admin')
    ORDER BY p.created_at DESC
    LIMIT 15
  ),
  synth_comments AS (
    SELECT
      'comment-' || c.id::text AS id,
      'COMMENT_CREATED'::text AS event_type,
      c.pseudo AS actor_pseudo,
      c.route_id,
      coalesce(rt.front_config->>'title', c.route_id) AS route_title,
      jsonb_build_object('preview', left(trim(c.body), 80)) AS metadata,
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
      coalesce(d.pseudo, trim(d.first_name || ' ' || d.last_name), 'Candidat') AS actor_pseudo,
      NULL::text AS route_id,
      NULL::text AS route_title,
      jsonb_build_object('demande_status', d.status, 'level', d.level) AS metadata,
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
    )
  ) INTO stats;

  RETURN jsonb_build_object('stats', stats, 'events', coalesce(events, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.activity_admin_dashboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_admin_dashboard(int) TO authenticated, service_role;
