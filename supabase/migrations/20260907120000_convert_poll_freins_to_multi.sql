-- GoëloRides — Conversion du sondage "Qu'est-ce qui vous retient" en type multi
-- pour permettre la saisie de texte libre sur l'option "Autre raison"

-- Migration des votes existants de poll_votes vers poll_multi_responses
-- Nécessaire car poll_type='multi' utilise poll_multi_responses.free_text

DO $$
DECLARE
  v_poll_id uuid;
  v_count_votes int;
  v_count_migrated int;
BEGIN
  -- Récupérer l'ID du sondage
  SELECT id INTO v_poll_id 
  FROM public.polls 
  WHERE slug = 'freins-creation-compte-v1' 
  LIMIT 1;

  IF v_poll_id IS NULL THEN
    RAISE NOTICE 'Le sondage freins-creation-compte-v1 n''existe pas encore. Migration ignorée.';
    RETURN;
  END IF;

  -- Compter les votes existants
  SELECT count(*) INTO v_count_votes
  FROM public.poll_votes
  WHERE poll_id = v_poll_id;

  RAISE NOTICE 'Migration du sondage % : % votes existants', v_poll_id, v_count_votes;

  -- Étape 1 : Migrer les votes existants vers poll_multi_responses
  -- On crée une réponse multi pour chaque vote single existant
  INSERT INTO public.poll_multi_responses (poll_id, user_id, voter_key, free_text, created_at, updated_at)
  SELECT 
    pv.poll_id,
    pv.user_id,
    pv.voter_key,
    '', -- Les anciens votes n'avaient pas de texte libre
    pv.created_at,
    now()
  FROM public.poll_votes pv
  WHERE pv.poll_id = v_poll_id
  ON CONFLICT DO NOTHING; -- Éviter les doublons si migration déjà faite

  GET DIAGNOSTICS v_count_migrated = ROW_COUNT;
  RAISE NOTICE '  → % réponses créées dans poll_multi_responses', v_count_migrated;

  -- Étape 2 : Créer les liens option pour chaque réponse migrée
  -- Un vote single = 1 option → devient 1 réponse multi avec 1 option
  INSERT INTO public.poll_multi_response_options (response_id, option_id)
  SELECT DISTINCT
    pmr.id AS response_id,
    pv.option_id
  FROM public.poll_votes pv
  JOIN public.poll_multi_responses pmr 
    ON pv.poll_id = pmr.poll_id
    AND (
      -- Matcher user_id OU voter_key
      (pv.user_id IS NOT NULL AND pv.user_id = pmr.user_id)
      OR (pv.voter_key IS NOT NULL AND pv.voter_key = pmr.voter_key)
    )
  WHERE pv.poll_id = v_poll_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count_migrated = ROW_COUNT;
  RAISE NOTICE '  → % liens option créés dans poll_multi_response_options', v_count_migrated;

  -- Étape 3 : Supprimer les anciens votes de poll_votes
  DELETE FROM public.poll_votes
  WHERE poll_id = v_poll_id;

  GET DIAGNOSTICS v_count_migrated = ROW_COUNT;
  RAISE NOTICE '  → % anciens votes supprimés de poll_votes', v_count_migrated;

  -- Étape 4 : Convertir le poll en type 'multi'
  UPDATE public.polls
  SET 
    poll_type = 'multi',
    updated_at = now()
  WHERE id = v_poll_id;

  RAISE NOTICE '✓ Migration terminée : le sondage est maintenant de type multi';
  RAISE NOTICE '  Les utilisateurs pourront désormais saisir du texte libre';
  RAISE NOTICE '  avec l''option "Autre raison"';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erreur lors de la migration : %', SQLERRM;
END $$;

-- Vérification post-migration
DO $$
DECLARE
  v_poll_id uuid;
  v_poll_type text;
  v_count_responses int;
  v_count_old_votes int;
BEGIN
  SELECT id, poll_type INTO v_poll_id, v_poll_type
  FROM public.polls 
  WHERE slug = 'freins-creation-compte-v1' 
  LIMIT 1;

  IF v_poll_id IS NOT NULL THEN
    SELECT count(*) INTO v_count_responses
    FROM public.poll_multi_responses
    WHERE poll_id = v_poll_id;

    SELECT count(*) INTO v_count_old_votes
    FROM public.poll_votes
    WHERE poll_id = v_poll_id;

    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════';
    RAISE NOTICE 'VÉRIFICATION POST-MIGRATION';
    RAISE NOTICE '═══════════════════════════════════════════════════════════';
    RAISE NOTICE 'Sondage ID: %', v_poll_id;
    RAISE NOTICE 'Type actuel: %', v_poll_type;
    RAISE NOTICE 'Réponses dans poll_multi_responses: %', v_count_responses;
    RAISE NOTICE 'Votes restants dans poll_votes: %', v_count_old_votes;
    RAISE NOTICE '═══════════════════════════════════════════════════════════';

    IF v_poll_type <> 'multi' THEN
      RAISE WARNING 'Le sondage n''est pas de type multi !';
    END IF;

    IF v_count_old_votes > 0 THEN
      RAISE WARNING 'Il reste des votes dans poll_votes !';
    END IF;
  END IF;
END $$;
