-- Patch : email_prefix pour avatars (préfixe e-mail, pas le pseudo affiché).
-- Si 20250627120000_signups_profiles_cleanup.sql n'est pas encore appliquée, ignorer ce fichier.

CREATE OR REPLACE FUNCTION public._signup_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pseudo', nullif(trim(p.pseudo), ''),
    'username', nullif(trim(p.username), ''),
    'display_name', public.get_display_name(p.pseudo, p.username, u.email),
    'email_prefix', nullif(split_part(lower(trim(u.email)), '@', 1), ''),
    'cyclist_level', to_jsonb(nullif(trim(p.cyclist_level), '')),
    'city', to_jsonb(nullif(trim(p.city), ''))
  )
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;
$$;
