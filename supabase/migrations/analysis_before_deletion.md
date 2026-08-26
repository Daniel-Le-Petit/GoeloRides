# Analyse de suppression des sorties GoRide #12

## Routes à supprimer
- `c_c679ae604b014a9c`
- `c_d1ca378d44064751`

## Route à conserver
- `c_7376cb79865246be`

## Tables avec références à routes.id

### 1. signups
- **Contrainte:** `REFERENCES public.routes (id) ON DELETE CASCADE`
- **Impact:** Toutes les inscriptions liées aux 2 routes seront supprimées automatiquement

### 2. imported_participant_names
- **Contrainte:** `REFERENCES public.routes (id) ON DELETE CASCADE`
- **Impact:** Tous les noms de participants importés pour ces 2 routes seront supprimés automatiquement

### 3. guest_participants
- **Contrainte:** `REFERENCES public.routes (id) ON DELETE CASCADE`
- **Impact:** Tous les participants invités (sans compte) pour ces 2 routes seront supprimés automatiquement

### 4. route_comments
- **Contrainte:** `REFERENCES public.routes (id) ON DELETE CASCADE`
- **Impact:** Tous les commentaires sur ces 2 routes seront supprimés automatiquement

### 5. activity_events
- **Contrainte:** AUCUNE (champ `route_id` de type TEXT sans foreign key)
- **Impact:** Les événements d'activité ne seront PAS supprimés automatiquement. Ils contiendront des `route_id` orphelins.
- **Recommandation:** Nettoyer manuellement ces enregistrements OU les laisser pour l'historique

## Migration SQL proposée

La migration ci-dessous supprimera UNIQUEMENT les deux routes spécifiées.
Grâce aux contraintes `ON DELETE CASCADE`, toutes les données liées dans les tables
`signups`, `imported_participant_names`, `guest_participants`, et `route_comments`
seront automatiquement supprimées.

```sql
-- Migration: Suppression des sorties GoRide #12 dupliquées
-- Date: 2026-08-26
-- Contexte: Suppression de 2 des 3 sorties GoRide #12, conservation de c_7376cb79865246be

BEGIN;

-- Vérification préalable: les routes existent
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.routes
  WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  IF v_count != 2 THEN
    RAISE EXCEPTION 'ERREUR: Les deux routes à supprimer ne sont pas toutes présentes (trouvé: %)', v_count;
  END IF;
  
  -- Vérifier que la route à conserver existe bien
  IF NOT EXISTS (SELECT 1 FROM public.routes WHERE id = 'c_7376cb79865246be') THEN
    RAISE EXCEPTION 'ERREUR: La route à conserver (c_7376cb79865246be) n''existe pas';
  END IF;
END $$;

-- Optionnel: Nettoyer les événements d'activité orphelins
-- (Ces enregistrements n'ont pas de contrainte FK, ils ne seront pas supprimés automatiquement)
DELETE FROM public.activity_events
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');

-- Suppression des routes
-- Les CASCADE vont automatiquement supprimer:
--   - signups
--   - imported_participant_names
--   - guest_participants
--   - route_comments
DELETE FROM public.routes
WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');

-- Vérification finale
DO $$
DECLARE
  v_deleted int;
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_deleted
  FROM public.routes
  WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
  
  SELECT count(*) INTO v_remaining
  FROM public.routes
  WHERE id = 'c_7376cb79865246be';
  
  IF v_deleted != 0 THEN
    RAISE EXCEPTION 'ERREUR: Les routes n''ont pas été supprimées correctement';
  END IF;
  
  IF v_remaining != 1 THEN
    RAISE EXCEPTION 'ERREUR: La route à conserver n''existe plus';
  END IF;
  
  RAISE NOTICE 'Suppression réussie. Route conservée: c_7376cb79865246be';
END $$;

COMMIT;
```

## Requêtes de vérification AVANT suppression

Exécutez ces requêtes pour voir combien de données seront affectées:

```sql
-- Voir les détails des 3 routes GoRide #12
SELECT 
  id,
  track_name,
  route_kind,
  is_active,
  created_at,
  front_config->>'title' as title,
  front_config->>'organizer' as organizer
FROM public.routes
WHERE id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
ORDER BY created_at;

-- Compter les inscriptions par route
SELECT 
  route_id,
  count(*) as signup_count,
  count(*) FILTER (WHERE canceled_at IS NULL) as active_signups
FROM public.signups
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;

-- Compter les participants importés par route
SELECT 
  route_id,
  count(*) as imported_count
FROM public.imported_participant_names
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;

-- Compter les invités par route
SELECT 
  route_id,
  count(*) as guest_count
FROM public.guest_participants
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;

-- Compter les commentaires par route
SELECT 
  route_id,
  count(*) as comment_count
FROM public.route_comments
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;

-- Compter les événements d'activité par route
SELECT 
  route_id,
  count(*) as activity_event_count
FROM public.activity_events
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;
```

## Requêtes de vérification APRÈS suppression

```sql
-- Vérifier qu'il ne reste qu'une seule route GoRide #12
SELECT 
  id,
  track_name,
  created_at
FROM public.routes
WHERE id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751');
-- Résultat attendu: 1 ligne avec c_7376cb79865246be

-- Vérifier qu'il n'y a plus de données orphelines pour les routes supprimées
SELECT 'signups' as table_name, count(*) as orphan_count
FROM public.signups
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
UNION ALL
SELECT 'imported_participant_names', count(*)
FROM public.imported_participant_names
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
UNION ALL
SELECT 'guest_participants', count(*)
FROM public.guest_participants
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
UNION ALL
SELECT 'route_comments', count(*)
FROM public.route_comments
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751')
UNION ALL
SELECT 'activity_events', count(*)
FROM public.activity_events
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');
-- Résultat attendu: tous à 0
```
