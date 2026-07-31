-- GoëloRides — Sondages site-wide (préférences de sorties)
-- Vote anonyme via voter_key + vote authentifié via user_id.
-- Résultats publics = pourcentages uniquement (pas de compteur ni de noms).

CREATE TABLE IF NOT EXISTS public.polls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT,
  question    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT polls_question_len CHECK (length(trim(question)) BETWEEN 3 AND 300),
  CONSTRAINT polls_slug_len CHECK (slug IS NULL OR length(trim(slug)) BETWEEN 2 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS polls_slug_uidx
  ON public.polls (slug)
  WHERE slug IS NOT NULL;

-- Au plus un sondage actif à la fois
CREATE UNIQUE INDEX IF NOT EXISTS polls_one_active_uidx
  ON public.polls ((true))
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  emoji       TEXT NOT NULL DEFAULT '',
  level_key   TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT poll_options_label_len CHECK (length(trim(label)) BETWEEN 1 AND 120),
  CONSTRAINT poll_options_subtitle_len CHECK (length(subtitle) <= 200)
);

CREATE INDEX IF NOT EXISTS poll_options_poll_idx
  ON public.poll_options (poll_id, sort_order);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES public.poll_options (id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  voter_key   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT poll_votes_identity_chk CHECK (
    user_id IS NOT NULL OR (voter_key IS NOT NULL AND length(trim(voter_key)) >= 16)
  ),
  CONSTRAINT poll_votes_voter_key_len CHECK (
    voter_key IS NULL OR length(trim(voter_key)) BETWEEN 16 AND 80
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_user_uidx
  ON public.poll_votes (poll_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_key_uidx
  ON public.poll_votes (poll_id, voter_key)
  WHERE voter_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS poll_votes_poll_option_idx
  ON public.poll_votes (poll_id, option_id);

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polls_deny_anon" ON public.polls;
CREATE POLICY "polls_deny_anon"
  ON public.polls FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "polls_service_role" ON public.polls;
CREATE POLICY "polls_service_role"
  ON public.polls FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "poll_options_deny_anon" ON public.poll_options;
CREATE POLICY "poll_options_deny_anon"
  ON public.poll_options FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_options_service_role" ON public.poll_options;
CREATE POLICY "poll_options_service_role"
  ON public.poll_options FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "poll_votes_deny_anon" ON public.poll_votes;
CREATE POLICY "poll_votes_deny_anon"
  ON public.poll_votes FOR ALL TO anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_votes_service_role" ON public.poll_votes;
CREATE POLICY "poll_votes_service_role"
  ON public.poll_votes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Helpers résultats (pourcentages uniquement côté public)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._poll_results_payload(
  p_poll_id uuid,
  p_my_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.poll_votes
  WHERE poll_id = p_poll_id;

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
              SELECT count(*) FROM public.poll_votes v
              WHERE v.poll_id = p_poll_id AND v.option_id = o.id
            ) / v_total)::int
          END
        )
        ORDER BY o.sort_order ASC, o.created_at ASC
      )
      FROM public.poll_options o
      WHERE o.poll_id = p_poll_id
    ), '[]'::jsonb),
    'my_option_id', p_my_option_id,
    'has_voted', (p_my_option_id IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._poll_results_payload(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._poll_find_my_option(
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
  v_opt uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT option_id INTO v_opt
    FROM public.poll_votes
    WHERE poll_id = p_poll_id AND user_id = v_uid
    LIMIT 1;
    IF v_opt IS NOT NULL THEN
      RETURN v_opt;
    END IF;
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT option_id INTO v_opt
    FROM public.poll_votes
    WHERE poll_id = p_poll_id AND voter_key = v_key
    LIMIT 1;
  END IF;

  RETURN v_opt;
END;
$$;

REVOKE ALL ON FUNCTION public._poll_find_my_option(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Public : sondage actif
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.poll_get_active(p_voter_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.polls%ROWTYPE;
  v_my uuid;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_poll
  FROM public.polls
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'poll', null);
  END IF;

  v_my := public._poll_find_my_option(v_poll.id, p_voter_key);
  v_payload := public._poll_results_payload(v_poll.id, v_my);

  RETURN jsonb_build_object(
    'ok', true,
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'slug', v_poll.slug,
      'question', v_poll.question,
      'is_active', v_poll.is_active
    ),
    'options', v_payload->'options',
    'my_option_id', v_payload->'my_option_id',
    'has_voted', coalesce((v_payload->>'has_voted')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_get_active(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_get_active(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.poll_get_active(text) IS
  'Sondage site-wide actif + options + pourcentages. my_option_id si déjà voté (auth ou voter_key).';

-- ---------------------------------------------------------------------------
-- Public : voter (anon via voter_key, auth via user_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.poll_vote(
  p_poll_id uuid,
  p_option_id uuid,
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
  v_opt public.poll_options%ROWTYPE;
  v_my uuid;
  v_payload jsonb;
BEGIN
  IF p_poll_id IS NULL OR p_option_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_params');
  END IF;

  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND OR v_poll.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'poll_inactive');
  END IF;

  SELECT * INTO v_opt
  FROM public.poll_options
  WHERE id = p_option_id AND poll_id = p_poll_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_option');
  END IF;

  v_my := public._poll_find_my_option(p_poll_id, v_key);

  -- Vote déjà présent : UPDATE (1 ligne / identité), pas already_voted
  IF v_my IS NOT NULL THEN
    IF v_my = p_option_id THEN
      v_payload := public._poll_results_payload(p_poll_id, v_my);
      RETURN jsonb_build_object(
        'ok', true,
        'updated', false,
        'options', v_payload->'options',
        'my_option_id', v_payload->'my_option_id',
        'has_voted', true
      );
    END IF;

    IF v_uid IS NOT NULL THEN
      UPDATE public.poll_votes
      SET option_id = p_option_id
      WHERE poll_id = p_poll_id
        AND user_id = v_uid;
      IF NOT FOUND AND v_key IS NOT NULL THEN
        UPDATE public.poll_votes
        SET option_id = p_option_id
        WHERE poll_id = p_poll_id
          AND voter_key = v_key;
      END IF;
    ELSE
      IF v_key IS NULL OR length(v_key) < 16 OR length(v_key) > 80 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_voter_key');
      END IF;
      UPDATE public.poll_votes
      SET option_id = p_option_id
      WHERE poll_id = p_poll_id
        AND voter_key = v_key;
    END IF;

    v_payload := public._poll_results_payload(p_poll_id, p_option_id);
    RETURN jsonb_build_object(
      'ok', true,
      'updated', true,
      'options', v_payload->'options',
      'my_option_id', p_option_id,
      'has_voted', true
    );
  END IF;

  IF v_uid IS NOT NULL THEN
    BEGIN
      INSERT INTO public.poll_votes (poll_id, option_id, user_id, voter_key)
      VALUES (p_poll_id, p_option_id, v_uid, NULL);
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.poll_votes
      SET option_id = p_option_id
      WHERE poll_id = p_poll_id
        AND user_id = v_uid;
    END;
  ELSE
    IF v_key IS NULL OR length(v_key) < 16 OR length(v_key) > 80 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_voter_key');
    END IF;
    BEGIN
      INSERT INTO public.poll_votes (poll_id, option_id, user_id, voter_key)
      VALUES (p_poll_id, p_option_id, NULL, v_key);
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.poll_votes
      SET option_id = p_option_id
      WHERE poll_id = p_poll_id
        AND voter_key = v_key;
    END;
  END IF;

  v_payload := public._poll_results_payload(p_poll_id, p_option_id);
  RETURN jsonb_build_object(
    'ok', true,
    'updated', false,
    'options', v_payload->'options',
    'my_option_id', p_option_id,
    'has_voted', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_vote(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_vote(uuid, uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.poll_vote(uuid, uuid, text) IS
  '1 vote par user_id (connecté) ou voter_key (anonyme). Modifiable : UPDATE si déjà voté.';

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.poll_admin_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'polls', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'slug', p.slug,
          'question', p.question,
          'is_active', p.is_active,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'votes_count', (SELECT count(*) FROM public.poll_votes v WHERE v.poll_id = p.id),
          'options', (
            SELECT coalesce(jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'label', o.label,
                'subtitle', o.subtitle,
                'emoji', o.emoji,
                'level_key', o.level_key,
                'sort_order', o.sort_order,
                'votes', (SELECT count(*) FROM public.poll_votes vv WHERE vv.option_id = o.id)
              )
              ORDER BY o.sort_order ASC
            ), '[]'::jsonb)
            FROM public.poll_options o
            WHERE o.poll_id = p.id
          )
        )
        ORDER BY p.created_at DESC
      )
      FROM public.polls p
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_admin_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_admin_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.poll_admin_create(
  p_question text,
  p_options jsonb,
  p_slug text DEFAULT NULL,
  p_activate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll_id uuid;
  v_opt jsonb;
  v_i int := 0;
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_question IS NULL OR length(trim(p_question)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_question');
  END IF;

  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_options');
  END IF;

  IF p_activate THEN
    UPDATE public.polls SET is_active = false, updated_at = now() WHERE is_active = true;
  END IF;

  INSERT INTO public.polls (question, slug, is_active)
  VALUES (
    trim(p_question),
    nullif(trim(coalesce(p_slug, '')), ''),
    coalesce(p_activate, false)
  )
  RETURNING id INTO v_poll_id;

  FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    INSERT INTO public.poll_options (poll_id, label, subtitle, emoji, level_key, sort_order)
    VALUES (
      v_poll_id,
      trim(coalesce(v_opt->>'label', '')),
      trim(coalesce(v_opt->>'subtitle', '')),
      trim(coalesce(v_opt->>'emoji', '')),
      nullif(trim(coalesce(v_opt->>'level_key', '')), ''),
      coalesce((v_opt->>'sort_order')::smallint, v_i)
    );
    v_i := v_i + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_poll_id);
END;
$$;

REVOKE ALL ON FUNCTION public.poll_admin_create(text, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_admin_create(text, jsonb, text, boolean)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.poll_admin_set_active(p_poll_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_poll_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_params');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.polls WHERE id = p_poll_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF coalesce(p_active, false) THEN
    UPDATE public.polls SET is_active = false, updated_at = now() WHERE is_active = true;
    UPDATE public.polls SET is_active = true, updated_at = now() WHERE id = p_poll_id;
  ELSE
    UPDATE public.polls SET is_active = false, updated_at = now() WHERE id = p_poll_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_poll_id, 'is_active', coalesce(p_active, false));
END;
$$;

REVOKE ALL ON FUNCTION public.poll_admin_set_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_admin_set_active(uuid, boolean)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.poll_admin_results(p_poll_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.polls%ROWTYPE;
  v_total bigint;
  v_leader jsonb;
BEGIN
  IF NOT public._goelo_caller_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT count(*) INTO v_total FROM public.poll_votes WHERE poll_id = p_poll_id;

  SELECT jsonb_build_object(
    'id', o.id,
    'label', o.label,
    'votes', cnt.c,
    'percent', CASE WHEN v_total = 0 THEN 0 ELSE round(100.0 * cnt.c / v_total)::int END
  )
  INTO v_leader
  FROM public.poll_options o
  CROSS JOIN LATERAL (
    SELECT count(*)::bigint AS c FROM public.poll_votes v WHERE v.option_id = o.id
  ) cnt
  WHERE o.poll_id = p_poll_id
  ORDER BY cnt.c DESC, o.sort_order ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'question', v_poll.question,
      'is_active', v_poll.is_active
    ),
    'votes_count', v_total,
    'leader', v_leader,
    'options', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'subtitle', o.subtitle,
          'emoji', o.emoji,
          'level_key', o.level_key,
          'sort_order', o.sort_order,
          'votes', (SELECT count(*) FROM public.poll_votes v WHERE v.option_id = o.id),
          'percent', CASE
            WHEN v_total = 0 THEN 0
            ELSE round(100.0 * (
              SELECT count(*) FROM public.poll_votes v WHERE v.option_id = o.id
            ) / v_total)::int
          END
        )
        ORDER BY o.sort_order ASC
      )
      FROM public.poll_options o
      WHERE o.poll_id = p_poll_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_admin_results(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_admin_results(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed : premier sondage préférences sorties (actif)
-- Distances alignées sur js/goelo-levels.js
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.polls WHERE slug = 'preferences-sorties-v1') THEN
    RETURN;
  END IF;

  INSERT INTO public.polls (slug, question, is_active)
  VALUES (
    'preferences-sorties-v1',
    'Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?',
    true
  )
  RETURNING id INTO v_id;

  INSERT INTO public.poll_options (poll_id, label, subtitle, emoji, level_key, sort_order) VALUES
    (v_id, 'Découverte', '25–40 km · tranquille', '🟢', 'blanc', 0),
    (v_id, 'Intermédiaire', '40–60 km · régulier', '🔵', 'vert', 1),
    (v_id, 'Confirmé', '55–75 km · soutenu', '🟣', 'bleu', 2),
    (v_id, 'Expert', '75 km+ · exigeant', '🔴', 'rouge', 3);
END $$;
