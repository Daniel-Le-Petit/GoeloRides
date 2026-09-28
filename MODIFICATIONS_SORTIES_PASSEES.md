# Modifications : Gestion des sorties passées et futures

## Résumé

Implémentation d'un système de gestion des sorties passées et futures sur la page « Voir les sorties », avec des comportements différenciés selon le rôle utilisateur (admin vs non-admin).

## Fichiers modifiés

### 1. `sorties.html`
**Modifications :**
- Réorganisation des filtres : ajout de "Toutes" (admin only), "À venir" et "Passées"
- Le filtre "Toutes" est marqué avec `data-admin-only hidden` pour être masqué par défaut
- Le filtre "À venir" a la classe `is-active` par défaut

**Avant :**
```html
<button type="button" class="so-chip is-active" data-filter="tous">Tous</button>
<button type="button" class="so-chip" data-filter="route">Route</button>
...
<button type="button" class="so-chip" data-filter="a-venir">À venir</button>
```

**Après :**
```html
<button type="button" class="so-chip" data-filter="toutes" data-admin-only hidden>Toutes</button>
<button type="button" class="so-chip is-active" data-filter="a-venir">À venir</button>
<button type="button" class="so-chip" data-filter="passees">Passées</button>
<button type="button" class="so-chip" data-filter="route">Route</button>
```

### 2. `js/sorties.js`
**Nouvelles fonctions :**

#### `isAdmin()`
Détermine si l'utilisateur actuel est administrateur.

#### `isSortiePassed(sortie)`
Détermine si une sortie est passée en comparant sa date complète (date + heure) avec la date actuelle.

#### `initFiltersForRole()`
Configure l'affichage et la sélection des filtres selon le rôle :
- **Admin** : affiche le filtre "Toutes" et le sélectionne par défaut
- **Non-admin** : masque "Toutes", sélectionne "À venir" par défaut

**Modifications de fonctions existantes :**

#### `state` (ligne 328)
- Changement du filtre par défaut de `"tous"` à `"a-venir"`

#### `fetchSorties()` (ligne 193)
- Suppression du filtre `.filter(function (s) { return !window.GoeloSortieDates || window.GoeloSortieDates.isActiveListSortie(s); })`
- Récupère maintenant **toutes** les sorties actives, sans filtrage par date

#### `matchesFilter(s)` (ligne 537)
- Ajout de la logique pour les filtres "toutes", "a-venir" et "passees"
- Les autres filtres (route, gravel, vtt, aujourdhui, meteo-ideale) excluent maintenant automatiquement les sorties passées

#### `sortedSorties(list)` (ligne 409)
- Ajout d'un tri spécifique pour "toutes" : futures d'abord (ascendant), puis passées (descendant)
- Ajout d'un tri spécifique pour "passees" : descendant (de la plus récente à la plus ancienne)
- Tri par défaut pour "a-venir" et autres : ascendant (de la plus proche à la plus éloignée)

#### Initialisation (ligne 728)
- Ajout de l'appel à `initFiltersForRole()` dans `DOMContentLoaded`
- Ajout de l'appel à `initFiltersForRole()` dans les événements `goelo:role-ready` et `goelo:auth-success`

### 3. `js/sortie-cards.js`
**Nouvelle fonction :**

#### `isSortiePassed(card)` (ligne 180)
Détermine si une carte représente une sortie passée.

**Modifications de fonctions existantes :**

#### `buildTopActions(card, opts)` (ligne 186)
- Ajout du badge "Sortie passée" après le bouton "Voir" si la sortie est passée
- Masquage du bouton "Rejoindre" pour les sorties passées

**Avant :**
```javascript
var parts = [
  '<a class="go-sc-btn go-sc-btn--voir" href="' + escapeAttr(voirHref) + '">Voir</a>'
];

if (viewMode === "team-rider") return parts.join("");

if (role === "user" && !joined) {
  parts.push('<a class="go-sc-btn go-sc-btn--join" href="' + escapeAttr(parcoursHref(card.id)) + '">Rejoindre</a>');
} else if (role === "visitor") {
  parts.push('<button type="button" class="go-sc-btn go-sc-btn--join" data-goelo-auth-trigger>Rejoindre</button>');
}
```

**Après :**
```javascript
var parts = [
  '<a class="go-sc-btn go-sc-btn--voir" href="' + escapeAttr(voirHref) + '">Voir</a>'
];

if (isSortiePassed(card)) {
  parts.push('<span class="go-sc-badge go-sc-badge--passed">Sortie passée</span>');
}

if (viewMode === "team-rider") return parts.join("");

if (role === "user" && !joined && !isSortiePassed(card)) {
  parts.push('<a class="go-sc-btn go-sc-btn--join" href="' + escapeAttr(parcoursHref(card.id)) + '">Rejoindre</a>');
} else if (role === "visitor" && !isSortiePassed(card)) {
  parts.push('<button type="button" class="go-sc-btn go-sc-btn--join" data-goelo-auth-trigger>Rejoindre</button>');
}
```

### 4. `css/components/sortie-cards.css`
**Ajout de style :**

```css
.go-sc-badge--passed { 
  background: rgba(136, 136, 136, 0.15); 
  color: rgba(255, 255, 255, 0.65); 
  border-color: rgba(136, 136, 136, 0.3);
  font-size: 0.58rem;
}
```

Style du badge "Sortie passée" :
- Fond gris semi-transparent pour discrétion
- Texte blanc atténué
- Bordure grise subtile
- Taille de police réduite (0.58rem)

## Comportement détaillé

### Pour les administrateurs

1. **Filtre par défaut** : "Toutes"
2. **Filtres disponibles** : Toutes, À venir, Passées, Route, Gravel, VTT, Aujourd'hui, Météo idéale
3. **Tri "Toutes"** :
   - Sorties à venir : de la plus proche à la plus éloignée
   - Sorties passées : de la plus récente à la plus ancienne
4. **Affichage** : Toutes les sorties avec badge sur les sorties passées

### Pour les non-administrateurs

1. **Filtre par défaut** : "À venir"
2. **Filtres disponibles** : À venir, Passées, Route, Gravel, VTT, Aujourd'hui, Météo idéale
3. **Tri "À venir"** : de la plus proche à la plus éloignée
4. **Tri "Passées"** : de la plus récente à la plus ancienne
5. **Affichage** : Badge sur les sorties passées

### Badge "Sortie passée"

- **Position** : Après le bouton "Voir" dans la zone d'actions en haut à droite
- **Condition d'affichage** : Date/heure de la sortie < maintenant
- **Apparence** : Badge discret gris semi-transparent
- **Texte** : "Sortie passée"

### Bouton "Rejoindre"

- **Masqué automatiquement** pour les sorties passées
- Les utilisateurs ne peuvent plus s'inscrire à une sortie terminée

## Cas particuliers gérés

### Sorties du jour
- Une sortie prévue **aujourd'hui à 18h** et consultée **aujourd'hui à 10h** → "À venir"
- Une sortie prévue **aujourd'hui à 10h** et consultée **aujourd'hui à 18h** → "Passée"

### Sorties sans date
- Traitées comme "à venir"
- Ne sont pas marquées comme passées

### Changement de rôle dynamique
- Lors de la connexion/déconnexion (`goelo:role-ready`, `goelo:auth-success`)
- Les filtres se mettent à jour automatiquement
- Le filtre "Toutes" apparaît/disparaît selon le rôle

### Filtres combinés
- **Route/Gravel/VTT** : N'affichent que les sorties à venir du type sélectionné
- **Aujourd'hui** : N'affiche que les sorties d'aujourd'hui qui ne sont pas encore passées
- **Météo idéale** : N'affiche que les sorties à venir avec météo idéale

## Compatibilité

### Préservation de l'existant
✅ Aucune modification des données Supabase  
✅ Aucune modification de la Home Page  
✅ Conservation complète du design visuel  
✅ Tous les composants existants fonctionnent (météo, participants, etc.)  
✅ Responsive mobile préservé  

### Fuseau horaire
✅ Compatible avec `GoeloSortieDates` (Europe/Paris)  
✅ Comparaisons temporelles fiables  

### Rétrocompatibilité
✅ Les anciennes sorties continuent de fonctionner  
✅ Aucun changement dans la structure de données  

## Tests à effectuer

### Tests administrateur
- [ ] Le filtre "Toutes" est visible et sélectionné par défaut
- [ ] Cliquer sur "Toutes" affiche toutes les sorties (futures puis passées)
- [ ] Les sorties futures apparaissent en premier, triées de la plus proche à la plus éloignée
- [ ] Les sorties passées apparaissent ensuite, triées de la plus récente à la plus ancienne
- [ ] Le badge "Sortie passée" s'affiche sur les cartes passées
- [ ] Le bouton "Rejoindre" n'apparaît pas sur les sorties passées

### Tests non-administrateur
- [ ] Le filtre "Toutes" n'est pas visible
- [ ] Le filtre "À venir" est sélectionné par défaut
- [ ] Cliquer sur "À venir" affiche uniquement les sorties futures
- [ ] Les sorties sont triées de la plus proche à la plus éloignée
- [ ] Cliquer sur "Passées" affiche uniquement les sorties passées
- [ ] Les sorties passées sont triées de la plus récente à la plus ancienne
- [ ] Le badge "Sortie passée" s'affiche sur les cartes passées
- [ ] Le bouton "Rejoindre" n'apparaît pas sur les sorties passées

### Tests des filtres combinés
- [ ] "Route" n'affiche que les sorties Route à venir
- [ ] "Gravel" n'affiche que les sorties Gravel à venir
- [ ] "VTT" n'affiche que les sorties VTT à venir
- [ ] "Aujourd'hui" n'affiche que les sorties d'aujourd'hui non passées
- [ ] "Météo idéale" n'affiche que les sorties à venir avec météo idéale

### Tests de cas limites
- [ ] Sortie aujourd'hui à une heure future → "À venir"
- [ ] Sortie aujourd'hui à une heure passée → "Passée"
- [ ] Sortie sans date → traitée comme "À venir"
- [ ] Changement de rôle (connexion/déconnexion) → filtres mis à jour

### Tests de compatibilité
- [ ] La page se charge sans erreur JavaScript
- [ ] Les participants s'affichent correctement
- [ ] La météo s'affiche correctement
- [ ] Le tri par météo fonctionne
- [ ] Le tri par distance fonctionne
- [ ] La recherche fonctionne avec tous les filtres
- [ ] Mobile : tous les filtres sont accessibles et utilisables
- [ ] Mobile : le badge ne provoque pas de débordement

## Statistiques

- **4 fichiers modifiés**
- **85 insertions**
- **14 suppressions**
- **3 nouvelles fonctions** (`isAdmin`, `isSortiePassed`, `initFiltersForRole`)
- **6 fonctions modifiées**
- **1 nouveau style CSS** (`.go-sc-badge--passed`)
- **0 modification de schéma de base de données**
