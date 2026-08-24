-- ============================================================================
-- TESTS POUR LA FONCTIONNALITÉ DE NETTOYAGE DES ACTIVITÉS
-- ============================================================================
-- 
-- Ce fichier contient des tests SQL pour valider la fonctionnalité
-- de nettoyage des activités dans Admin > Activités
--
-- ⚠️ IMPORTANT : Ces tests créent et suppriment des données de test
-- ⚠️ Ne pas exécuter en production sans précautions
--
-- ============================================================================

-- ============================================================================
-- PRÉPARATION : Création des données de test
-- ============================================================================

-- 1. Vérifier que Daniel existe (sinon créer un profil test)
DO $$
DECLARE
  v_daniel_id uuid;
BEGIN
  SELECT id INTO v_daniel_id FROM public.profiles WHERE pseudo = 'Daniel';
  
  IF v_daniel_id IS NULL THEN
    RAISE NOTICE 'Daniel n''existe pas. Créer un profil test "Daniel" ou adapter les tests.';
  ELSE
    RAISE NOTICE 'Daniel trouvé : %', v_daniel_id;
  END IF;
END $$;

-- 2. Compter les activités AVANT les tests
SELECT 
  'AVANT TESTS - État initial' as phase,
  count(*) as total_activites
FROM public.activity_events;

SELECT 
  'AVANT TESTS - Anciennes activités' as phase,
  count(*) as nombre
FROM public.activity_events
WHERE created_at < now() - interval '7 days';

SELECT 
  'AVANT TESTS - Activités de Daniel' as phase,
  count(*) as nombre
FROM public.activity_events
WHERE actor_id = (SELECT id FROM profiles WHERE pseudo = 'Daniel');

-- ============================================================================
-- TEST 1 : Activités anciennes (> 7 jours) doivent être supprimées
-- ============================================================================

-- Insérer une activité de test de plus de 7 jours
DO $$
DECLARE
  v_test_actor_id uuid;
BEGIN
  -- Prendre le premier profil non-Daniel
  SELECT id INTO v_test_actor_id 
  FROM public.profiles 
  WHERE pseudo != 'Daniel' 
  LIMIT 1;
  
  IF v_test_actor_id IS NULL THEN
    -- Si pas de profil, utiliser NULL (activité anonyme)
    v_test_actor_id := NULL;
  END IF;
  
  -- Insérer une activité ancienne
  INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
  VALUES (
    'USER_LOGIN',
    v_test_actor_id,
    now() - interval '10 days',
    jsonb_build_object('test', 'old_activity', 'test_id', gen_random_uuid())
  );
  
  RAISE NOTICE 'TEST 1 : Activité ancienne insérée';
END $$;

-- Vérifier qu'elle existe
SELECT 
  'TEST 1 - Vérification avant nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'old_activity';

-- ============================================================================
-- TEST 2 : Activités récentes de Daniel doivent être supprimées
-- ============================================================================

-- Insérer une activité récente de Daniel
DO $$
DECLARE
  v_daniel_id uuid;
BEGIN
  SELECT id INTO v_daniel_id FROM public.profiles WHERE pseudo = 'Daniel';
  
  IF v_daniel_id IS NOT NULL THEN
    INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
    VALUES (
      'USER_LOGIN',
      v_daniel_id,
      now() - interval '2 days',
      jsonb_build_object('test', 'daniel_recent', 'test_id', gen_random_uuid())
    );
    RAISE NOTICE 'TEST 2 : Activité récente de Daniel insérée';
  ELSE
    RAISE NOTICE 'TEST 2 : SKIPPED - Daniel non trouvé';
  END IF;
END $$;

-- Vérifier qu'elle existe
SELECT 
  'TEST 2 - Vérification avant nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1 (si Daniel existe)' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'daniel_recent';

-- ============================================================================
-- TEST 3 : Activités récentes d'autres utilisateurs NE doivent PAS être supprimées
-- ============================================================================

-- Insérer une activité récente d'un autre utilisateur
DO $$
DECLARE
  v_other_user_id uuid;
BEGIN
  SELECT id INTO v_other_user_id 
  FROM public.profiles 
  WHERE pseudo != 'Daniel' 
  LIMIT 1;
  
  IF v_other_user_id IS NULL THEN
    v_other_user_id := NULL; -- Activité anonyme
  END IF;
  
  INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
  VALUES (
    'USER_LOGIN',
    v_other_user_id,
    now() - interval '2 days',
    jsonb_build_object('test', 'other_recent', 'test_id', gen_random_uuid())
  );
  
  RAISE NOTICE 'TEST 3 : Activité récente d''un autre utilisateur insérée';
END $$;

-- Vérifier qu'elle existe
SELECT 
  'TEST 3 - Vérification avant nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'other_recent';

-- ============================================================================
-- TEST 4 : Anciennes activités de Daniel (comptage unique)
-- ============================================================================

-- Insérer une activité ancienne de Daniel
DO $$
DECLARE
  v_daniel_id uuid;
BEGIN
  SELECT id INTO v_daniel_id FROM public.profiles WHERE pseudo = 'Daniel';
  
  IF v_daniel_id IS NOT NULL THEN
    INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
    VALUES (
      'USER_LOGIN',
      v_daniel_id,
      now() - interval '10 days',
      jsonb_build_object('test', 'daniel_old', 'test_id', gen_random_uuid())
    );
    RAISE NOTICE 'TEST 4 : Activité ancienne de Daniel insérée';
  ELSE
    RAISE NOTICE 'TEST 4 : SKIPPED - Daniel non trouvé';
  END IF;
END $$;

-- Vérifier qu'elle existe
SELECT 
  'TEST 4 - Vérification avant nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1 (si Daniel existe)' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'daniel_old';

-- ============================================================================
-- ÉTAT AVANT NETTOYAGE
-- ============================================================================

SELECT 
  '=== ÉTAT AVANT NETTOYAGE ===' as section,
  count(*) as total_activites_test
FROM public.activity_events
WHERE metadata->>'test' IS NOT NULL;

SELECT 
  metadata->>'test' as type_test,
  count(*) as nombre
FROM public.activity_events
WHERE metadata->>'test' IS NOT NULL
GROUP BY metadata->>'test'
ORDER BY metadata->>'test';

-- ============================================================================
-- EXÉCUTION DU NETTOYAGE
-- ============================================================================

-- ⚠️ DÉCOMMENTER LA LIGNE SUIVANTE POUR EXÉCUTER LE NETTOYAGE
-- SELECT public.activity_admin_cleanup();

-- OU exécuter manuellement via l'interface Admin > Activités

-- ============================================================================
-- VÉRIFICATIONS APRÈS NETTOYAGE
-- ============================================================================

-- ⚠️ EXÉCUTER CES REQUÊTES APRÈS AVOIR CLIQUÉ SUR "Nettoyer les activités"

-- Test 1 : Activités anciennes supprimées
SELECT 
  'TEST 1 - APRÈS nettoyage' as etape,
  count(*) as nombre,
  'Attendu : 0' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'old_activity';

-- Test 2 : Activités récentes de Daniel supprimées
SELECT 
  'TEST 2 - APRÈS nettoyage' as etape,
  count(*) as nombre,
  'Attendu : 0' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'daniel_recent';

-- Test 3 : Activités récentes d'autres utilisateurs CONSERVÉES
SELECT 
  'TEST 3 - APRÈS nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1 (CONSERVÉE)' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'other_recent';

-- Test 4 : Anciennes activités de Daniel supprimées (comptées dans deleted_old)
SELECT 
  'TEST 4 - APRÈS nettoyage' as etape,
  count(*) as nombre,
  'Attendu : 0' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'daniel_old';

-- Résumé
SELECT 
  '=== RÉSUMÉ APRÈS NETTOYAGE ===' as section,
  count(*) as activites_test_restantes,
  'Attendu : 1 (other_recent uniquement)' as attendu
FROM public.activity_events
WHERE metadata->>'test' IS NOT NULL;

-- ============================================================================
-- NETTOYAGE DES DONNÉES DE TEST
-- ============================================================================

-- Supprimer toutes les activités de test restantes
DELETE FROM public.activity_events
WHERE metadata->>'test' IS NOT NULL;

SELECT 
  'Nettoyage des données de test terminé' as resultat,
  count(*) as activites_test_restantes
FROM public.activity_events
WHERE metadata->>'test' IS NOT NULL;

-- ============================================================================
-- TESTS SUPPLÉMENTAIRES : Vérifications de sécurité
-- ============================================================================

-- Test 5 : Vérifier qu'un non-admin ne peut pas appeler la fonction
-- ⚠️ À tester depuis un compte non-admin via l'interface ou la console navigateur
-- Résultat attendu : Erreur "forbidden"

-- Test 6 : Vérifier que les activités liées à une sortie ne sont pas toutes supprimées
-- (seulement celles de Daniel ou anciennes)

-- Créer une activité liée à une sortie (non-Daniel, récente)
DO $$
DECLARE
  v_other_user_id uuid;
  v_route_id text;
BEGIN
  SELECT id INTO v_other_user_id 
  FROM public.profiles 
  WHERE pseudo != 'Daniel' 
  LIMIT 1;
  
  SELECT id INTO v_route_id 
  FROM public.routes 
  WHERE is_active = true 
  LIMIT 1;
  
  IF v_other_user_id IS NOT NULL AND v_route_id IS NOT NULL THEN
    INSERT INTO public.activity_events (event_type, actor_id, entity_type, entity_id, created_at, metadata)
    VALUES (
      'RIDE_VIEWED',
      v_other_user_id,
      'route',
      v_route_id,
      now() - interval '2 days',
      jsonb_build_object('test', 'route_view_other', 'route_id', v_route_id)
    );
    RAISE NOTICE 'TEST 6 : Activité liée à une sortie (non-Daniel, récente) insérée';
  END IF;
END $$;

-- Vérifier avant nettoyage
SELECT 
  'TEST 6 - Avant nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'route_view_other';

-- Après nettoyage, cette activité DOIT être conservée
-- Car elle est récente ET n'est pas de Daniel

-- Pour vérifier après le nettoyage :
SELECT 
  'TEST 6 - Après nettoyage' as etape,
  count(*) as nombre,
  'Attendu : >= 1 (CONSERVÉE)' as attendu
FROM public.activity_events
WHERE metadata->>'test' = 'route_view_other';

-- Nettoyer
DELETE FROM public.activity_events
WHERE metadata->>'test' = 'route_view_other';

-- ============================================================================
-- FIN DES TESTS
-- ============================================================================

SELECT 
  '=== TESTS TERMINÉS ===' as section,
  now() as timestamp;
