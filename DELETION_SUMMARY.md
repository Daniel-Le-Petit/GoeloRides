# 🗑️ Suppression des sorties GoRide #12 dupliquées

## 📋 Résumé

Vous avez demandé de supprimer 2 des 3 sorties GoRide #12 existantes dans Supabase, en conservant uniquement `c_7376cb79865246be`.

## 🎯 Routes concernées

| Action | ID de la route | Statut |
|--------|---------------|--------|
| ✅ **CONSERVER** | `c_7376cb79865246be` | Cette route sera préservée |
| ❌ **SUPPRIMER** | `c_c679ae604b014a9c` | Cette route sera supprimée |
| ❌ **SUPPRIMER** | `c_d1ca378d44064751` | Cette route sera supprimée |

## 🔍 Analyse de l'impact

J'ai analysé toutes les migrations Supabase et identifié les tables qui référencent `routes.id`. Voici ce qui sera affecté par la suppression :

### Tables avec suppression CASCADE automatique ✨

Ces données seront **automatiquement supprimées** grâce aux contraintes `ON DELETE CASCADE` :

1. **`signups`** (inscriptions)
   - Contrainte FK : `REFERENCES public.routes (id) ON DELETE CASCADE`
   - Impact : Toutes les inscriptions liées aux 2 routes

2. **`imported_participant_names`** (noms de participants importés)
   - Contrainte FK : `REFERENCES public.routes (id) ON DELETE CASCADE`
   - Impact : Tous les noms importés pour ces routes

3. **`guest_participants`** (participants invités sans compte)
   - Contrainte FK : `REFERENCES public.routes (id) ON DELETE CASCADE`
   - Impact : Tous les invités de ces routes

4. **`route_comments`** (commentaires)
   - Contrainte FK : `REFERENCES public.routes (id) ON DELETE CASCADE`
   - Impact : Tous les commentaires sur ces routes

### Table nécessitant un nettoyage manuel 🧹

5. **`activity_events`** (événements d'activité)
   - ⚠️ **PAS de contrainte FK** (simple champ TEXT)
   - Impact : Les événements ne seront pas supprimés automatiquement
   - Solution : La migration inclut un `DELETE` manuel pour nettoyer ces enregistrements

## 📄 Fichiers créés

### 1. Migration SQL : `supabase/migrations/20260826102100_delete_duplicate_goride12.sql`

Cette migration :
- ✅ Vérifie que les routes existent avant suppression
- ✅ Affiche un résumé des données qui seront supprimées (dans les logs)
- ✅ Nettoie manuellement les `activity_events`
- ✅ Supprime les 2 routes (CASCADE automatique pour les autres tables)
- ✅ Vérifie que la route à conserver existe toujours
- ✅ Utilise une transaction (BEGIN/COMMIT) pour garantir l'atomicité
- ✅ Inclut des messages NOTICE pour le suivi de l'exécution

### 2. Analyse détaillée : `supabase/migrations/analysis_before_deletion.md`

Ce document contient :
- Liste complète des tables affectées
- Requêtes SQL pour vérifier l'impact AVANT suppression
- Requêtes SQL pour vérifier qu'il n'y a pas de données orphelines APRÈS suppression

## 🚀 Étapes recommandées

### Avant d'appliquer la migration

1. **Vérifier les données actuelles** :

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
```

2. **Compter les données qui seront supprimées** :

```sql
-- Inscriptions par route
SELECT 
  route_id,
  count(*) as signup_count,
  count(*) FILTER (WHERE canceled_at IS NULL) as active_signups
FROM public.signups
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;

-- Commentaires par route
SELECT 
  route_id,
  count(*) as comment_count
FROM public.route_comments
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;

-- Invités par route
SELECT 
  route_id,
  count(*) as guest_count
FROM public.guest_participants
WHERE route_id IN ('c_7376cb79865246be', 'c_c679ae604b014a9c', 'c_d1ca378d44064751')
GROUP BY route_id;
```

3. **(Optionnel) Créer une sauvegarde** si vous souhaitez pouvoir restaurer :

```sql
-- Sauvegarder les routes
CREATE TABLE IF NOT EXISTS backup_routes_20260826 AS
SELECT * FROM public.routes
WHERE id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');

-- Sauvegarder les inscriptions
CREATE TABLE IF NOT EXISTS backup_signups_20260826 AS
SELECT * FROM public.signups
WHERE route_id IN ('c_c679ae604b014a9c', 'c_d1ca378d44064751');

-- etc.
```

### Appliquer la migration

Option 1 - Via Supabase Dashboard :
1. Ouvrir Supabase Dashboard → SQL Editor
2. Copier le contenu de `supabase/migrations/20260826102100_delete_duplicate_goride12.sql`
3. Exécuter
4. Vérifier les messages NOTICE dans les logs

Option 2 - Via CLI Supabase :
```bash
supabase db push
```

### Après la migration

**Vérifier qu'il ne reste aucune donnée orpheline** :

```sql
SELECT 
  'signups' as table_name, 
  count(*) as orphan_count
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
```

**Résultat attendu** : Tous les compteurs doivent être à **0**.

## ⚠️ Points d'attention

1. **Transaction atomique** : La migration utilise `BEGIN/COMMIT`, donc soit tout est supprimé, soit rien (en cas d'erreur)

2. **Pas de rollback automatique des données** : Une fois la migration appliquée et validée (COMMIT), les données sont définitivement supprimées. Si vous voulez pouvoir restaurer, créez une sauvegarde avant.

3. **CASCADE** : Les contraintes `ON DELETE CASCADE` signifient que la suppression des routes entraînera automatiquement la suppression de toutes les données liées. C'est voulu et contrôlé.

4. **activity_events** : Cette table ne possède pas de contrainte FK, donc le nettoyage est manuel dans la migration. Si de nouveaux événements sont créés entre le moment où vous vérifiez et où vous exécutez la migration, ils seront également supprimés.

## 📊 Vue d'ensemble de la sécurité

✅ Vérifications préalables (existence des routes)  
✅ Transaction atomique (rollback automatique en cas d'erreur)  
✅ Vérifications finales (confirmation de la suppression et de la conservation)  
✅ Messages informatifs dans les logs  
✅ Documentation complète de l'impact  
✅ Pas de suppression accidentelle d'autres données  

## 🎬 Conclusion

La migration est prête à être exécutée. Elle supprimera **uniquement** les deux routes spécifiées (`c_c679ae604b014a9c` et `c_d1ca378d44064751`) et **toutes leurs données liées**, tout en préservant `c_7376cb79865246be` et ses données.

**Fichiers à consulter** :
- Migration SQL : `supabase/migrations/20260826102100_delete_duplicate_goride12.sql`
- Analyse détaillée : `supabase/migrations/analysis_before_deletion.md`

N'hésitez pas si vous souhaitez que je modifie quelque chose avant l'application !
