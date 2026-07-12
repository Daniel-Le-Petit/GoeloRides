-- RLS profiles : lecture / écriture de sa propre ligne (auth.uid() = id).
-- Permet au client (clé anon + JWT) d'upsert pseudo, cyclist_level, city après connexion.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_service_role_all" ON public.profiles;
CREATE POLICY "profiles_service_role_all"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "profiles_select_own" ON public.profiles IS
  'L''utilisateur authentifié peut lire sa ligne profiles.';
COMMENT ON POLICY "profiles_insert_own" ON public.profiles IS
  'Création de profil à l''inscription (upsert côté client).';
COMMENT ON POLICY "profiles_update_own" ON public.profiles IS
  'Mise à jour de pseudo, cyclist_level, city sans toucher aux autres colonnes.';
