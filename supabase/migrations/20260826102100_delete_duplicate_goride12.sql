-- ============================================================================
-- Suppression des sorties GoRide #12 dupliquées
-- ============================================================================
-- Contexte: Il existe 3 sorties GoRide #12 dans la base de données.
--           Nous souhaitons en conserver une seule (c_7376cb79865246be)
--           et supprimer les deux autres.
--
-- Routes concernées:
--   - À CONSERVER: c_7376cb79865246be
--   - À SUPPRIMER: c_c679ae604b014a9c
--   - À SUPPRIMER: c_d1ca378d44064751
--
-- Impact CASCADE automatique sur:
--   - signups (inscriptions)
--   - imported_participant_names (noms importés)
--   - guest_participants (invités sans compte)
--   - route_comments (commentaires)
--
-- Impact manuel sur:
--   - activity_events (pas de FK, nettoyage manuel)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Vérifications préalables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_count_to_delete int;
  v_exists_to_keep boolean;
BEGIN
  -- Vérifier que les 2 routes à supprimer existent
  SELECT count(*) INTO v_count_to_delete
  FROM public.routes
  WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  IF v_count_to_delete < 2 THEN
    RAISE WARNING 'Attention: seulement % route(s) sur 2 trouvée(s) à supprimer', v_count_to_delete;
  END IF;
  
  -- Vérifier que la route à conserver existe
  SELECT EXISTS (
    SELECT 1 FROM public.routes WHERE id = 'c_7376cb79865246be'
  ) INTO v_exists_to_keep;
  
  IF NOT v_exists_to_keep THEN
    RAISE EXCEPTION 'ERREUR CRITIQUE: La route à conserver (c_7376cb79865246be) n''existe pas !';
  END IF;
  
  RAISE NOTICE 'Vérifications OK: % route(s) à supprimer trouvée(s), route à conserver présente', v_count_to_delete;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Affichage des données qui seront supprimées (pour les logs)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_signups int;
  v_imported int;
  v_guests int;
  v_comments int;
  v_events int;
BEGIN
  SELECT count(*) INTO v_signups
  FROM public.signups
  WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  SELECT count(*) INTO v_imported
  FROM public.imported_participant_names
  WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  SELECT count(*) INTO v_guests
  FROM public.guest_participants
  WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  SELECT count(*) INTO v_comments
  FROM public.route_comments
  WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  SELECT count(*) INTO v_events
  FROM public.activity_events
  WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  RAISE NOTICE 'Données à supprimer:';
  RAISE NOTICE '  - Inscriptions (signups): %', v_signups;
  RAISE NOTICE '  - Noms importés (imported_participant_names): %', v_imported;
  RAISE NOTICE '  - Invités (guest_participants): %', v_guests;
  RAISE NOTICE '  - Commentaires (route_comments): %', v_comments;
  RAISE NOTICE '  - Événements d''activité (activity_events): %', v_events;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Nettoyage manuel: activity_events (pas de contrainte FK)
-- ---------------------------------------------------------------------------

DELETE FROM public.activity_events
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');

-- ---------------------------------------------------------------------------
-- 4. Suppression des routes (CASCADE automatique pour les autres tables)
-- ---------------------------------------------------------------------------

DELETE FROM public.routes
WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');

-- ---------------------------------------------------------------------------
-- 5. Vérifications finales
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_deleted_count int;
  v_kept_count int;
BEGIN
  -- Vérifier que les routes ont bien été supprimées
  SELECT count(*) INTO v_deleted_count
  FROM public.routes
  WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  IF v_deleted_count != 0 THEN
    RAISE EXCEPTION 'ERREUR: % route(s) n''ont pas été supprimées', v_deleted_count;
  END IF;
  
  -- Vérifier que la route à conserver existe toujours
  SELECT count(*) INTO v_kept_count
  FROM public.routes
  WHERE id = 'c_7376cb79865246be';
  
  IF v_kept_count != 1 THEN
    RAISE EXCEPTION 'ERREUR: La route à conserver n''existe plus !';
  END IF;
  
  RAISE NOTICE '✓ Suppression réussie';
  RAISE NOTICE '✓ Route conservée: c_7376cb79865246be';
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Notes post-migration:
-- ---------------------------------------------------------------------------
-- Exécutez cette requête pour vérifier qu'il ne reste aucune donnée orpheline:
--
-- SELECT 
--   'signups' as table_name, 
--   count(*) as orphan_count
-- FROM public.signups
-- WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
-- UNION ALL
-- SELECT 'imported_participant_names', count(*)
-- FROM public.imported_participant_names
-- WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
-- UNION ALL
-- SELECT 'guest_participants', count(*)
-- FROM public.guest_participants
-- WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
-- UNION ALL
-- SELECT 'route_comments', count(*)
-- FROM public.route_comments
-- WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
-- UNION ALL
-- SELECT 'activity_events', count(*)
-- FROM public.activity_events
-- WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
--
-- Résultat attendu: tous les compteurs doivent être à 0
