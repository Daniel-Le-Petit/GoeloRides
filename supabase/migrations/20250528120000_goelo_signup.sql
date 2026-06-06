-- Goëlo Rides — schéma + RPC (clé anon côté site, pas d’accès direct aux e-mails)
-- À exécuter dans Supabase → SQL Editor (une fois).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Si erreur de schéma : CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.routes (
  id          TEXT PRIMARY KEY
              CHECK (id IN ('falaises', 'brehec', 'boucle')),
  track_name  TEXT        NOT NULL,
  group_label TEXT,
  pace_label  TEXT,
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.routes (id, track_name, group_label, pace_label, sort_order) VALUES
  ('falaises', 'La Route des Falaises', 'Groupe Blanc', '15–18 km/h', 1),
  ('brehec',   'Vers Bréhec',            'Groupe Vert',  '18–22 km/h', 2),
  ('boucle',   'La Grande Boucle du Goëlo', 'Groupe Bleu', '22–26 km/h', 3)
ON CONFLICT (id) DO UPDATE SET
  track_name  = EXCLUDED.track_name,
  group_label = EXCLUDED.group_label,
  pace_label  = EXCLUDED.pace_label,
  sort_order  = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.signups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    TEXT        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  pseudo      TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,
  CONSTRAINT signups_pseudo_nonempty CHECK (length(trim(pseudo)) > 0),
  CONSTRAINT signups_email_nonempty CHECK (length(trim(email)) > 0)
);

CREATE INDEX IF NOT EXISTS signups_route_id_created_at_idx
  ON public.signups (route_id, created_at DESC);

CREATE INDEX IF NOT EXISTS signups_active_route_idx
  ON public.signups (route_id)
  WHERE canceled_at IS NULL;

DROP INDEX IF EXISTS public.signups_route_email_active_idx;
CREATE UNIQUE INDEX signups_route_email_active_idx
  ON public.signups (route_id, lower(trim(email)))
  WHERE canceled_at IS NULL;

CREATE TABLE IF NOT EXISTS public.imported_participant_names (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id     TEXT        NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL,
  source       TEXT        NOT NULL DEFAULT 'manual',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT imported_display_name_nonempty CHECK (length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS imported_participant_names_route_idx
  ON public.imported_participant_names (route_id);

-- ---------------------------------------------------------------------------
-- RLS : pas d’accès direct anon sur les tables sensibles
-- ---------------------------------------------------------------------------
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_participant_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routes_read_public" ON public.routes;
CREATE POLICY "routes_read_public"
  ON public.routes FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "signups_deny_all_anon" ON public.signups;
CREATE POLICY "signups_deny_all_anon"
  ON public.signups FOR ALL
  TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "signups_service_role_all" ON public.signups;
CREATE POLICY "signups_service_role_all"
  ON public.signups FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "imported_deny_all_anon" ON public.imported_participant_names;
CREATE POLICY "imported_deny_all_anon"
  ON public.imported_participant_names FOR ALL
  TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "imported_service_role_all" ON public.imported_participant_names;
CREATE POLICY "imported_service_role_all"
  ON public.imported_participant_names FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- RPC (SECURITY DEFINER : contournent RLS pour les opérations contrôlées)
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
  IF p_route_id NOT IN ('falaises', 'brehec', 'boucle') THEN
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
  IF p_route_id NOT IN ('falaises', 'brehec', 'boucle') OR length(v_email) < 3 THEN
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
  FOREACH rid IN ARRAY ARRAY['falaises', 'brehec', 'boucle'] LOOP
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

CREATE OR REPLACE FUNCTION public.signup_list_registered_routes(p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'routes',
    coalesce(
      (
        SELECT jsonb_agg(s.route_id ORDER BY s.route_id)
        FROM public.signups s
        WHERE lower(trim(s.email)) = lower(trim(p_email))
          AND s.canceled_at IS NULL
      ),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.signup_get_registration(p_route_id text, p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'registered',
    EXISTS (
      SELECT 1 FROM public.signups s
      WHERE s.route_id = p_route_id
        AND lower(trim(s.email)) = lower(trim(p_email))
        AND s.canceled_at IS NULL
    ),
    'pseudo',
    coalesce(
      (
        SELECT trim(s.pseudo)
        FROM public.signups s
        WHERE s.route_id = p_route_id
          AND lower(trim(s.email)) = lower(trim(p_email))
          AND s.canceled_at IS NULL
        LIMIT 1
      ),
      ''
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Droits d’exécution (anon = site statique avec SUPABASE_ANON_KEY)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.signup_register(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_unregister(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_all_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_list_registered_routes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_get_registration(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.signup_register(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_unregister(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_all_names() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_list_registered_routes(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_get_registration(text, text) TO anon, authenticated, service_role;
