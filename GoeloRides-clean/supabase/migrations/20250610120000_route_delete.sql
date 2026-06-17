-- Retrait d'une sortie personnalisée du site (désactivation) : même garde admin que route_create / route_update.

CREATE OR REPLACE FUNCTION public.route_delete(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_am jsonb;
  v_admin boolean;
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

  UPDATE public.routes
  SET is_active = false
  WHERE id = trim(p_route_id) AND route_kind = 'custom';

  RETURN jsonb_build_object('ok', true, 'route_id', trim(p_route_id));
END;
$$;

REVOKE ALL ON FUNCTION public.route_delete(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.route_delete(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.route_delete(text) IS
  'Désactive une route route_kind = custom (is_active = false). Appelant : JWT authenticated avec app_metadata.goelo_admin = true.';
