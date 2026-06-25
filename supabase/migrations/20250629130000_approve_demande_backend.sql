-- GoëloRides — Approbation demande Team Rider : colonnes de traçabilité + idempotence
-- La logique métier (création Auth + OneSignal) vit dans l’Edge Function approve-demande.

ALTER TABLE public.demandes
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_processed_at timestamptz;

COMMENT ON COLUMN public.demandes.auth_user_id IS
  'Utilisateur Auth créé ou existant lors de l''approbation.';
COMMENT ON COLUMN public.demandes.approved_at IS
  'Horodatage passage au statut approved.';
COMMENT ON COLUMN public.demandes.approval_processed_at IS
  'Horodatage traitement backend (user + notification) — idempotence.';

CREATE OR REPLACE FUNCTION public._goelo_caller_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public._goelo_jwt_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public._goelo_caller_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_caller_is_admin() TO authenticated, service_role;
