-- Correctif PostgREST PGRST202 : remplacer routes_list() sans argument par routes_list(jsonb).
-- À exécuter si tu avais déjà appliqué une version antérieure de 20250601120000 avec routes_list().

DROP FUNCTION IF EXISTS public.routes_list();
DROP FUNCTION IF EXISTS public.routes_list(jsonb);

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

REVOKE ALL ON FUNCTION public.routes_list(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.routes_list(jsonb) TO anon, authenticated, service_role;
