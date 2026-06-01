-- Routes dynamiques + « nouvelle sortie » (RPC route_create).
-- À exécuter dans Supabase → SQL Editor après la migration initiale goelo_signup.

-- ---------------------------------------------------------------------------
-- Schéma : autoriser des ids autres que les 3 parcours figés + métadonnées UI
-- ---------------------------------------------------------------------------
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_id_check;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_kind text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS front_config jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.routes SET route_kind = 'fixed' WHERE id IN ('falaises', 'brehec', 'boucle');

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_route_kind_check;
ALTER TABLE public.routes ADD CONSTRAINT routes_route_kind_check
  CHECK (route_kind IN ('fixed', 'custom'));

COMMENT ON COLUMN public.routes.front_config IS 'JSON côté site : file (GPX), depart, cities, color, levelClass, etc.';

-- ---------------------------------------------------------------------------
-- RPC : lister les routes actives (site + nouvelles sorties)
-- Signature avec jsonb : PostgREST expose mal les RPC sans argument (PGRST202).
-- p_filter est réservé pour des filtres futurs ; ignoré pour l’instant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.routes_list(p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'track_name', r.track_name,
        'group_label', r.group_label,
        'pace_label', r.pace_label,
        'sort_order', r.sort_order,
        'route_kind', r.route_kind,
        'front_config', r.front_config
      )
      ORDER BY r.sort_order, r.id
    ),
    '[]'::jsonb
  )
  FROM public.routes r
  WHERE r.is_active = true;
$$;

-- ---------------------------------------------------------------------------
-- RPC : créer une sortie (anon — à durcir plus tard : captcha, Edge Function, etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.route_create(
  p_track_name text,
  p_group_label text,
  p_pace_label text,
  p_front_config jsonb,
  p_sort_order smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_sort smallint := coalesce(nullif(p_sort_order, 0::smallint), 50::smallint);
BEGIN
  IF length(trim(p_track_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF (SELECT count(*)::int FROM public.routes WHERE route_kind = 'custom') >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limit_reached');
  END IF;

  v_id := 'c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

  INSERT INTO public.routes (id, track_name, group_label, pace_label, sort_order, is_active, route_kind, front_config)
  VALUES (
    v_id,
    trim(p_track_name),
    nullif(trim(p_group_label), ''),
    nullif(trim(p_pace_label), ''),
    v_sort,
    true,
    'custom',
    coalesce(p_front_config, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'route_id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_id');
END;
$$;

-- ---------------------------------------------------------------------------
-- Inscription / listes : accepter tout route_id présent et actif dans routes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_register(
  p_route_id text,
  p_pseudo text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  text := lower(trim(p_email));
  v_pseudo text := trim(p_pseudo);
  v_now    timestamptz := now();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = p_route_id AND r.is_active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;
  IF length(v_pseudo) < 1 OR length(v_email) < 3 OR strpos(v_email, '@') < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.signups s
    WHERE s.route_id = p_route_id AND lower(trim(s.email)) = v_email AND s.canceled_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
  END IF;

  UPDATE public.signups s
  SET pseudo = v_pseudo, canceled_at = NULL, created_at = v_now
  WHERE s.route_id = p_route_id AND lower(trim(s.email)) = v_email AND s.canceled_at IS NOT NULL;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reactivated', true);
  END IF;

  INSERT INTO public.signups (route_id, pseudo, email)
  VALUES (p_route_id, v_pseudo, v_email);

  RETURN jsonb_build_object('ok', true, 'reactivated', false);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_registered');
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_unregister(
  p_route_id text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  text := lower(trim(p_email));
  v_pseudo text;
BEGIN
  IF length(v_email) < 3 OR NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = p_route_id AND r.is_active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  UPDATE public.signups s
  SET canceled_at = now()
  WHERE s.route_id = p_route_id
    AND lower(trim(s.email)) = v_email
    AND s.canceled_at IS NULL
  RETURNING trim(s.pseudo) INTO v_pseudo;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'pseudo', coalesce(v_pseudo, ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_list_all_names()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid text;
  arr jsonb;
  out jsonb := '{}'::jsonb;
BEGIN
  FOR rid IN SELECT r.id FROM public.routes r WHERE r.is_active ORDER BY r.sort_order, r.id
  LOOP
    SELECT coalesce(jsonb_agg(v.n ORDER BY v.n), '[]'::jsonb) INTO arr
    FROM (
      SELECT DISTINCT ON (u.k) u.n
      FROM (
        SELECT trim(s.pseudo) AS n, lower(trim(s.pseudo)) AS k
        FROM public.signups s
        WHERE s.route_id = rid AND s.canceled_at IS NULL
        UNION ALL
        SELECT trim(i.display_name), lower(trim(i.display_name))
        FROM public.imported_participant_names i
        WHERE i.route_id = rid
      ) u
      WHERE length(trim(u.n)) > 0
      ORDER BY u.k, u.n
    ) v;

    out := out || jsonb_build_object(rid, arr);
  END LOOP;

  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.routes_list(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.route_create(text, text, text, jsonb, smallint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.routes_list(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.route_create(text, text, text, jsonb, smallint) TO anon, authenticated, service_role;
