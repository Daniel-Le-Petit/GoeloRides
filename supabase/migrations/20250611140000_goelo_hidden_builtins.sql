-- Masquage des parcours intégrés (falaises / brehec / boucle) depuis route_delete,
-- lecture publique goelo_hidden_builtin_ids pour le site.

CREATE TABLE IF NOT EXISTS public.goelo_site_flags (
  id smallint PRIMARY KEY DEFAULT 1 CONSTRAINT goelo_site_flags_singleton CHECK (id = 1),
  hidden_builtin_route_ids text[] NOT NULL DEFAULT '{}'::text[]
);

INSERT INTO public.goelo_site_flags (id, hidden_builtin_route_ids)
VALUES (1, '{}'::text[])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.goelo_site_flags ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.goelo_hidden_builtin_ids()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT to_jsonb(hidden_builtin_route_ids) FROM public.goelo_site_flags WHERE id = 1),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.goelo_hidden_builtin_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.goelo_hidden_builtin_ids() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.goelo_hidden_builtin_ids() IS
  'Ids des parcours intégrés masqués sur le site (falaises, brehec, boucle). Lecture publique.';

CREATE OR REPLACE FUNCTION public.route_delete(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_am jsonb;
  v_admin boolean;
  v_id text;
  cur_ids text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  v_am := auth.jwt() -> 'app_metadata';
  v_admin := coalesce((v_am -> 'goelo_admin') = 'true'::jsonb, false)
    OR coalesce((v_am ->> 'goelo_admin') IN ('true', 't', '1'), false);

  IF NOT v_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_route_id IS NULL OR length(trim(p_route_id)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_id := trim(p_route_id);

  IF v_id IN ('falaises', 'brehec', 'boucle') THEN
    SELECT hidden_builtin_route_ids INTO cur_ids FROM public.goelo_site_flags WHERE id = 1 FOR UPDATE;
    IF NOT FOUND OR cur_ids IS NULL THEN
      INSERT INTO public.goelo_site_flags (id, hidden_builtin_route_ids)
      VALUES (1, ARRAY[v_id]::text[]);
    ELSIF NOT (v_id = ANY(cur_ids)) THEN
      UPDATE public.goelo_site_flags
      SET hidden_builtin_route_ids = array_append(hidden_builtin_route_ids, v_id)
      WHERE id = 1;
    END IF;
    RETURN jsonb_build_object('ok', true, 'route_id', v_id, 'kind', 'builtin_hidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = v_id AND r.route_kind = 'custom' AND r.is_active
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_fixed');
  END IF;

  UPDATE public.routes
  SET is_active = false
  WHERE id = v_id AND route_kind = 'custom';

  RETURN jsonb_build_object('ok', true, 'route_id', v_id, 'kind', 'custom_disabled');
END;
$$;

COMMENT ON FUNCTION public.route_delete(text) IS
  'Admin : désactive une route custom (is_active=false) ou masque un parcours intégré (falaises, brehec, boucle).';
