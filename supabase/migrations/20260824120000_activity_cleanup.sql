-- GoëloRides — Nettoyage des anciennes activités (Admin uniquement)
-- Supprime les activités de plus de 7 jours ET toutes les activités de l'utilisateur "Daniel"

CREATE OR REPLACE FUNCTION public.activity_admin_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daniel_user_id uuid;
  v_deleted_old int := 0;
  v_deleted_daniel int := 0;
  v_deleted_total int := 0;
  v_cutoff_date timestamptz;
BEGIN
  -- Vérifier que l'appelant est admin
  IF NOT public._goelo_caller_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Date limite : 7 jours avant maintenant
  v_cutoff_date := now() - interval '7 days';

  -- 1. Trouver l'ID de l'utilisateur "Daniel" via la table profiles
  SELECT p.id INTO v_daniel_user_id
  FROM public.profiles p
  WHERE p.pseudo = 'Daniel'
  LIMIT 1;

  -- 2. Supprimer les activités de plus de 7 jours
  WITH deleted_old AS (
    DELETE FROM public.activity_events
    WHERE created_at < v_cutoff_date
    RETURNING id
  )
  SELECT count(*)::int INTO v_deleted_old FROM deleted_old;

  -- 3. Supprimer les activités de Daniel (si trouvé)
  --    Note : les activités de Daniel de plus de 7 jours ont déjà été supprimées ci-dessus
  IF v_daniel_user_id IS NOT NULL THEN
    WITH deleted_daniel AS (
      DELETE FROM public.activity_events
      WHERE actor_id = v_daniel_user_id
      RETURNING id
    )
    SELECT count(*)::int INTO v_deleted_daniel FROM deleted_daniel;
  END IF;

  -- 4. Calculer le total (les activités déjà supprimées ne sont pas comptées 2 fois)
  v_deleted_total := v_deleted_old + v_deleted_daniel;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_old', v_deleted_old,
    'deleted_daniel', v_deleted_daniel,
    'deleted_total', v_deleted_total,
    'cutoff_date', v_cutoff_date,
    'daniel_user_id', v_daniel_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.activity_admin_cleanup() IS
  'Supprime les activités de plus de 7 jours ET toutes les activités de Daniel. Admin uniquement.';

REVOKE ALL ON FUNCTION public.activity_admin_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activity_admin_cleanup() TO authenticated, service_role;
