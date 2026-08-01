-- GoëloRides — Sondage multi-choix (checkboxes + texte libre)
-- Réutilise polls / poll_options ; réponses multi dans tables dédiées.
-- Agrégation publique = % de répondants ayant coché chaque option (anonyme).
-- Le texte libre n’est jamais renvoyé publiquement (sauf le sien après envoi).

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS poll_type TEXT NOT NULL DEFAULT 'single';

ALTER TABLE public.polls
  DROP CONSTRAINT IF EXISTS polls_poll_type_chk;

ALTER TABLE public.polls
  ADD CONSTRAINT polls_poll_type_chk
  CHECK (poll_type IN ('single', 'multi'));

CREATE TABLE IF NOT EXISTS public.poll_multi_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  voter_key   TEXT,
  free_text   TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT poll_multi_responses_identity_chk CHECK (
    user_id IS NOT NULL OR (voter_key IS NOT NULL AND length(trim(voter_key)) >= 16)
  ),
  CONSTRAINT poll_multi_responses_voter_key_len CHECK (
    voter_key IS NULL OR length(trim(voter_key)) BETWEEN 16 AND 80
  ),
  CONSTRAINT poll_multi_responses_free_text_len CHECK (length(free_text) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS poll_multi_responses_user_uidx
  ON public.poll_multi_responses (poll_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS poll_multi_responses_key_uidx
  ON public.poll_multi_responses (poll_id, voter_key)
  WHERE voter_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS poll_multi_responses_poll_idx
  ON public.poll_multi_responses (poll_id);

CREATE TABLE IF NOT EXISTS public.poll_multi_response_options (
  response_id UUID NOT NULL REFERENCES public.poll_multi_responses (id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES public.poll_options (id) ON DELETE CASCADE,
  PRIMARY KEY (response_id, option_id)
);

CREATE INDEX IF NOT EXISTS poll_multi_response_options_option_idx
  ON public.poll_multi_response_options (option_id);

ALTER TABLE public.poll_multi_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_multi_response_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poll_multi_responses_deny_anon" ON public.poll_multi_responses;
CREATE POLICY "poll_multi_responses_deny_anon"
  ON public.poll_multi_responses FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_multi_responses_service_role" ON public.poll_multi_responses;
CREATE POLICY "poll_multi_responses_service_role"
  ON public.poll_multi_responses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "poll_multi_response_options_deny_anon" ON public.poll_multi_response_options;
CREATE POLICY "poll_multi_response_options_deny_anon"
  ON public.poll_multi_response_options FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_multi_response_options_service_role" ON public.poll_multi_response_options;
CREATE POLICY "poll_multi_response_options_service_role"
  ON public.poll_multi_response_options FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._poll_multi_find_response(
  p_poll_id uuid,
  p_voter_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := nullif(trim(coalesce(p_voter_key, '')), '');
  v_id uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.poll_multi_responses
    WHERE poll_id = p_poll_id AND user_id = v_uid
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.poll_multi_responses
    WHERE poll_id = p_poll_id AND voter_key = v_key
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._poll_multi_find_response(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._poll_multi_results_payload(
  p_poll_id uuid,
  p_response_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_my_opts jsonb := '[]'::jsonb;
  v_my_text text := NULL;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.poll_multi_responses
  WHERE poll_id = p_poll_id;

  IF p_response_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(ro.option_id ORDER BY o.sort_order ASC), '[]'::jsonb)
    INTO v_my_opts
    FROM public.poll_multi_response_options ro
    JOIN public.poll_options o ON o.id = ro.option_id
    WHERE ro.response_id = p_response_id;

    SELECT nullif(trim(free_text), '') INTO v_my_text
    FROM public.poll_multi_responses
    WHERE id = p_response_id;
  END IF;

  RETURN jsonb_build_object(
    'options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'subtitle', o.subtitle,
          'emoji', o.emoji,
          'level_key', o.level_key,
          'sort_order', o.sort_order,
          'percent', CASE
            WHEN v_total = 0 THEN 0
            ELSE round(100.0 * (
              SELECT count(DISTINCT r.id)
              FROM public.poll_multi_responses r
              JOIN public.poll_multi_response_options ro ON ro.response_id = r.id
              WHERE r.poll_id = p_poll_id AND ro.option_id = o.id
            ) / v_total)::int
          END
        )
        ORDER BY o.sort_order ASC, o.created_at ASC
      )
      FROM public.poll_options o
      WHERE o.poll_id = p_poll_id
    ), '[]'::jsonb),
    'my_option_ids', v_my_opts,
    'my_free_text', to_jsonb(v_my_text),
    'has_submitted', (p_response_id IS NOT NULL),
    'responses_count', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public._poll_multi_results_payload(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Public get
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.poll_multi_get_by_slug(
  p_slug text,
  p_voter_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.polls%ROWTYPE;
  v_resp uuid;
  v_payload jsonb;
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
BEGIN
  IF v_slug IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug', 'poll', null);
  END IF;

  SELECT * INTO v_poll
  FROM public.polls
  WHERE slug = v_slug
    AND is_active = true
    AND poll_type = 'multi'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'poll', null);
  END IF;

  v_resp := public._poll_multi_find_response(v_poll.id, p_voter_key);
  v_payload := public._poll_multi_results_payload(v_poll.id, v_resp);

  RETURN jsonb_build_object(
    'ok', true,
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'slug', v_poll.slug,
      'question', v_poll.question,
      'is_active', v_poll.is_active,
      'poll_type', v_poll.poll_type
    ),
    'options', v_payload->'options',
    'my_option_ids', v_payload->'my_option_ids',
    'my_free_text', v_payload->'my_free_text',
    'has_submitted', coalesce((v_payload->>'has_submitted')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_multi_get_by_slug(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_multi_get_by_slug(text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public submit (multi + free text optionnel) — upsert, remplace les choix
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.poll_multi_submit(
  p_poll_id uuid,
  p_option_ids uuid[],
  p_free_text text DEFAULT NULL,
  p_voter_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text := nullif(trim(coalesce(p_voter_key, '')), '');
  v_poll public.polls%ROWTYPE;
  v_resp_id uuid;
  v_opt uuid;
  v_valid int := 0;
  v_text text := left(trim(coalesce(p_free_text, '')), 500);
  v_payload jsonb;
  v_updated boolean := false;
BEGIN
  IF p_poll_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_params');
  END IF;

  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND OR v_poll.is_active IS NOT TRUE OR v_poll.poll_type <> 'multi' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_inactive');
  END IF;

  IF p_option_ids IS NULL OR coalesce(array_length(p_option_ids, 1), 0) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_options');
  END IF;

  -- Dédupliquer et valider les options
  FOR v_opt IN
    SELECT DISTINCT x FROM unnest(p_option_ids) AS t(x) WHERE x IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.poll_options
      WHERE id = v_opt AND poll_id = p_poll_id
    ) THEN
      v_valid := v_valid + 1;
    END IF;
  END LOOP;

  IF v_valid < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_options');
  END IF;

  v_resp_id := public._poll_multi_find_response(p_poll_id, v_key);

  IF v_resp_id IS NOT NULL THEN
    UPDATE public.poll_multi_responses
    SET free_text = v_text, updated_at = now()
    WHERE id = v_resp_id;
    DELETE FROM public.poll_multi_response_options WHERE response_id = v_resp_id;
    v_updated := true;
  ELSE
    IF v_uid IS NOT NULL THEN
      INSERT INTO public.poll_multi_responses (poll_id, user_id, voter_key, free_text)
      VALUES (p_poll_id, v_uid, NULL, v_text)
      RETURNING id INTO v_resp_id;
    ELSE
      IF v_key IS NULL OR length(v_key) < 16 OR length(v_key) > 80 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_voter_key');
      END IF;
      INSERT INTO public.poll_multi_responses (poll_id, user_id, voter_key, free_text)
      VALUES (p_poll_id, NULL, v_key, v_text)
      RETURNING id INTO v_resp_id;
    END IF;
  END IF;

  INSERT INTO public.poll_multi_response_options (response_id, option_id)
  SELECT DISTINCT v_resp_id, x
  FROM unnest(p_option_ids) AS t(x)
  WHERE x IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.poll_options o
      WHERE o.id = x AND o.poll_id = p_poll_id
    );

  v_payload := public._poll_multi_results_payload(p_poll_id, v_resp_id);

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'options', v_payload->'options',
    'my_option_ids', v_payload->'my_option_ids',
    'my_free_text', v_payload->'my_free_text',
    'has_submitted', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_multi_submit(uuid, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_multi_submit(uuid, uuid[], text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.poll_multi_submit(uuid, uuid[], text, text) IS
  'Soumission multi-choix (+ texte libre optionnel). 1 réponse / identité, modifiable.';

-- Admin : résultats multi (avec textes libres, non publics)
CREATE OR REPLACE FUNCTION public.poll_multi_admin_results(p_poll_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.polls%ROWTYPE;
  v_total bigint;
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*) INTO v_total
  FROM public.poll_multi_responses
  WHERE poll_id = p_poll_id;

  RETURN jsonb_build_object(
    'ok', true,
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'slug', v_poll.slug,
      'question', v_poll.question,
      'poll_type', v_poll.poll_type,
      'is_active', v_poll.is_active
    ),
    'responses_count', v_total,
    'options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'level_key', o.level_key,
          'sort_order', o.sort_order,
          'votes', (
            SELECT count(DISTINCT r.id)
            FROM public.poll_multi_responses r
            JOIN public.poll_multi_response_options ro ON ro.response_id = r.id
            WHERE r.poll_id = p_poll_id AND ro.option_id = o.id
          ),
          'percent', CASE
            WHEN v_total = 0 THEN 0
            ELSE round(100.0 * (
              SELECT count(DISTINCT r.id)
              FROM public.poll_multi_responses r
              JOIN public.poll_multi_response_options ro ON ro.response_id = r.id
              WHERE r.poll_id = p_poll_id AND ro.option_id = o.id
            ) / v_total)::int
          END
        )
        ORDER BY o.sort_order ASC
      )
      FROM public.poll_options o
      WHERE o.poll_id = p_poll_id
    ), '[]'::jsonb),
    'free_texts', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'text', r.free_text,
          'created_at', r.created_at
        )
        ORDER BY r.created_at DESC
      )
      FROM public.poll_multi_responses r
      WHERE r.poll_id = p_poll_id
        AND length(trim(r.free_text)) > 0
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_multi_admin_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_multi_admin_results(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.polls WHERE slug = 'preferences-motivations-v1' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.polls (slug, question, is_active, poll_type)
    VALUES (
      'preferences-motivations-v1',
      'Qu''est-ce qui vous ferait venir rouler avec nous ?',
      true,
      'multi'
    )
    RETURNING id INTO v_id;

    INSERT INTO public.poll_options (poll_id, label, subtitle, emoji, level_key, sort_order) VALUES
      (v_id, 'Une sortie accessible',       '', '', 'access',    0),
      (v_id, 'Un groupe convivial',         '', '', 'friendly',  1),
      (v_id, 'Un parcours intéressant',     '', '', 'route',     2),
      (v_id, 'Un horaire qui me convient',  '', '', 'schedule',  3),
      (v_id, 'Partir près de chez moi',     '', '', 'nearby',    4),
      (v_id, 'Autre',                       '', '', 'other',     5);
  ELSE
    UPDATE public.polls
    SET
      question = 'Qu''est-ce qui vous ferait venir rouler avec nous ?',
      is_active = true,
      poll_type = 'multi',
      updated_at = now()
    WHERE id = v_id;
  END IF;
END $$;
