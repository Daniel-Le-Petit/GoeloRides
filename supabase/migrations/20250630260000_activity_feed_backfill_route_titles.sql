-- GoëloRides — Backfill activity_events : route_title lisible (existant + futur).

CREATE OR REPLACE FUNCTION public.goelo_is_technical_route_ref(p_value text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_value IS NOT NULL
    AND trim(p_value) <> ''
    AND (
      trim(p_value) ~ '^c_[0-9a-f]+$'
      OR EXISTS (
        SELECT 1 FROM public.routes r WHERE r.id = trim(p_value)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.goelo_activity_route_id(
  p_entity_type text,
  p_entity_id   text,
  p_meta        jsonb
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    CASE WHEN p_entity_type = 'route' THEN nullif(trim(p_entity_id), '') END,
    nullif(trim(p_meta->>'route_id'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.goelo_activity_route_title(
  p_entity_type text,
  p_entity_id   text,
  p_meta        jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_rid        text;
  v_meta_title text;
BEGIN
  v_rid := public.goelo_activity_route_id(p_entity_type, p_entity_id, p_meta);
  v_meta_title := nullif(trim(p_meta->>'route_title'), '');

  IF v_meta_title IS NOT NULL THEN
    IF public.goelo_is_technical_route_ref(v_meta_title)
      OR (v_rid IS NOT NULL AND v_meta_title = v_rid)
    THEN
      v_meta_title := NULL;
    END IF;
  END IF;

  RETURN coalesce(
    v_meta_title,
    public.goelo_route_display_title(v_rid),
    'une sortie'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.goelo_sanitize_activity_metadata(
  p_entity_type text,
  p_entity_id   text,
  p_meta        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_rid  text;
  v_title text;
BEGIN
  v_rid := public.goelo_activity_route_id(p_entity_type, p_entity_id, v_meta);

  IF v_rid IS NOT NULL THEN
    v_title := public.goelo_route_display_title(v_rid);
    v_meta := v_meta || jsonb_build_object('route_id', v_rid, 'route_title', v_title);
  ELSIF v_meta ? 'route_title'
    AND public.goelo_is_technical_route_ref(v_meta->>'route_title')
  THEN
    v_title := public.goelo_route_display_title(v_meta->>'route_title');
    v_meta := v_meta || jsonb_build_object('route_title', v_title);
  END IF;

  RETURN v_meta;
END;
$$;

COMMENT ON FUNCTION public.goelo_is_technical_route_ref(text) IS
  'true si la valeur est un id route (c_* ou clé routes.id).';
COMMENT ON FUNCTION public.goelo_sanitize_activity_metadata(text, text, jsonb) IS
  'Normalise metadata.route_title avant stockage ou backfill.';

-- Backfill : remplacer route_title technique par track_name (routes existantes uniquement).
UPDATE public.activity_events ae
SET metadata = public.goelo_sanitize_activity_metadata(
  ae.entity_type,
  ae.entity_id,
  ae.metadata
)
WHERE public.goelo_activity_route_id(ae.entity_type, ae.entity_id, ae.metadata) IS NOT NULL
   OR (
     coalesce(ae.metadata, '{}'::jsonb) ? 'route_title'
     AND public.goelo_is_technical_route_ref(ae.metadata->>'route_title')
   );

-- Futur : RPC client — titres lisibles à l''insertion.
CREATE OR REPLACE FUNCTION public.activity_event_log(
  p_event_type   text,
  p_metadata     jsonb DEFAULT '{}'::jsonb,
  p_actor_id     uuid DEFAULT NULL,
  p_entity_type  text DEFAULT NULL,
  p_entity_id    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_meta  jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_pseudo text;
BEGIN
  v_actor := coalesce(p_actor_id, auth.uid());

  IF v_actor IS NOT NULL AND v_meta->>'actor_pseudo' IS NULL THEN
    SELECT nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), '')
    INTO v_pseudo
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_actor;

    IF v_pseudo IS NOT NULL THEN
      v_meta := v_meta || jsonb_build_object('actor_pseudo', v_pseudo);
    END IF;
  END IF;

  v_meta := public.goelo_sanitize_activity_metadata(p_entity_type, p_entity_id, v_meta);

  RETURN public._goelo_activity_emit(
    p_event_type,
    v_actor,
    p_entity_type,
    p_entity_id,
    v_meta || jsonb_build_object('source', 'rpc:activity_event_log')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_event_log(
  p_event_type   text,
  p_metadata     jsonb,
  p_route_id     text,
  p_route_title  text,
  p_actor_pseudo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_entity_type text := CASE WHEN p_route_id IS NOT NULL THEN 'route' ELSE NULL END;
  v_entity_id text := nullif(trim(p_route_id), '');
BEGIN
  IF p_actor_pseudo IS NOT NULL AND v_meta->>'actor_pseudo' IS NULL THEN
    v_meta := v_meta || jsonb_build_object('actor_pseudo', trim(p_actor_pseudo));
  END IF;
  IF p_route_title IS NOT NULL AND v_meta->>'route_title' IS NULL THEN
    v_meta := v_meta || jsonb_build_object('route_title', trim(p_route_title));
  END IF;
  IF p_route_id IS NOT NULL AND v_meta->>'route_id' IS NULL THEN
    v_meta := v_meta || jsonb_build_object('route_id', trim(p_route_id));
  END IF;

  v_meta := public.goelo_sanitize_activity_metadata(v_entity_type, v_entity_id, v_meta);

  RETURN public.activity_event_log(
    p_event_type,
    v_meta,
    auth.uid(),
    v_entity_type,
    v_entity_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activity_event_log(text, jsonb, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activity_event_log(text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_event_log(text, jsonb, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_event_log(text, jsonb, text, text, text) TO authenticated, service_role;

-- Dashboard : metadata exposée sans route_title technique.
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
        'metadata', row.safe_metadata,
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
      public.goelo_sanitize_activity_metadata(h.entity_type, h.entity_id, h.metadata) AS safe_metadata,
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
  'Feed admin depuis activity_feed_human ; metadata route_title humanisée.';

REVOKE ALL ON FUNCTION public.activity_admin_dashboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_admin_dashboard(int) TO authenticated, service_role;
