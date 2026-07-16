-- ============================================================================
-- GoëloRides — Participants invités (hors compte Auth)
-- ============================================================================
-- Table séparée : ne touche pas auth.users, profiles ni signups.
-- Lecture publique via RPC (comme signup_list_*).
-- Ajout réservé admin / team_rider (gestion des sorties).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guest_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    text NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text,
  phone       text,
  created_by  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_participants_first_name_nonempty
    CHECK (length(trim(first_name)) > 0)
);

CREATE INDEX IF NOT EXISTS guest_participants_route_id_idx
  ON public.guest_participants (route_id);

COMMENT ON TABLE public.guest_participants IS
  'Participants manuels (SMS / téléphone) sans compte Auth — hors profiles/signups.';

ALTER TABLE public.guest_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_participants_deny_anon" ON public.guest_participants;
CREATE POLICY "guest_participants_deny_anon"
  ON public.guest_participants FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "guest_participants_service_role_all" ON public.guest_participants;
CREATE POLICY "guest_participants_service_role_all"
  ON public.guest_participants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Garde organisateur : admin JWT / profiles.admin / team_rider
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._goelo_caller_can_manage_guests()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public._goelo_caller_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'team_rider')
    );
$$;

REVOKE ALL ON FUNCTION public._goelo_caller_can_manage_guests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_caller_can_manage_guests()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Liste des invités d'une sortie
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_participants_list_for_route(p_route_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid text := trim(p_route_id);
  v_rows jsonb;
  v_cnt  int;
BEGIN
  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('ok', true, 'participants', '[]'::jsonb, 'count', 0);
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id,
      'route_id', g.route_id,
      'first_name', trim(g.first_name),
      'last_name', nullif(trim(g.last_name), ''),
      'is_guest', true,
      'source', 'guest'
    )
    ORDER BY g.created_at ASC
  ), '[]'::jsonb),
  count(*)::int
  INTO v_rows, v_cnt
  FROM public.guest_participants g
  WHERE g.route_id = v_rid;

  RETURN jsonb_build_object(
    'ok', true,
    'participants', v_rows,
    'count', v_cnt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_participants_list_for_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participants_list_for_route(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.guest_participants_list_for_route(text) IS
  'Liste les participants invités (hors compte) d''une sortie. Pas de téléphone exposé.';

-- ---------------------------------------------------------------------------
-- Ajout d'un invité (admin / team_rider)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_participant_add(
  p_route_id   text,
  p_first_name text,
  p_last_name  text DEFAULT NULL,
  p_phone      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rid   text := trim(p_route_id);
  v_first text := trim(coalesce(p_first_name, ''));
  v_last  text := nullif(trim(coalesce(p_last_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_row   public.guest_participants%ROWTYPE;
BEGIN
  IF NOT public._goelo_caller_can_manage_guests() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_rid IS NULL OR length(v_rid) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  IF length(v_first) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_name_required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.routes r WHERE r.id = v_rid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'route_not_found');
  END IF;

  INSERT INTO public.guest_participants (
    route_id, first_name, last_name, phone, created_by
  )
  VALUES (
    v_rid, v_first, v_last, v_phone, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'participant', jsonb_build_object(
      'id', v_row.id,
      'route_id', v_row.route_id,
      'first_name', trim(v_row.first_name),
      'last_name', nullif(trim(v_row.last_name), ''),
      'is_guest', true,
      'source', 'guest'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guest_participant_add(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_participant_add(text, text, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.guest_participant_add(text, text, text, text) IS
  'Ajoute un participant invité (sans compte) à une sortie. Réservé admin / team_rider.';
