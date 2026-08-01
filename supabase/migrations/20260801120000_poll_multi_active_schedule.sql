-- GoëloRides — Plusieurs sondages actifs en parallèle + sondage jour/heure
-- 1) Lever la contrainte « un seul actif »
-- 2) RPC poll_get_by_slug (Home charge chaque sondage par slug)
-- 3) Activer / créer sans désactiver les autres
-- 4) Seed preferences-horaire-v1

-- ---------------------------------------------------------------------------
-- Plusieurs sondages actifs autorisés
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.polls_one_active_uidx;

-- ---------------------------------------------------------------------------
-- Public : charger un sondage par slug (actif uniquement)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.poll_get_by_slug(
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
  v_my uuid;
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

REVOKE ALL ON FUNCTION public.poll_get_by_slug(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.poll_get_by_slug(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.poll_get_by_slug(text, text) IS
  'Sondage actif par slug + options + %. my_option_id si déjà voté (auth ou voter_key).';

-- Compat : poll_get_active conserve le 1er sondage actif (legacy)
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
  ORDER BY
    CASE WHEN slug = 'preferences-sorties-v1' THEN 0 ELSE 1 END,
    updated_at DESC
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

-- ---------------------------------------------------------------------------
-- Admin : activer sans désactiver les autres
-- ---------------------------------------------------------------------------
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

  UPDATE public.polls
  SET is_active = coalesce(p_active, false), updated_at = now()
  WHERE id = p_poll_id;

  RETURN jsonb_build_object('ok', true, 'id', p_poll_id, 'is_active', coalesce(p_active, false));
END;
$$;

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

  -- Ne plus désactiver les autres sondages : plusieurs actifs possibles

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

-- ---------------------------------------------------------------------------
-- Seed : sondage jour + heure (modifiable via options / level_key)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.polls WHERE slug = 'preferences-horaire-v1') THEN
    UPDATE public.polls
    SET
      question = 'Quel jour et quelle heure vous conviennent le mieux pour les sorties GoëloRides ?',
      is_active = true,
      updated_at = now()
    WHERE slug = 'preferences-horaire-v1';
    RETURN;
  END IF;

  INSERT INTO public.polls (slug, question, is_active)
  VALUES (
    'preferences-horaire-v1',
    'Quel jour et quelle heure vous conviennent le mieux pour les sorties GoëloRides ?',
    true
  )
  RETURNING id INTO v_id;

  INSERT INTO public.poll_options (poll_id, label, subtitle, emoji, level_key, sort_order) VALUES
    (v_id, 'Samedi · 9h00',    'Week-end · matin',       '🌅', 'sat-09',  0),
    (v_id, 'Samedi · 14h00',   'Week-end · après-midi',  '☀️', 'sat-14',  1),
    (v_id, 'Dimanche · 14h00', 'Week-end · après-midi',  '🌞', 'sun-14',  2),
    (v_id, 'En semaine · 9h00',  'Semaine · matin',      '🚲', 'week-09', 3),
    (v_id, 'En semaine · 18h00', 'Semaine · soir',       '🌇', 'week-18', 4);
END $$;

-- S’assurer que le sondage sorties reste actif aussi
UPDATE public.polls
SET is_active = true, updated_at = now()
WHERE slug = 'preferences-sorties-v1';
