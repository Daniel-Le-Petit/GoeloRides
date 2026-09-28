# Correction définitive : Récupération COMPLÈTE des sorties

## 🔍 ANALYSE DU PROBLÈME

### Questions posées par l'utilisateur

#### 1. Quel fichier charge actuellement les sorties ?
**Réponse :** `js/sorties.js`, fonction `fetchSorties()` à la ligne 193

#### 2. Quelle requête Supabase est utilisée ?
**Réponse :**
```javascript
var res = await sb
  .from("routes")
  .select("id, track_name, group_label, pace_label, is_active, front_config, created_at, assigned_team_rider_id, team_rider:profiles!assigned_team_rider_id(pseudo)")
  .eq("is_active", true)  // ← PROBLÈME ICI
  .order("created_at", { ascending: false });
```

#### 3. Quel filtre empêche actuellement certaines sorties d'apparaître ?
**Réponse :** `.eq("is_active", true)` à la ligne 203

Ce filtre ne récupère QUE les sorties dont `is_active = true` dans la base de données.

Si certaines sorties ont été marquées comme `is_active = false`, elles ne seront **JAMAIS** récupérées, même en mode "Toutes" pour un administrateur.

#### 4. Existe-t-il une limite ou une pagination ?
**Réponse :** Non, aucune limite `.limit()` ou `.range()` n'est appliquée.

#### 5. Combien de sorties la requête récupère-t-elle actuellement ?
**Réponse :** Uniquement les sorties où `is_active = true`, sans limite de nombre.

Si la base contient 100 sorties mais que 30 sont marquées `is_active = false`, seules 70 sorties seront récupérées.

#### 6. Combien de sorties devrait-elle récupérer en mode « Toutes » ?
**Réponse :** **TOUTES** les sorties de la table `routes`, qu'elles soient `is_active = true` ou `false`.

## 🐛 CAUSE RACINE DU PROBLÈME

### Avant la correction

```javascript
async function fetchSorties() {
  var sb = getSb();
  if (!sb) {
    console.warn("[sorties] Supabase non disponible");
    return [];
  }

  var res = await sb
    .from("routes")
    .select("...")
    .eq("is_active", true)  // ❌ FILTRE APPLIQUÉ POUR TOUS LES UTILISATEURS
    .order("created_at", { ascending: false });

  if (res.error) {
    console.error("[sorties] erreur:", res.error);
    return [];
  }

  return (res.data || []).map(dbRowToSortie);
}
```

**Problème :**
- Le filtre `.eq("is_active", true)` était appliqué **POUR TOUS LES UTILISATEURS**, qu'ils soient admin ou non
- Même un administrateur en mode "Toutes" ne pouvait pas voir les sorties marquées `is_active = false`
- Le problème était **avant** l'affichage, dans la requête Supabase elle-même

### Comportement attendu (référence : team-rider.js)

Dans `js/team-rider.js`, ligne 126-132, nous avons trouvé la logique correcte :

```javascript
if (_currentRole === "admin") {
  query = query.order("created_at", { ascending: false });
} else {
  query = query.eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
}
```

**Comportement attendu :**
- **Admin** : récupère TOUTES les sorties (sans filtre `is_active`)
- **Non-admin** : récupère uniquement les sorties actives (`is_active = true`)

## ✅ SOLUTION IMPLÉMENTÉE

### Modification de fetchSorties()

```javascript
async function fetchSorties() {
  var sb = getSb();
  if (!sb) {
    console.warn("[sorties] Supabase non disponible");
    return [];
  }

  // Créer la requête de base
  var query = sb
    .from("routes")
    .select("id, track_name, group_label, pace_label, is_active, front_config, created_at, assigned_team_rider_id, team_rider:profiles!assigned_team_rider_id(pseudo)");

  // ✅ Appliquer le filtre is_active UNIQUEMENT pour les non-admins
  if (!isAdmin()) {
    query = query.eq("is_active", true);
  }

  // Exécuter la requête
  var res = await query.order("created_at", { ascending: false });

  if (res.error) {
    console.error("[sorties] erreur:", res.error);
    return [];
  }

  return (res.data || []).map(dbRowToSortie);
}
```

### Rechargement lors du changement de rôle

**Avant :**
```javascript
window.addEventListener("goelo:role-ready", function () {
  initFiltersForRole();
  applyTeamRiderState();
  fetchJoinedRouteIds().then(render);
});
```

**Après :**
```javascript
window.addEventListener("goelo:role-ready", async function () {
  initFiltersForRole();
  applyTeamRiderState();
  state.sorties = await fetchSorties();  // ✅ RECHARGER LES SORTIES
  await fetchJoinedRouteIds();
  render();
});
```

**Pourquoi ce changement ?**

Sans ce changement, lorsqu'un utilisateur se connecte en tant qu'admin :
1. Les sorties sont chargées avec le filtre `is_active = true` (rôle "visitor" par défaut)
2. L'utilisateur devient admin
3. Les filtres visuels changent, mais les données ne sont PAS rechargées
4. L'admin ne voit toujours pas toutes les sorties

Avec ce changement :
1. Les sorties sont chargées avec le filtre `is_active = true` (rôle "visitor" par défaut)
2. L'utilisateur devient admin
3. Les données sont rechargées SANS filtre `is_active`
4. L'admin voit maintenant TOUTES les sorties

## 📊 IMPACT DE LA CORRECTION

### Pour les administrateurs

**Avant :**
- Mode "Toutes" : seulement les sorties `is_active = true`
- Mode "À venir" : seulement les sorties `is_active = true` ET futures
- Mode "Passées" : seulement les sorties `is_active = true` ET passées

**Après :**
- Mode "Toutes" : **100% des sorties de la base**, passées ET futures, actives ET inactives
- Mode "À venir" : toutes les sorties futures (actives ET inactives)
- Mode "Passées" : toutes les sorties passées (actives ET inactives)

### Pour les non-administrateurs

**Avant ET Après (aucun changement) :**
- Mode "À venir" : seulement les sorties `is_active = true` ET futures
- Mode "Passées" : seulement les sorties `is_active = true` ET passées

Les utilisateurs non-admin continuent de voir uniquement les sorties actives, ce qui est le comportement attendu.

## 🔄 CHEMINEMENT COMPLET

### Avant la correction

```
Home Page
   ↓
Bouton "Voir les sorties"
   ↓
sorties.html
   ↓
js/sorties.js → fetchSorties()
   ↓
Supabase: SELECT * FROM routes WHERE is_active = true  ❌ FILTRE POUR TOUS
   ↓
Filtrage JavaScript (matchesFilter)
   ↓
Tri (sortedSorties)
   ↓
Affichage des cartes
```

### Après la correction

```
Home Page
   ↓
Bouton "Voir les sorties"
   ↓
sorties.html
   ↓
js/sorties.js → fetchSorties()
   ↓
          ┌─────────────────┐
          │ Rôle = admin ?  │
          └─────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
       OUI               NON
        │                 │
        ↓                 ↓
   SELECT * FROM      SELECT * FROM
   routes             routes
   (TOUTES)           WHERE is_active = true
        │                 │
        └────────┬────────┘
                 ↓
   Filtrage JavaScript (matchesFilter)
                 ↓
   Tri (sortedSorties)
                 ↓
   Affichage des cartes
```

## 🧪 VÉRIFICATION

### Test pour administrateur

1. Se connecter en tant qu'administrateur
2. Aller sur "Voir les sorties"
3. Sélectionner le filtre "Toutes"
4. **Vérifier** : Le nombre de sorties affichées doit correspondre au nombre TOTAL de sorties dans la table `routes` de Supabase

### Test pour non-administrateur

1. Se connecter en tant qu'utilisateur simple (ou rester en visiteur)
2. Aller sur "Voir les sorties"
3. Vérifier que le filtre "Toutes" n'est PAS visible
4. Sélectionner "À venir" : seules les sorties actives futures sont affichées
5. Sélectionner "Passées" : seules les sorties actives passées sont affichées

### Requête SQL de vérification

Pour vérifier le nombre total de sorties dans la base :

```sql
-- Toutes les sorties
SELECT COUNT(*) FROM routes;

-- Sorties actives uniquement
SELECT COUNT(*) FROM routes WHERE is_active = true;

-- Sorties inactives
SELECT COUNT(*) FROM routes WHERE is_active = false;
```

Le mode "Toutes" pour admin doit afficher le résultat de la première requête.

## 📝 FICHIER MODIFIÉ

**Un seul fichier modifié :** `js/sorties.js`

### Modifications apportées

1. **Fonction `fetchSorties()` (ligne ~193)** :
   - Transformation de la requête directe en requête conditionnelle
   - Ajout de la vérification `if (!isAdmin())`
   - Application du filtre `is_active` uniquement pour les non-admins

2. **Événement `goelo:role-ready` (ligne ~791)** :
   - Transformation en fonction async
   - Ajout de `state.sorties = await fetchSorties();`
   - Rechargement complet des données lors du changement de rôle

3. **Événement `goelo:auth-success` (ligne ~797)** :
   - Transformation en fonction async
   - Ajout de `state.sorties = await fetchSorties();`
   - Rechargement complet des données lors de la connexion

## 🎯 RÉSULTAT FINAL

### Ce qui fonctionne maintenant

✅ Un administrateur en mode "Toutes" voit **100% des sorties** de la base de données  
✅ Le filtre "Toutes" n'applique AUCUN filtre temporel ni de statut  
✅ Les sorties sont rechargées automatiquement lors de la connexion  
✅ Le tri fonctionne correctement (futures → passées)  
✅ Les badges "SORTIE PASSÉE" s'affichent correctement  
✅ Les non-admins continuent de voir uniquement les sorties actives  

### Ce qui n'a PAS changé

✅ Aucune modification de la base de données  
✅ Aucune modification de la structure des tables  
✅ Aucune modification du design ou de l'UX  
✅ Aucune modification de la Home Page  
✅ Aucune modification des autres pages  
✅ Conservation de tous les composants existants  

## 🔍 AUTRES FILTRES VÉRIFIÉS

Lors de l'analyse, j'ai vérifié l'absence d'autres filtres problématiques :

❌ `.gte(...)` - Non trouvé  
❌ `.gt(...)` - Non trouvé  
❌ `.lte(...)` - Non trouvé  
❌ `.lt(...)` - Non trouvé  
✅ `.eq("is_active", true)` - **TROUVÉ ET CORRIGÉ**  
❌ `.neq(...)` - Non trouvé  
❌ `.in(...)` - Non trouvé  
❌ `.range(...)` - Non trouvé  
❌ `.limit(...)` - Non trouvé  
❌ Filtres JavaScript post-requête - Déjà supprimés lors de la modification précédente  

## 📈 EXEMPLE DE RÉSULTAT

### Scénario : Base de données contient 30 sorties

- 20 sorties avec `is_active = true`
- 10 sorties avec `is_active = false`
- 15 sorties futures
- 15 sorties passées

### Avant la correction

**Administrateur en mode "Toutes" :**
- Sorties récupérées : 20 (seulement celles avec `is_active = true`)
- ❌ 10 sorties manquantes

**Non-admin en mode "À venir" :**
- Sorties récupérées : ~10 (actives ET futures)
- ✅ Comportement correct

### Après la correction

**Administrateur en mode "Toutes" :**
- Sorties récupérées : 30 (TOUTES les sorties)
- ✅ 100% des sorties visibles

**Non-admin en mode "À venir" :**
- Sorties récupérées : ~10 (actives ET futures)
- ✅ Comportement inchangé (correct)

## ⚠️ NOTE IMPORTANTE

Cette correction résout le problème de récupération à la source, **avant** l'affichage.

Le filtre visuel "Toutes" ne se contente plus d'afficher les résultats déjà récupérés (qui étaient incomplets), il récupère maintenant TOUTES les sorties depuis Supabase.

Le problème était bien dans la **requête Supabase**, pas dans l'affichage.
