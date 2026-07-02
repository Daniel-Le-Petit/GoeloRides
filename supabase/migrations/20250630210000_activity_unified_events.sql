-- GoëloRides — Activity feed unifié : activity_events = source unique.
-- 1) Schéma standard (actor_id, entity_type, entity_id, metadata)
-- 2) Backfill depuis tables opérationnelles (migration one-shot, dedup_key)
-- 3) Triggers sur routes, signups, profiles, route_comments, demandes
-- 4) activity_admin_dashboard lit uniquement activity_events

-- ---------------------------------------------------------------------------
-- 1. Schéma activity_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS actor_id    UUID,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id   TEXT,
  ADD COLUMN IF NOT EXISTS dedup_key   TEXT;

UPDATE public.activity_events ae
SET
  actor_id = coalesce(ae.actor_id, ae.actor_user_id),
  entity_type = coalesce(
    ae.entity_type,
    CASE WHEN ae.route_id IS NOT NULL THEN 'route' ELSE NULL END
  ),
  entity_id = coalesce(ae.entity_id, ae.route_id),
  metadata = coalesce(ae.metadata, '{}'::jsonb)
    || CASE WHEN ae.actor_pseudo IS NOT NULL AND ae.metadata->>'actor_pseudo' IS NULL
         THEN jsonb_build_object('actor_pseudo', ae.actor_pseudo) ELSE '{}'::jsonb END
    || CASE WHEN ae.route_title IS NOT NULL AND ae.metadata->>'route_title' IS NULL
         THEN jsonb_build_object('route_title', ae.route_title) ELSE '{}'::jsonb END
WHERE ae.actor_user_id IS NOT NULL
   OR ae.route_id IS NOT NULL
   OR ae.actor_pseudo IS NOT NULL
   OR ae.route_title IS NOT NULL;

UPDATE public.activity_events ae
SET
  entity_type = 'demande',
  entity_id = ae.metadata->>'demande_id',
  actor_id = coalesce(ae.actor_id, (ae.metadata->>'actor_user_id')::uuid)
WHERE ae.metadata->>'demande_id' IS NOT NULL
  AND (ae.entity_type IS NULL OR ae.entity_id IS NULL);

ALTER TABLE public.activity_events DROP COLUMN IF EXISTS actor_user_id;
ALTER TABLE public.activity_events DROP COLUMN IF EXISTS actor_pseudo;
ALTER TABLE public.activity_events DROP COLUMN IF EXISTS route_id;
ALTER TABLE public.activity_events DROP COLUMN IF EXISTS route_title;

CREATE UNIQUE INDEX IF NOT EXISTS activity_events_dedup_key_uidx
  ON public.activity_events (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_events_actor_idx
  ON public.activity_events (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_events_entity_idx
  ON public.activity_events (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

ALTER TABLE public.activity_events DROP CONSTRAINT IF EXISTS activity_events_entity_type_chk;
ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_entity_type_chk CHECK (
    entity_type IS NULL OR entity_type IN (
      'route', 'signup', 'profile', 'comment', 'demande', 'user', 'api', 'session'
    )
  );

COMMENT ON TABLE public.activity_events IS
  'Journal d''activité unifié — seule source du feed admin (activity_admin_dashboard).';

-- ---------------------------------------------------------------------------
-- 2. Émission interne (triggers + backfill)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._goelo_activity_emit(
  p_event_type  text,
  p_actor_id    uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id   text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb,
  p_created_at  timestamptz DEFAULT now(),
  p_dedup_key   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_dedup_key IS NOT NULL THEN
    SELECT ae.id INTO v_id
    FROM public.activity_events ae
    WHERE ae.dedup_key = p_dedup_key;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.activity_events (
    event_type, actor_id, entity_type, entity_id, metadata, created_at, dedup_key
  ) VALUES (
    p_event_type,
    p_actor_id,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_created_at, now()),
    p_dedup_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  IF p_dedup_key IS NOT NULL THEN
    SELECT ae.id INTO v_id
    FROM public.activity_events ae
    WHERE ae.dedup_key = p_dedup_key;
    RETURN v_id;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._goelo_activity_emit(text, uuid, text, text, jsonb, timestamptz, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Backfill legacy (idempotent via dedup_key)
-- ---------------------------------------------------------------------------
INSERT INTO public.activity_events (
  event_type, actor_id, entity_type, entity_id, metadata, created_at, dedup_key
)
SELECT
  'RIDE_CREATED',
  NULL::uuid,
  'route',
  r.id,
  jsonb_build_object(
    'actor_pseudo', coalesce(r.front_config->>'organizer', r.front_config->>'title', 'Team Rider'),
    'route_title', coalesce(r.front_config->>'title', r.id),
    'route_kind', r.route_kind,
    'km', r.front_config->'profile'->>'totalKm',
    'migrated_from', 'routes'
  ),
  coalesce(
    nullif(trim(r.front_config->>'createdAt'), '')::timestamptz,
    r.created_at
  ),
  'legacy:route:' || r.id
FROM public.routes r
WHERE r.is_active = true
  AND r.route_kind = 'custom'
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, entity_type, entity_id, metadata, created_at, dedup_key
)
SELECT
  'RIDE_JOINED',
  s.user_id,
  'signup',
  s.id::text,
  jsonb_build_object(
    'actor_pseudo', coalesce(
      nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
      'Cycliste'
    ),
    'route_title', coalesce(rt.front_config->>'title', s.route_id),
    'route_id', s.route_id,
    'status', s.status,
    'migrated_from', 'signups'
  ),
  s.created_at,
  'legacy:signup:' || s.id::text
FROM public.signups s
LEFT JOIN public.profiles p ON p.id = s.user_id
LEFT JOIN auth.users u ON u.id = p.id
LEFT JOIN public.routes rt ON rt.id = s.route_id
WHERE s.status IN ('joined', 'waiting')
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, entity_type, entity_id, metadata, created_at, dedup_key
)
SELECT
  'USER_REGISTERED',
  pr.id,
  'profile',
  pr.id::text,
  jsonb_build_object(
    'actor_pseudo', coalesce(
      nullif(trim(public.get_display_name(pr.pseudo, pr.username, au.email)), ''),
      'Nouveau'
    ),
    'role', pr.role,
    'migrated_from', 'profiles'
  ),
  pr.created_at,
  'legacy:profile:' || pr.id::text
FROM public.profiles pr
LEFT JOIN auth.users au ON au.id = pr.id
WHERE pr.role IN ('user', 'team_rider', 'admin')
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, entity_type, entity_id, metadata, created_at, dedup_key
)
SELECT
  'COMMENT_CREATED',
  NULL::uuid,
  'comment',
  c.id::text,
  jsonb_build_object(
    'actor_pseudo', c.pseudo,
    'route_title', coalesce(rt.front_config->>'title', c.route_id),
    'route_id', c.route_id,
    'preview', left(trim(c.body), 80),
    'migrated_from', 'route_comments'
  ),
  c.created_at,
  'legacy:comment:' || c.id::text
FROM public.route_comments c
LEFT JOIN public.routes rt ON rt.id = c.route_id
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO public.activity_events (
  event_type, actor_id, entity_type, entity_id, metadata, created_at, dedup_key
)
SELECT
  CASE WHEN d.status = 'approved' THEN 'USER_REGISTERED' ELSE 'USER_LOGIN' END,
  d.auth_user_id,
  'demande',
  d.id::text,
  jsonb_build_object(
    'actor_pseudo', coalesce(
      nullif(trim(d.first_name || ' ' || d.last_name), ''),
      nullif(trim(split_part(lower(coalesce(d.email, '')), '@', 1)), ''),
      'Candidat'
    ),
    'demande_status', d.status,
    'level', d.level,
    'migrated_from', 'demandes'
  ),
  coalesce(d.approved_at, d.created_at),
  'legacy:demande:' || d.id::text
FROM public.demandes d
ON CONFLICT (dedup_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Triggers — nouveaux événements en temps réel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_routes_activity_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.route_kind = 'custom' AND NEW.is_active THEN
    PERFORM public._goelo_activity_emit(
      'RIDE_CREATED',
      auth.uid(),
      'route',
      NEW.id,
      jsonb_build_object(
        'actor_pseudo', coalesce(NEW.front_config->>'organizer', NEW.front_config->>'title', 'Team Rider'),
        'route_title', coalesce(NEW.front_config->>'title', NEW.id),
        'route_kind', NEW.route_kind,
        'km', NEW.front_config->'profile'->>'totalKm',
        'source', 'trigger:routes'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routes_activity ON public.routes;
CREATE TRIGGER trg_routes_activity
  AFTER INSERT ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_routes_activity_fn();

CREATE OR REPLACE FUNCTION public.trg_signups_activity_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pseudo text;
  v_route_title text;
  v_meta jsonb;
BEGIN
  SELECT coalesce(
    nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
    'Cycliste'
  )
  INTO v_pseudo
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = NEW.user_id;

  SELECT coalesce(r.front_config->>'title', NEW.route_id)
  INTO v_route_title
  FROM public.routes r
  WHERE r.id = NEW.route_id;

  v_meta := jsonb_build_object(
    'actor_pseudo', coalesce(v_pseudo, 'Cycliste'),
    'route_title', v_route_title,
    'route_id', NEW.route_id,
    'status', NEW.status,
    'source', 'trigger:signups'
  );

  IF TG_OP = 'INSERT' AND NEW.status IN ('joined', 'waiting') THEN
    PERFORM public._goelo_activity_emit(
      'RIDE_JOINED', NEW.user_id, 'signup', NEW.id::text, v_meta
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('joined', 'waiting') AND NEW.status = 'cancelled' THEN
      PERFORM public._goelo_activity_emit(
        'RIDE_LEFT', NEW.user_id, 'signup', NEW.id::text, v_meta
      );
    ELSIF OLD.status = 'cancelled' AND NEW.status IN ('joined', 'waiting') THEN
      PERFORM public._goelo_activity_emit(
        'RIDE_JOINED', NEW.user_id, 'signup', NEW.id::text, v_meta
      );
    ELSIF OLD.status = 'waiting' AND NEW.status = 'joined' THEN
      PERFORM public._goelo_activity_emit(
        'RIDE_JOINED',
        NEW.user_id,
        'signup',
        NEW.id::text,
        v_meta || jsonb_build_object('waitlist_promoted', true)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signups_activity ON public.signups;
CREATE TRIGGER trg_signups_activity
  AFTER INSERT OR UPDATE OF status ON public.signups
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_signups_activity_fn();

CREATE OR REPLACE FUNCTION public.trg_profiles_activity_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pseudo text;
BEGIN
  SELECT coalesce(
    nullif(trim(public.get_display_name(NEW.pseudo, NEW.username, u.email)), ''),
    'Nouveau'
  )
  INTO v_pseudo
  FROM auth.users u
  WHERE u.id = NEW.id;

  -- team_rider : événement émis par trigger demandes à l'approbation
  IF NEW.role IN ('user', 'admin') THEN
    PERFORM public._goelo_activity_emit(
      'USER_REGISTERED',
      NEW.id,
      'profile',
      NEW.id::text,
      jsonb_build_object(
        'actor_pseudo', coalesce(v_pseudo, 'Nouveau'),
        'role', NEW.role,
        'source', 'trigger:profiles'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_activity ON public.profiles;
CREATE TRIGGER trg_profiles_activity
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_activity_fn();

CREATE OR REPLACE FUNCTION public.trg_route_comments_activity_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route_title text;
BEGIN
  SELECT coalesce(r.front_config->>'title', NEW.route_id)
  INTO v_route_title
  FROM public.routes r
  WHERE r.id = NEW.route_id;

  PERFORM public._goelo_activity_emit(
    'COMMENT_CREATED',
    NULL,
    'comment',
    NEW.id::text,
    jsonb_build_object(
      'actor_pseudo', NEW.pseudo,
      'route_title', v_route_title,
      'route_id', NEW.route_id,
      'preview', left(trim(NEW.body), 80),
      'source', 'trigger:route_comments'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_comments_activity ON public.route_comments;
CREATE TRIGGER trg_route_comments_activity
  AFTER INSERT ON public.route_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_route_comments_activity_fn();

CREATE OR REPLACE FUNCTION public.trg_demandes_activity_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pseudo text;
  v_meta jsonb;
  v_type text;
BEGIN
  v_pseudo := coalesce(
    nullif(trim(NEW.first_name || ' ' || NEW.last_name), ''),
    nullif(trim(split_part(lower(coalesce(NEW.email, '')), '@', 1)), ''),
    'Candidat'
  );

  v_meta := jsonb_build_object(
    'actor_pseudo', v_pseudo,
    'demande_status', NEW.status,
    'level', NEW.level,
    'source', 'trigger:demandes'
  );

  IF TG_OP = 'INSERT' THEN
    v_type := 'USER_LOGIN';
    PERFORM public._goelo_activity_emit(
      v_type, NEW.auth_user_id, 'demande', NEW.id::text, v_meta, NEW.created_at
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public._goelo_activity_emit(
        'USER_REGISTERED',
        NEW.auth_user_id,
        'demande',
        NEW.id::text,
        v_meta || jsonb_build_object('team_rider_approved', true),
        coalesce(NEW.approved_at, now())
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demandes_activity ON public.demandes;
CREATE TRIGGER trg_demandes_activity
  AFTER INSERT OR UPDATE OF status ON public.demandes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_demandes_activity_fn();

-- ---------------------------------------------------------------------------
-- 5. RPC client : activity_event_log (schéma unifié + compat legacy)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.activity_event_log(text, jsonb, text, text, text);

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

  RETURN public._goelo_activity_emit(
    p_event_type,
    v_actor,
    p_entity_type,
    p_entity_id,
    v_meta || jsonb_build_object('source', 'rpc:activity_event_log')
  );
END;
$$;

-- Surcharge legacy (p_route_id / p_route_title / p_actor_pseudo)
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

  RETURN public.activity_event_log(
    p_event_type,
    v_meta,
    auth.uid(),
    CASE WHEN p_route_id IS NOT NULL THEN 'route' ELSE NULL END,
    p_route_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activity_event_log(text, jsonb, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activity_event_log(text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_event_log(text, jsonb, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_event_log(text, jsonb, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Dashboard admin — lecture unique activity_events
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
        'route_id', row.route_id,
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
      ae.id::text AS id,
      ae.event_type,
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) AS actor_pseudo,
      coalesce(
        nullif(trim(ae.metadata->>'route_id'), ''),
        CASE WHEN ae.entity_type = 'route' THEN ae.entity_id ELSE NULL END
      ) AS route_id,
      coalesce(
        nullif(trim(ae.metadata->>'route_title'), ''),
        CASE WHEN ae.entity_type = 'route' THEN (
          SELECT coalesce(r.front_config->>'title', r.id)
          FROM public.routes r WHERE r.id = ae.entity_id
        ) ELSE NULL END
      ) AS route_title,
      coalesce(ae.metadata, '{}'::jsonb) || jsonb_build_object(
        'entity_type', ae.entity_type,
        'entity_id', ae.entity_id,
        'actor_id', ae.actor_id
      ) AS metadata,
      ae.created_at
    FROM public.activity_events ae
    LEFT JOIN public.profiles p ON p.id = ae.actor_id
    LEFT JOIN auth.users u ON u.id = ae.actor_id
    ORDER BY ae.created_at DESC
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
    'feed_mode', 'activity_events',
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
  'Feed admin depuis activity_events uniquement. Appel API : admin JWT. SQL Editor et service_role autorisés.';

REVOKE ALL ON FUNCTION public.activity_admin_dashboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_admin_dashboard(int) TO authenticated, service_role;
