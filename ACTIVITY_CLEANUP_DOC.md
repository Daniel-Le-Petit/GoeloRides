# Fonctionnalité de nettoyage des activités

## Vue d'ensemble

Ajout d'un bouton "Nettoyer les activités" dans la page Admin > Activités permettant de supprimer :
1. Les activités datant de plus de 7 jours
2. Toutes les activités de l'utilisateur dont le pseudo est exactement "Daniel"

## Fichiers modifiés

### 1. Migration SQL : `supabase/migrations/20260824120000_activity_cleanup.sql`

**Fonction RPC créée** : `public.activity_admin_cleanup()`

**Retour de la fonction** :
```json
{
  "ok": true,
  "deleted_old": 42,        // Nombre d'activités de plus de 7 jours supprimées
  "deleted_daniel": 15,     // Nombre d'activités de Daniel supprimées
  "deleted_total": 57,      // Total (pas de double comptage)
  "cutoff_date": "...",     // Date de coupure (7 jours avant maintenant)
  "daniel_user_id": "..."   // UUID de Daniel (ou null si non trouvé)
}
```

**Logique de suppression** :
1. Vérifie que l'appelant est admin (via `_goelo_caller_is_admin()`)
2. Calcule la date de coupure : `now() - interval '7 days'`
3. Trouve l'ID de l'utilisateur Daniel via `profiles.pseudo = 'Daniel'`
4. Supprime les activités anciennes (> 7 jours) de `activity_events`
5. Supprime les activités de Daniel restantes (< 7 jours)
6. Retourne les statistiques de suppression

**Important** : Les activités de Daniel de plus de 7 jours ne sont comptées qu'une seule fois (d'abord supprimées par l'ancienneté, donc non présentes pour la suppression par utilisateur).

### 2. Interface HTML : `admin.html`

**Modification** : Ajout du bouton dans la section "Analyse visiteurs"

```html
<button class="btn-refresh" id="act-cleanup-btn" type="button" 
        style="border-color: var(--red); color: var(--red);">
  <span>🗑️</span> Nettoyer les activités
</button>
```

**Style** : Utilise la même classe que le bouton "Actualiser" mais avec une couleur rouge pour indiquer une action destructive.

### 3. JavaScript : `js/goelo-admin-activity.js`

**Fonctions ajoutées** :

#### `handleCleanup()`
- Affiche une confirmation avant suppression
- Appelle le RPC `activity_admin_cleanup`
- Gère les erreurs et affiche les résultats
- Rafraîchit la liste des activités après suppression

#### `showToast(message, isError)`
- Affiche des notifications toast pour le feedback utilisateur
- Toast rouge pour les erreurs (5s)
- Toast normal pour le succès (4s)

## Comportement de l'interface

### Avant la suppression

1. L'utilisateur clique sur "🗑️ Nettoyer les activités"
2. Une confirmation s'affiche :
   ```
   Supprimer les activités de plus de 7 jours ainsi que toutes les activités de l'utilisateur Daniel ?
   
   Cette action est irréversible.
   ```
3. Si l'utilisateur annule → aucune action
4. Si l'utilisateur confirme → appel RPC

### Pendant la suppression

- Le bouton est désactivé (`disabled = true`)
- Une requête est envoyée à Supabase

### Après la suppression (succès)

1. Toast de succès affiché pendant 4 secondes :
   ```
   Nettoyage terminé : • X activités de plus de 7 jours supprimées • Y activités de Daniel supprimées • Total : Z éléments supprimés
   ```
2. Après 800ms, la liste des activités est automatiquement rafraîchie
3. Le bouton est réactivé

### En cas d'erreur

1. Toast d'erreur affiché pendant 5 secondes :
   ```
   Erreur : [message d'erreur détaillé]
   ```
2. L'erreur est loggée dans la console
3. Le bouton est réactivé
4. La liste n'est PAS rafraîchie

## Sécurité

### Contrôles d'accès

- ✅ Fonction RPC `SECURITY DEFINER`
- ✅ Vérification admin via `_goelo_caller_is_admin()`
- ✅ Pas d'utilisation de `service_role` côté client
- ✅ Permissions : `authenticated, service_role` uniquement

### Identification de Daniel

- Recherche via `profiles.pseudo = 'Daniel'` (sensible à la casse)
- Utilise `actor_id` (UUID) pour la suppression, pas le texte affiché
- Si Daniel n'est pas trouvé → `daniel_user_id = null` → aucune activité supprimée pour ce critère

### Protection des données

- Aucune activité d'autres utilisateurs n'est supprimée
- Les activités liées à une même entité (sortie, etc.) mais créées par d'autres utilisateurs sont préservées
- Suppression uniquement basée sur `actor_id` et `created_at`

## Tests à effectuer

### Test 1 : Activités anciennes (> 7 jours)

```sql
-- Insérer une activité de test de plus de 7 jours
INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
VALUES (
  'USER_LOGIN',
  (SELECT id FROM profiles LIMIT 1),
  now() - interval '10 days',
  '{}'::jsonb
);

-- Vérifier qu'elle existe
SELECT * FROM activity_events WHERE created_at < now() - interval '7 days';

-- Exécuter le nettoyage via l'interface

-- Vérifier qu'elle a été supprimée
SELECT * FROM activity_events WHERE created_at < now() - interval '7 days';
-- Résultat attendu : 0 lignes
```

### Test 2 : Activités de Daniel (récentes)

```sql
-- Trouver l'ID de Daniel
SELECT id, pseudo FROM profiles WHERE pseudo = 'Daniel';

-- Insérer une activité récente de Daniel
INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
VALUES (
  'USER_LOGIN',
  (SELECT id FROM profiles WHERE pseudo = 'Daniel'),
  now() - interval '2 days',
  '{}'::jsonb
);

-- Exécuter le nettoyage via l'interface

-- Vérifier que l'activité de Daniel a été supprimée
SELECT * FROM activity_events 
WHERE actor_id = (SELECT id FROM profiles WHERE pseudo = 'Daniel');
-- Résultat attendu : 0 lignes
```

### Test 3 : Activités d'autres utilisateurs (récentes)

```sql
-- Insérer une activité récente d'un autre utilisateur
INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
VALUES (
  'USER_LOGIN',
  (SELECT id FROM profiles WHERE pseudo != 'Daniel' LIMIT 1),
  now() - interval '2 days',
  '{}'::jsonb
);

-- Exécuter le nettoyage via l'interface

-- Vérifier qu'elle est toujours là
SELECT * FROM activity_events 
WHERE actor_id = (SELECT id FROM profiles WHERE pseudo != 'Daniel' LIMIT 1)
  AND created_at > now() - interval '7 days';
-- Résultat attendu : >= 1 ligne (l'activité récente existe toujours)
```

### Test 4 : Comptage correct (pas de double comptage)

```sql
-- Insérer 5 activités anciennes de Daniel
DO $$
BEGIN
  FOR i IN 1..5 LOOP
    INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
    VALUES (
      'USER_LOGIN',
      (SELECT id FROM profiles WHERE pseudo = 'Daniel'),
      now() - interval '10 days',
      '{}'::jsonb
    );
  END LOOP;
END $$;

-- Insérer 3 activités récentes de Daniel
DO $$
BEGIN
  FOR i IN 1..3 LOOP
    INSERT INTO public.activity_events (event_type, actor_id, created_at, metadata)
    VALUES (
      'USER_LOGIN',
      (SELECT id FROM profiles WHERE pseudo = 'Daniel'),
      now() - interval '2 days',
      '{}'::jsonb
    );
  END LOOP;
END $$;

-- Exécuter le nettoyage via l'interface
-- Résultat attendu :
-- deleted_old = 5 (anciennes de Daniel)
-- deleted_daniel = 3 (récentes de Daniel)
-- deleted_total = 8 (5 + 3, pas 5 + 8)
```

### Test 5 : Vérification de l'affichage dans Admin

1. Créer des activités test
2. Ouvrir Admin > Activités
3. Vérifier que les activités s'affichent
4. Cliquer sur "Nettoyer les activités"
5. Confirmer
6. Vérifier le toast de succès
7. Vérifier que les activités ont disparu de la liste

### Test 6 : Gestion des erreurs

```javascript
// Dans la console du navigateur, simuler une erreur
// En appelant avec un utilisateur non-admin
const sb = window.goeloGetSb();
const res = await sb.rpc("activity_admin_cleanup");
// Résultat attendu : erreur "forbidden"
```

## Points d'attention

### Risques identifiés

1. **Suppression définitive** : Les activités supprimées ne peuvent pas être restaurées
2. **Performance** : Si des millions d'activités existent, la suppression peut être lente
3. **Pseudo exact** : Seul le pseudo "Daniel" (exact, sensible à la casse) est concerné

### Recommandations

1. **Backup avant production** : Faire un backup de `activity_events` avant le premier nettoyage
2. **Logs** : Surveiller les logs Supabase pour les erreurs
3. **Monitoring** : Vérifier régulièrement que les activités importantes ne sont pas supprimées par erreur

### Limitations connues

- Si l'utilisateur Daniel change son pseudo, les anciennes activités avec l'ancien `actor_id` ne seront plus supprimées
- La recherche est limitée au premier profil trouvé avec `pseudo = 'Daniel'`
- Aucune archive n'est créée avant suppression

## Commandes utiles

### Compter les activités à nettoyer (avant suppression)

```sql
SELECT 
  'Anciennes (> 7 jours)' as categorie,
  count(*) as nombre
FROM activity_events
WHERE created_at < now() - interval '7 days'

UNION ALL

SELECT 
  'Daniel (toutes dates)' as categorie,
  count(*) as nombre
FROM activity_events
WHERE actor_id = (SELECT id FROM profiles WHERE pseudo = 'Daniel');
```

### Voir les activités de Daniel

```sql
SELECT 
  ae.id,
  ae.event_type,
  ae.created_at,
  p.pseudo,
  ae.metadata
FROM activity_events ae
JOIN profiles p ON p.id = ae.actor_id
WHERE p.pseudo = 'Daniel'
ORDER BY ae.created_at DESC;
```

### Appeler le RPC manuellement (en SQL)

```sql
SELECT public.activity_admin_cleanup();
```

## Dépannage

### Le bouton ne fait rien

1. Vérifier la console JavaScript pour les erreurs
2. Vérifier que `goelo-admin-activity.js` est bien chargé
3. Vérifier que l'utilisateur est admin

### Erreur "forbidden"

- L'utilisateur n'est pas administrateur
- Vérifier `profiles.role = 'admin'`

### Erreur "function does not exist"

- La migration n'a pas été appliquée
- Exécuter `20260824120000_activity_cleanup.sql`

### Le comptage semble incorrect

- Vérifier les logs SQL
- Compter manuellement avec les requêtes ci-dessus
- Les activités de Daniel > 7 jours sont comptées dans `deleted_old` uniquement
