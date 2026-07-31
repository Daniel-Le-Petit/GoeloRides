-- poll_vote : 1 vote / utilisateur (ou voter_key), mais le vote est modifiable.
-- Si un vote existe déjà → UPDATE option_id (pas de 2e ligne).

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
  v_updated boolean := false;
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

  -- Vote déjà présent : mettre à jour (1 ligne / identité)
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
      IF NOT FOUND THEN
        -- Fallback : vote anonyme lié à voter_key avant connexion
        IF v_key IS NOT NULL THEN
          UPDATE public.poll_votes
          SET option_id = p_option_id
          WHERE poll_id = p_poll_id
            AND voter_key = v_key;
        END IF;
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

    v_updated := true;
    v_payload := public._poll_results_payload(p_poll_id, p_option_id);
    RETURN jsonb_build_object(
      'ok', true,
      'updated', true,
      'options', v_payload->'options',
      'my_option_id', p_option_id,
      'has_voted', true
    );
  END IF;

  -- Premier vote
  IF v_uid IS NOT NULL THEN
    BEGIN
      INSERT INTO public.poll_votes (poll_id, option_id, user_id, voter_key)
      VALUES (p_poll_id, p_option_id, v_uid, NULL);
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.poll_votes
      SET option_id = p_option_id
      WHERE poll_id = p_poll_id
        AND user_id = v_uid;
      v_updated := true;
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
      v_updated := true;
    END;
  END IF;

  v_payload := public._poll_results_payload(p_poll_id, p_option_id);
  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'options', v_payload->'options',
    'my_option_id', p_option_id,
    'has_voted', true
  );
END;
$$;

COMMENT ON FUNCTION public.poll_vote(uuid, uuid, text) IS
  '1 vote par user_id (connecté) ou voter_key (anonyme). Modifiable : UPDATE si déjà voté.';
