-- ============================================================================
-- GoëloRides — Création / backfill profils depuis auth.users.raw_user_meta_data
-- ============================================================================
-- Contexte :
--   Aucun trigger versionné n'existait sur auth.users → public.profiles.
--   Les lignes profiles étaient souvent créées vides (id + role seulement)
--   via toggle_signup / approve_demande, ou via upsert client bloqué par RLS
--   quand la session n'est pas encore active (confirmation e-mail).
--
-- Cette migration :
--   1) Crée (ou remplace) public.handle_new_user() + trigger AFTER INSERT
--      sur auth.users pour peupler profiles depuis raw_user_meta_data.
--   2) Backfill non destructif : met à jour UNIQUEMENT les colonnes NULL /
--      vides des profils existants, sans écraser une valeur déjà renseignée.
--
-- Ne modifie PAS : auth.users (données), RLS policies, permissions frontend.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger function : INSERT complet dans public.profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta    jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_pseudo  text;
  v_username text;
  v_name    text;
  v_display text;
  v_city    text;
  v_level   text;
BEGIN
  v_pseudo := nullif(trim(v_meta->>'pseudo'), '');
  v_username := nullif(trim(v_meta->>'username'), '');
  v_name := nullif(trim(v_meta->>'name'), '');
  v_city := nullif(trim(v_meta->>'city'), '');
  v_level := nullif(trim(v_meta->>'cyclist_level'), '');

  -- Fallbacks demandés
  v_pseudo := coalesce(v_pseudo, v_username, v_name);
  v_username := coalesce(v_username, v_name);
  v_display := coalesce(v_name, v_username, v_pseudo);

  INSERT INTO public.profiles (
    id,
    role,
    pseudo,
    username,
    display_name,
    city,
    cyclist_level
  )
  VALUES (
    NEW.id,
    'user',
    v_pseudo,
    v_username,
    v_display,
    v_city,   -- null accepté
    v_level   -- null accepté
  )
  ON CONFLICT (id) DO UPDATE SET
    pseudo = coalesce(
      nullif(trim(public.profiles.pseudo), ''),
      EXCLUDED.pseudo
    ),
    username = coalesce(
      nullif(trim(public.profiles.username), ''),
      EXCLUDED.username
    ),
    display_name = coalesce(
      nullif(trim(public.profiles.display_name), ''),
      EXCLUDED.display_name
    ),
    city = coalesce(
      nullif(trim(public.profiles.city), ''),
      EXCLUDED.city
    ),
    cyclist_level = coalesce(
      nullif(trim(public.profiles.cyclist_level), ''),
      EXCLUDED.cyclist_level
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Après INSERT auth.users : crée/complète public.profiles depuis raw_user_meta_data '
  '(pseudo, username, name→display_name, city, cyclist_level). '
  'N''écrase jamais une valeur profiles déjà renseignée.';

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Backfill profils existants (NULL / vides uniquement)
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET
  pseudo = coalesce(
    nullif(trim(p.pseudo), ''),
    nullif(trim(u.raw_user_meta_data->>'pseudo'), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), '')
  ),
  username = coalesce(
    nullif(trim(p.username), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), '')
  ),
  display_name = coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'pseudo'), '')
  ),
  city = coalesce(
    nullif(trim(p.city), ''),
    nullif(trim(u.raw_user_meta_data->>'city'), '')
  ),
  cyclist_level = coalesce(
    nullif(trim(p.cyclist_level), ''),
    nullif(trim(u.raw_user_meta_data->>'cyclist_level'), '')
  )
FROM auth.users u
WHERE u.id = p.id
  AND (
    p.pseudo IS NULL OR trim(p.pseudo) = ''
    OR p.username IS NULL OR trim(p.username) = ''
    OR p.display_name IS NULL OR trim(p.display_name) = ''
    OR p.city IS NULL OR trim(p.city) = ''
    OR p.cyclist_level IS NULL OR trim(p.cyclist_level) = ''
  );

-- Créer les profils manquants (auth user sans ligne profiles)
INSERT INTO public.profiles (
  id,
  role,
  pseudo,
  username,
  display_name,
  city,
  cyclist_level
)
SELECT
  u.id,
  'user',
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'pseudo'), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), '')
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), '')
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(trim(u.raw_user_meta_data->>'username'), ''),
    nullif(trim(u.raw_user_meta_data->>'pseudo'), '')
  ),
  nullif(trim(u.raw_user_meta_data->>'city'), ''),
  nullif(trim(u.raw_user_meta_data->>'cyclist_level'), '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
