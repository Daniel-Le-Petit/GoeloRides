-- Mise à jour d'une sortie personnalisée (correction après création) : même garde admin que route_create.

CREATE OR REPLACE FUNCTION public.route_update(
  p_route_id text,
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
  v_am jsonb;
  v_admin boolean;
  v_sort smallint;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = trim(p_route_id) AND r.route_kind = 'custom' AND r.is_active
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_fixed');
  END IF;

  IF length(trim(p_track_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT r.sort_order INTO v_sort
  FROM public.routes r
  WHERE r.id = trim(p_route_id);

  IF p_sort_order IS NOT NULL AND p_sort_order <> 0::smallint THEN
    v_sort := p_sort_order;
  END IF;

  UPDATE public.routes
  SET
    track_name = trim(p_track_name),
    group_label = nullif(trim(p_group_label), ''),
    pace_label = nullif(trim(p_pace_label), ''),
    front_config = coalesce(p_front_config, '{}'::jsonb),
    sort_order = v_sort
  WHERE id = trim(p_route_id) AND route_kind = 'custom';

  RETURN jsonb_build_object('ok', true, 'route_id', trim(p_route_id));
END;
$$;

REVOKE ALL ON FUNCTION public.route_update(text, text, text, text, jsonb, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.route_update(text, text, text, text, jsonb, smallint) TO authenticated, service_role;

COMMENT ON FUNCTION public.route_update(text, text, text, text, jsonb, smallint) IS
  'Met à jour une route route_kind = custom. Appelant : JWT authenticated avec app_metadata.goelo_admin = true.';
