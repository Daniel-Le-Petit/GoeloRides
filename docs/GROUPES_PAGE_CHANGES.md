# Modifications de la page Groupes - GoëloRides

## Résumé

La page Groupes a été simplifiée pour rendre les 4 niveaux plus accessibles et immédiatement compréhensibles par un nouveau cycliste.

## Objectif

Permettre à un nouveau visiteur d'identifier son groupe en quelques secondes avec un message clair :
> « Je pense que mon niveau est celui-ci. »

## Nouveaux niveaux

### ⚪ GROUPE BLANC – Découverte
- **Distance** : 15–30 km
- **Dénivelé** : D+ < 220 m
- **Profil** : Sortie tranquille, idéale pour découvrir GoëloRides ou reprendre progressivement
- **Message** : Accessible et sans pression

### 🟢 GROUPE VERT – Intermédiaire
- **Distance** : 30–50 km
- **Dénivelé** : D+ < 400 m
- **Profil** : Cycliste régulier capable de rouler 30 à 50 km sur un parcours vallonné modéré
- **Message** : Le bon équilibre entre distance et plaisir

### 🔵 GROUPE BLEU – Confirmé
- **Distance** : 60–70 km
- **Dénivelé** : D+ < 600 m
- **Profil** : Cycliste habitué aux sorties plus longues et aux parcours vallonnés
- **Message** : Pour les cyclistes à l'aise sur les longues sorties

### 🔴 GROUPE ROUGE – Expert
- **Distance** : > 70 km
- **Dénivelé** : > 600 m D+
- **Profil** : Cycliste expérimenté, à l'aise avec les longues distances et un dénivelé important
- **Message** : Pour les sorties longues et exigeantes

## Changements dans le code

### Fichiers modifiés

1. **`groupes.html`**
   - Nouveau titre : "Quel groupe est fait pour vous ?"
   - Texte introductif rassurant
   - Structure de carte simplifiée : emoji + nom + niveau + distance/D+ + description
   - Section rassurante en bas : "Vous hésitez entre deux groupes ?"

2. **`css/pages/groupes.css`**
   - Mise à jour des couleurs (bleu et rouge plus vifs)
   - Nouveau style pour les emojis et métriques
   - Responsive mobile-first amélioré avec breakpoints à 320px, 375px, 560px, 768px, 900px
   - Nouveau style pour la section rassurante

3. **`js/goelo-levels.js`**
   - Mise à jour de toutes les définitions de niveaux
   - Nouveau emoji pour Blanc : ⚪ (au lieu de 🟢)
   - Nouveau emoji pour Vert : 🟢 (au lieu de 🔵)
   - Nouveau emoji pour Bleu : 🔵 (au lieu de 🟣)
   - Emoji Rouge reste : 🔴
   - Mise à jour des distances, D+, et labels

## Identité visuelle préservée

✅ Fond anthracite (#0D0D0D)  
✅ Accent vert acidulé (#C8F135)  
✅ Typographies : Barlow Condensed + Inter  
✅ Design sportif, moderne et épuré  

## Validation responsive

Tous les tests ont été effectués et validés :

### Mobile (320px - 560px)
- ✅ Aucun scroll horizontal
- ✅ Aucune information coupée
- ✅ Les 4 groupes sont faciles à comparer
- ✅ Distance et D+ immédiatement visibles
- ✅ Aucune carte écrasée
- ✅ Texte lisible
- ✅ Boutons/zones interactives utilisables

### Tablette (768px - 900px)
- ✅ Grille équilibrée
- ✅ Aucun débordement
- ✅ Cartes correctement dimensionnées
- ✅ Bonne lisibilité

### Desktop (≥ 1024px)
- ✅ Contenu centré
- ✅ Largeur maîtrisée
- ✅ Cartes équilibrées (4 colonnes)
- ✅ Hiérarchie visuelle conservée

## Screenshots

Les captures d'écran de validation sont disponibles dans `docs/screenshots/` :
- `groupes-320px.webp` - iPhone SE
- `groupes-375px.webp` - iPhone X/12/13
- `groupes-768px.webp` - iPad/Tablette
- `groupes-1440px.webp` - Desktop

## Impact sur le reste du site

Les autres fichiers qui utilisent `GoeloLevels` (sondages, polls, etc.) récupèrent automatiquement les nouvelles valeurs via `GoeloLevels.pollOptionPresets()`.

Aucune modification n'a été apportée à :
- La logique métier
- Supabase
- L'authentification
- Les participations
- Les sorties

## Comparaison avant/après

### Avant
- Groupe Blanc : 25-40 km, < 700m D+
- Groupe Vert : 40-60 km, 700-1200m D+
- Groupe Bleu : 55-75 km, 1200-1800m D+
- Groupe Rouge : 75 km+, 1800m D+ et +

### Après
- Groupe Blanc : 15-30 km, < 220m D+
- Groupe Vert : 30-50 km, < 400m D+
- Groupe Bleu : 60-70 km, < 600m D+
- Groupe Rouge : > 70 km, > 600m D+

Les nouveaux seuils sont **plus progressifs** et **plus accessibles** pour les cyclistes débutants et intermédiaires.
