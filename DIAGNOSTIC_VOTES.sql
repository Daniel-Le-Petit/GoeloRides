-- ============================================================================
-- DIAGNOSTIC COMPLET : Vérification des sondages et votes existants
-- NE PAS EXÉCUTER DE MODIFICATIONS - DIAGNOSTIC UNIQUEMENT
-- ============================================================================

-- 1. LISTE TOUS LES SONDAGES (actifs et inactifs)
SELECT 
  'SONDAGES' as section,
  p.id,
  p.slug,
  p.question,
  p.is_active,
  p.poll_type,
  p.created_at,
  p.updated_at,
  (SELECT COUNT(*) FROM poll_options WHERE poll_id = p.id) as options_count,
  (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as votes_count
FROM polls p
ORDER BY p.created_at ASC;

-- 2. DÉTAIL DES OPTIONS DE CHAQUE SONDAGE
SELECT 
  'OPTIONS' as section,
  p.slug as poll_slug,
  po.id as option_id,
  po.label,
  po.subtitle,
  po.emoji,
  po.level_key,
  po.sort_order,
  (SELECT COUNT(*) FROM poll_votes WHERE option_id = po.id) as votes_on_this_option
FROM poll_options po
JOIN polls p ON p.id = po.poll_id
ORDER BY p.slug, po.sort_order;

-- 3. TOUS LES VOTES EXISTANTS (anonymes et authentifiés)
SELECT 
  'VOTES' as section,
  pv.id as vote_id,
  p.slug as poll_slug,
  p.question,
  po.label as voted_option,
  pv.user_id,
  pv.voter_key,
  pv.created_at
FROM poll_votes pv
JOIN polls p ON p.id = pv.poll_id
JOIN poll_options po ON po.id = pv.option_id
ORDER BY pv.created_at DESC;

-- 4. RÉSUMÉ PAR SONDAGE (combien de votes par option)
SELECT 
  'RÉSUMÉ_PAR_SONDAGE' as section,
  p.slug,
  p.question,
  po.label as option_label,
  COUNT(pv.id) as vote_count,
  ROUND(100.0 * COUNT(pv.id) / NULLIF(total.total_votes, 0), 1) as percentage
FROM polls p
JOIN poll_options po ON po.poll_id = p.id
LEFT JOIN poll_votes pv ON pv.option_id = po.id
CROSS JOIN (
  SELECT p2.id as poll_id, COUNT(*) as total_votes
  FROM polls p2
  LEFT JOIN poll_votes pv2 ON pv2.poll_id = p2.id
  GROUP BY p2.id
) total ON total.poll_id = p.id
GROUP BY p.id, p.slug, p.question, po.id, po.label, po.sort_order, total.total_votes
ORDER BY p.slug, po.sort_order;

-- 5. VÉRIFICATION DES VOTES ORPHELINS (votes sans sondage ou option)
SELECT 
  'VOTES_ORPHELINS' as section,
  pv.id as vote_id,
  pv.poll_id,
  pv.option_id,
  pv.user_id,
  pv.voter_key,
  CASE 
    WHEN p.id IS NULL THEN 'SONDAGE MANQUANT'
    WHEN po.id IS NULL THEN 'OPTION MANQUANTE'
    ELSE 'OK'
  END as status
FROM poll_votes pv
LEFT JOIN polls p ON p.id = pv.poll_id
LEFT JOIN poll_options po ON po.id = pv.option_id
WHERE p.id IS NULL OR po.id IS NULL;

-- 6. VOTES MULTI-CHOIX (poll_multi_responses)
SELECT 
  'VOTES_MULTI' as section,
  pmr.id as response_id,
  p.slug as poll_slug,
  p.question,
  pmr.free_text,
  pmr.user_id,
  pmr.voter_key,
  pmr.created_at,
  (SELECT COUNT(*) FROM poll_multi_response_options WHERE response_id = pmr.id) as options_selected
FROM poll_multi_responses pmr
JOIN polls p ON p.id = pmr.poll_id
ORDER BY pmr.created_at DESC;

-- 7. DÉTAIL DES OPTIONS SÉLECTIONNÉES DANS LES VOTES MULTI
SELECT 
  'DÉTAIL_VOTES_MULTI' as section,
  p.slug as poll_slug,
  pmr.id as response_id,
  po.label as selected_option,
  pmr.created_at
FROM poll_multi_responses pmr
JOIN poll_multi_response_options pmro ON pmro.response_id = pmr.id
JOIN poll_options po ON po.id = pmro.option_id
JOIN polls p ON p.id = pmr.poll_id
ORDER BY pmr.created_at DESC, po.sort_order;

-- 8. VÉRIFICATION : Y a-t-il des doublons de sondages ?
SELECT 
  'DOUBLONS_SONDAGES' as section,
  slug,
  COUNT(*) as count,
  array_agg(id) as poll_ids,
  array_agg(is_active) as active_status
FROM polls
WHERE slug IS NOT NULL
GROUP BY slug
HAVING COUNT(*) > 1;

-- ============================================================================
-- FIN DU DIAGNOSTIC
-- ============================================================================
