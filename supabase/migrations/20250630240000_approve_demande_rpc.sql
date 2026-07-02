-- Fallback RPC si la Edge Function approve-demande est indisponible.
-- Crée le lien profil Team Rider quand l'utilisateur Auth existe déjà.

CREATE OR REPLACE FUNCTION public.approve_demande_admin(p_demande_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  d record;
  v_uid uuid;
  v_now timestamptz := now();
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_demande_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'demande_id_required');
  END IF;

  SELECT * INTO d FROM public.demandes WHERE id = p_demande_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'demande_not_found');
  END IF;

  IF d.status = 'refused' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'demande_refused');
  END IF;

  IF d.approval_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'approved',
      'auth_user_id', d.auth_user_id,
      'via', 'rpc'
    );
  END IF;

  v_uid := d.auth_user_id;
  IF v_uid IS NULL AND d.email IS NOT NULL AND length(trim(d.email)) > 0 THEN
    SELECT u.id INTO v_uid
    FROM auth.users u
    WHERE lower(trim(u.email)) = lower(trim(d.email))
    LIMIT 1;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_user_missing',
      'hint', 'Compte Auth introuvable — déployer la Edge Function approve-demande.'
    );
  END IF;

  INSERT INTO public.profiles (id, role)
  VALUES (v_uid, 'team_rider')
  ON CONFLICT (id) DO UPDATE SET
    role = 'team_rider',
    pseudo = coalesce(
      nullif(trim(public.profiles.pseudo), ''),
      nullif(trim(d.first_name), ''),
      public.profiles.pseudo
    ),
    cyclist_level = coalesce(
      nullif(trim(lower(d.level)), ''),
      public.profiles.cyclist_level
    );

  UPDATE public.demandes
  SET
    status = 'approved',
    approved_at = coalesce(d.approved_at, v_now),
    auth_user_id = v_uid,
    approval_processed_at = v_now
  WHERE id = p_demande_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'auth_user_id', v_uid,
    'user_created', false,
    'notification_sent', false,
    'via', 'rpc'
  );
END;
$$;

COMMENT ON FUNCTION public.approve_demande_admin(uuid) IS
  'Approbation admin (fallback) : profil team_rider si auth.users existe. Création compte = Edge Function.';

REVOKE ALL ON FUNCTION public.approve_demande_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_demande_admin(uuid) TO authenticated, service_role;
