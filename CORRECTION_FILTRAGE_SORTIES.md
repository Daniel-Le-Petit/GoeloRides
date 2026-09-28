# Correction du filtrage et tri des sorties - GoëloRides

## Problème résolu

La sortie GoëloRides #15 (datée du 25 septembre 2026) n'apparaissait plus dans l'interface d'administration une fois sa date passée, rendant impossible sa modification ou consultation.

## Modifications effectuées

### Fichier modifié : `js/team-rider.js`

**Lignes 119-166** : Modification de la fonction `renderSorties()`

#### Changement 1 : Suppression du filtre de date pour les admins (lignes 144-149)

**AVANT :**
```javascript
var cards = (result.data || [])
  .map(function (row) {
    return window.GoeloSortieCards.fromRouteRow(row);
  })
  .filter(function (c) {
    return !window.GoeloSortieDates || window.GoeloSortieDates.isActiveListSortie(c);
  });
```

**APRÈS :**
```javascript
var cards = (result.data || [])
  .map(function (row) {
    return window.GoeloSortieCards.fromRouteRow(row);
  });

// Filtrer les sorties passées UNIQUEMENT pour les non-admins
// Les admins voient TOUTES les sorties (passées et futures)
if (_currentRole !== "admin") {
  cards = cards.filter(function (c) {
    return !window.GoeloSortieDates || window.GoeloSortieDates.isActiveListSortie(c);
  });
}
```

#### Changement 2 : Ajout d'un tri par date de sortie réelle (lignes 150-166)

**Ajout du tri basé sur `rideDateIso` plutôt que `created_at` :**
```javascript
// Tri par date de sortie réelle (rideDateIso)
// - Administration : tri décroissant (plus récentes en premier)
// - Public : tri croissant (prochaines sorties en premier)
if (window.GoeloSortieDates) {
  cards.sort(function (a, b) {
    var dateA = window.GoeloSortieDates.sortieCalendarYmd(a);
    var dateB = window.GoeloSortieDates.sortieCalendarYmd(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    // Admin : décroissant (plus récent = plus grand = premier)
    // Non-admin : croissant (plus proche = plus petit = premier)
    return _currentRole === "admin" ? (dateB > dateA ? 1 : dateB < dateA ? -1 : 0)
                                     : (dateA > dateB ? 1 : dateA < dateB ? -1 : 0);
  });
}
```

#### Changement 3 : Ajustement du tri SQL (lignes 125-133)

**Simplification du tri SQL et différenciation admin/public :**
```javascript
// Tri différent selon le contexte :
// - Administration : tri décroissant par date de sortie (plus récentes en premier, y compris passées)
// - Public : tri croissant (prochaines sorties en premier)
if (_currentRole === "admin") {
  query = query.order("created_at", { ascending: false });
} else {
  query = query.eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
}
```

## Comportements après modification

### ✅ Administration (team-rider.html / dashboard Team Rider)

| Critère | Comportement |
|---------|-------------|
| **Filtrage par date** | ❌ AUCUN - Toutes les sorties affichées |
| **Sorties passées** | ✅ VISIBLES et modifiables |
| **Tri** | 📅 Date décroissante (plus récentes en premier) |
| **Ordre d'affichage** | GoëloRides #18 → #17 → #16 → #15 (même si #15 est passée) |

### ✅ Partie publique (sorties.html, index.html)

| Critère | Comportement |
|---------|-------------|
| **Filtrage par date** | ✅ ACTIF - Uniquement sorties futures |
| **Sorties passées** | ❌ MASQUÉES |
| **Tri** | 📅 Date croissante (prochaines en premier) |
| **Ordre d'affichage** | #18 (15 oct) → #19 (22 oct) si aujourd'hui = 10 oct |

## Fichiers non modifiés

Les fichiers suivants **n'ont PAS été modifiés** car leur comportement était déjà correct :

- `js/sorties.js` : Filtrage et tri public déjà corrects
- `js/goelo-sortie-dates.js` : Logique de détection des dates passées correcte
- `gestion-sorties.html` : Formulaire d'édition individuelle (pas de liste)
- Structure Supabase : Aucune modification de schéma
- Données existantes : Aucune donnée modifiée

## Vérifications effectuées

### ✅ Code non modifié inutilement
- Modification minimale ciblée sur `team-rider.js` uniquement
- Logique publique préservée intacte

### ✅ Compatibilité préservée
- Module `GoeloSortieDates` utilisé pour garantir la cohérence
- Gestion des cas où le module n'est pas chargé (fallback)
- Tri robuste avec gestion des dates nulles/invalides

### ✅ Comportements différenciés
- Variable `_currentRole` utilisée pour distinguer admin/public
- Filtres appliqués conditionnellement selon le rôle
- Tri inversé selon le contexte d'utilisation

## Test de validation

Pour vérifier que la correction fonctionne :

1. **Créer une sortie passée** (ex: rideDateIso = "2026-09-25")
2. **Se connecter comme admin** sur team-rider.html
3. **Vérifier** : La sortie passée doit apparaître dans la liste
4. **Vérifier** : Elle doit être en fin de liste (ordre décroissant)
5. **Ouvrir sorties.html en public** : La sortie passée ne doit PAS apparaître
6. **Créer une sortie future** (ex: rideDateIso = "2026-10-15")
7. **Vérifier** : La sortie future apparaît pour public ET admin
8. **Vérifier** : Pour le public, elle apparaît EN PREMIER (plus proche)
9. **Vérifier** : Pour l'admin, elle apparaît AVANT les sorties passées

## Impact utilisateur

### 👥 Administrateurs / Ride Leaders
- ✅ Peuvent consulter l'historique complet des sorties
- ✅ Peuvent modifier les sorties passées si nécessaire
- ✅ Peuvent dupliquer/réutiliser les anciennes sorties
- ✅ Vue ordonnée avec les plus récentes en premier

### 🚴 Cyclistes (public)
- ✅ Ne voient que les sorties à venir (pas de confusion)
- ✅ Les prochaines sorties apparaissent en premier
- ✅ Expérience utilisateur inchangée et optimale

## Notes techniques

- La fonction `sortieCalendarYmd()` retourne la date au format YYYY-MM-DD
- Le tri compare les chaînes ISO directement (ex: "2026-10-15" > "2026-09-25")
- Le module `GoeloSortieDates` gère automatiquement le fuseau horaire Europe/Paris
- Le filtre `isActiveListSortie()` vérifie : `rideDateIso >= todayParisYmd()`
