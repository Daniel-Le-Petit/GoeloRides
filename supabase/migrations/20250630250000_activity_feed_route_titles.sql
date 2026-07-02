-- GoëloRides — Activity feed : titres de sortie lisibles (track_name), jamais d'ID technique.

CREATE OR REPLACE FUNCTION public.goelo_route_display_title(p_route_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(r.front_config->>'title'), ''),
    nullif(trim(r.track_name), ''),
    'une sortie'
  )
  FROM public.routes r
  WHERE r.id = trim(p_route_id)
  LIMIT 1;
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
  v_rid := coalesce(
    CASE WHEN p_entity_type = 'route' THEN nullif(trim(p_entity_id), '') END,
    nullif(trim(p_meta->>'route_id'), '')
  );
  v_meta_title := nullif(trim(p_meta->>'route_title'), '');

  IF v_meta_title IS NOT NULL THEN
    IF v_meta_title ~ '^c_[0-9a-f]+$' OR (v_rid IS NOT NULL AND v_meta_title = v_rid) THEN
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

COMMENT ON FUNCTION public.goelo_route_display_title(text) IS
  'Titre affichable d''une sortie : front_config.title, puis track_name, jamais l''id technique.';
COMMENT ON FUNCTION public.goelo_activity_route_title(text, text, jsonb) IS
  'Titre pour le feed admin : ignore route_title metadata si ID technique, résout via routes.';

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
  public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata) AS route_title,
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
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
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
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'RIDE_LEFT' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' s''est désinscrit·e de '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'RIDE_VIEWED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a consulté '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'COMMENT_CREATED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a commenté sur '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
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
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'LIKE_REMOVED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a retiré son like sur '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
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
  'Feed admin humanisé : label = phrase complète, titres via track_name (jamais d''ID technique).';

GRANT SELECT ON public.activity_feed_human TO authenticated, service_role;

-- Triggers : stocker un titre lisible dans metadata (pas l''id route).
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
        'route_title', coalesce(
          nullif(trim(NEW.front_config->>'title'), ''),
          nullif(trim(NEW.track_name), ''),
          'une sortie'
        ),
        'route_kind', NEW.route_kind,
        'km', NEW.front_config->'profile'->>'totalKm',
        'source', 'trigger:routes'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

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

  v_route_title := public.goelo_route_display_title(NEW.route_id);

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

CREATE OR REPLACE FUNCTION public.trg_route_comments_activity_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._goelo_activity_emit(
    'COMMENT_CREATED',
    NULL,
    'comment',
    NEW.id::text,
    jsonb_build_object(
      'actor_pseudo', NEW.pseudo,
      'route_title', public.goelo_route_display_title(NEW.route_id),
      'route_id', NEW.route_id,
      'preview', left(trim(NEW.body), 80),
      'source', 'trigger:route_comments'
    )
  );

  RETURN NEW;
END;
$$;
