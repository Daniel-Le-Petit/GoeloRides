-- Colonne display_name sur profiles (lue par auth.js, résolue côté serveur).
-- À appliquer si 20250627120000 est déjà en prod sans cette colonne.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE public.profiles p
SET display_name = public.get_display_name(p.pseudo, p.username, u.email)
FROM auth.users u
WHERE u.id = p.id
  AND (p.display_name IS NULL OR trim(p.display_name) = '');

COMMENT ON COLUMN public.profiles.display_name IS
  'Nom affiché résolu (pseudo → username → préfixe e-mail). Source unique pour le frontend.';
