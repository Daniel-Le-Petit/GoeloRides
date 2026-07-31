-- Corrige le sondage actif : question + options (nouvelles distances).
-- N’en crée pas un second si preferences-sorties-v1 existe déjà.
-- Un seul sondage actif à la fin.

DO $$
DECLARE
  v_poll_id uuid;
BEGIN
  -- Un seul actif : désactiver les autres
  UPDATE public.polls
  SET is_active = false, updated_at = now()
  WHERE is_active = true
    AND slug IS DISTINCT FROM 'preferences-sorties-v1';

  SELECT id INTO v_poll_id
  FROM public.polls
  WHERE slug = 'preferences-sorties-v1'
  LIMIT 1;

  IF v_poll_id IS NULL THEN
    SELECT id INTO v_poll_id
    FROM public.polls
    WHERE is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  IF v_poll_id IS NULL THEN
    INSERT INTO public.polls (slug, question, is_active)
    VALUES (
      'preferences-sorties-v1',
      'Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?',
      true
    )
    RETURNING id INTO v_poll_id;

    INSERT INTO public.poll_options (poll_id, label, subtitle, emoji, level_key, sort_order) VALUES
      (v_poll_id, 'Découverte', '25–40 km · tranquille', '🟢', 'blanc', 0),
      (v_poll_id, 'Intermédiaire', '40–60 km · régulier', '🔵', 'vert', 1),
      (v_poll_id, 'Confirmé', '55–75 km · soutenu', '🟣', 'bleu', 2),
      (v_poll_id, 'Expert', '75 km+ · exigeant', '🔴', 'rouge', 3);
    RETURN;
  END IF;

  UPDATE public.polls
  SET
    question = 'Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?',
    is_active = true,
    updated_at = now()
  WHERE id = v_poll_id;

  UPDATE public.polls
  SET is_active = false, updated_at = now()
  WHERE id <> v_poll_id AND is_active = true;

  -- Mettre à jour les 4 options par level_key (conserve les votes existants)
  UPDATE public.poll_options SET
    label = 'Découverte',
    subtitle = '25–40 km · tranquille',
    emoji = '🟢',
    sort_order = 0
  WHERE poll_id = v_poll_id AND level_key = 'blanc';

  UPDATE public.poll_options SET
    label = 'Intermédiaire',
    subtitle = '40–60 km · régulier',
    emoji = '🔵',
    sort_order = 1
  WHERE poll_id = v_poll_id AND level_key = 'vert';

  UPDATE public.poll_options SET
    label = 'Confirmé',
    subtitle = '55–75 km · soutenu',
    emoji = '🟣',
    sort_order = 2
  WHERE poll_id = v_poll_id AND level_key = 'bleu';

  UPDATE public.poll_options SET
    label = 'Expert',
    subtitle = '75 km+ · exigeant',
    emoji = '🔴',
    sort_order = 3
  WHERE poll_id = v_poll_id AND level_key = 'rouge';

  -- Fallback : anciennes options sans level_key / libellés legacy
  UPDATE public.poll_options SET
    label = 'Découverte',
    subtitle = '25–40 km · tranquille',
    emoji = '🟢',
    level_key = 'blanc',
    sort_order = 0
  WHERE poll_id = v_poll_id
    AND (
      label ILIKE '%découverte%'
      OR subtitle ILIKE '%50%70%'
      OR subtitle ILIKE '%50 – 70%'
    )
    AND (level_key IS NULL OR level_key = 'blanc');

  UPDATE public.poll_options SET
    label = 'Intermédiaire',
    subtitle = '40–60 km · régulier',
    emoji = '🔵',
    level_key = 'vert',
    sort_order = 1
  WHERE poll_id = v_poll_id
    AND (
      label ILIKE '%intermédiaire%'
      OR subtitle ILIKE '%70%100%'
    )
    AND (level_key IS NULL OR level_key = 'vert');

  UPDATE public.poll_options SET
    label = 'Confirmé',
    subtitle = '55–75 km · soutenu',
    emoji = '🟣',
    level_key = 'bleu',
    sort_order = 2
  WHERE poll_id = v_poll_id
    AND (
      label ILIKE '%confirm%'
      OR subtitle ILIKE '%90%130%'
    )
    AND (level_key IS NULL OR level_key = 'bleu');

  UPDATE public.poll_options SET
    label = 'Expert',
    subtitle = '75 km+ · exigeant',
    emoji = '🔴',
    level_key = 'rouge',
    sort_order = 3
  WHERE poll_id = v_poll_id
    AND (
      label ILIKE '%expert%'
      OR label ILIKE '%sportive%'
      OR label ILIKE '%challenge%'
      OR subtitle ILIKE '%100%160%'
    )
    AND (level_key IS NULL OR level_key = 'rouge');
END $$;
