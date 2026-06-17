-- Fil de discussion par sortie (commentaires publics, pseudo + texte).
-- Exécuter dans Supabase → SQL Editor après les migrations routes / signup.

CREATE TABLE IF NOT EXISTS public.route_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   TEXT NOT NULL REFERENCES public.routes (id) ON DELETE CASCADE,
  pseudo     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT route_comments_pseudo_len CHECK (length(trim(pseudo)) BETWEEN 1 AND 40),
  CONSTRAINT route_comments_body_len CHECK (length(trim(body)) BETWEEN 1 AND 1200)
);

CREATE INDEX IF NOT EXISTS route_comments_route_created_idx
  ON public.route_comments (route_id, created_at DESC);

ALTER TABLE public.route_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_comments_deny_anon" ON public.route_comments;
CREATE POLICY "route_comments_deny_anon"
  ON public.route_comments FOR ALL
  TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "route_comments_service_role" ON public.route_comments;
CREATE POLICY "route_comments_service_role"
  ON public.route_comments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sortie_comment_list(p_route_id text, p_limit int DEFAULT 80)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limit, 80), 120));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = p_route_id AND r.is_active = true
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    WITH recent AS (
      SELECT id, pseudo, body, created_at
      FROM public.route_comments
      WHERE route_id = p_route_id
      ORDER BY created_at DESC
      LIMIT lim
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'pseudo', trim(r.pseudo),
          'body', trim(r.body),
          'created_at', r.created_at
        )
        ORDER BY r.created_at ASC
      ),
      '[]'::jsonb
    )
    FROM recent r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sortie_comment_add(
  p_route_id text,
  p_pseudo text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vp text := trim(p_pseudo);
  vb text := trim(p_body);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.routes r WHERE r.id = p_route_id AND r.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_route');
  END IF;

  IF length(vp) < 1 OR length(vp) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pseudo');
  END IF;

  IF length(vb) < 1 OR length(vb) > 1200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_body');
  END IF;

  INSERT INTO public.route_comments (route_id, pseudo, body)
  VALUES (p_route_id, vp, vb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.sortie_comment_list(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sortie_comment_add(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sortie_comment_list(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sortie_comment_add(text, text, text) TO anon, authenticated, service_role;
