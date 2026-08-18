-- GoëloRides — Nouveau sondage : Qu'est-ce qui vous retient de créer votre compte ?
-- Ajout d'un sondage single-choice pour comprendre les freins à la création de compte.

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Vérifier si le sondage existe déjà
  SELECT id INTO v_id FROM public.polls WHERE slug = 'freins-creation-compte-v1' LIMIT 1;

  IF v_id IS NULL THEN
    -- Créer le nouveau sondage
    INSERT INTO public.polls (slug, question, is_active, poll_type)
    VALUES (
      'freins-creation-compte-v1',
      'Qu''est-ce qui vous retient de créer votre compte GoëloRides ?',
      true,
      'single'
    )
    RETURNING id INTO v_id;

    -- Ajouter les options
    INSERT INTO public.poll_options (poll_id, label, subtitle, emoji, level_key, sort_order) VALUES
      (v_id, 'Je découvre encore GoëloRides',                  '', '⚪', 'discovering',     0),
      (v_id, 'Je préfère simplement suivre les sorties',       '', '⚪', 'just-follow',     1),
      (v_id, 'Je ne vois pas encore l''intérêt de créer un compte', '', '⚪', 'no-interest',     2),
      (v_id, 'Je manque de temps',                             '', '⚪', 'no-time',         3),
      (v_id, 'Je ne savais pas comment faire',                 '', '⚪', 'dont-know-how',   4),
      (v_id, 'Je préfère m''inscrire autrement',               '', '⚪', 'other-way',       5),
      (v_id, 'Je ne suis pas encore prêt(e) à participer',     '', '⚪', 'not-ready',       6),
      (v_id, 'Autre raison',                                   '', '⚪', 'other',           7);
  ELSE
    -- Si le sondage existe déjà, le mettre à jour
    UPDATE public.polls
    SET
      question = 'Qu''est-ce qui vous retient de créer votre compte GoëloRides ?',
      is_active = true,
      poll_type = 'single',
      updated_at = now()
    WHERE id = v_id;
  END IF;
END $$;
