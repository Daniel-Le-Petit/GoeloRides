# Guide de test : Nouveau sondage "Freins à la création de compte"

## Prérequis

1. Avoir accès à la base de données Supabase
2. Avoir les droits d'exécution des migrations
3. Avoir un environnement de test ou de développement disponible

## Étape 1 : Appliquer la migration

### Via Supabase Dashboard

1. Connectez-vous à votre projet Supabase
2. Allez dans l'onglet "SQL Editor"
3. Copiez le contenu de `supabase/migrations/20260818120000_poll_account_creation.sql`
4. Collez-le dans l'éditeur SQL
5. Cliquez sur "Run" pour exécuter la migration

### Via Supabase CLI

```bash
supabase db push
```

### Vérification de la migration

Exécutez cette requête SQL pour vérifier que le sondage a bien été créé :

```sql
SELECT 
  p.id, 
  p.slug, 
  p.question, 
  p.is_active, 
  p.poll_type,
  (SELECT COUNT(*) FROM poll_options WHERE poll_id = p.id) as options_count
FROM polls p
WHERE p.slug = 'freins-creation-compte-v1';
```

**Résultat attendu :**
- 1 ligne retournée
- `is_active` = `true`
- `poll_type` = `single`
- `options_count` = `8`

## Étape 2 : Déployer les changements du frontend

1. Assurez-vous que le fichier `index.html` a été mis à jour avec le nouveau `div` du sondage
2. Déployez les changements sur votre environnement de test

```bash
# Si vous utilisez un serveur de développement local
npm run dev
# ou
python -m http.server 8000
```

3. Ouvrez votre navigateur et accédez à la page d'accueil

## Étape 3 : Tests visuels

### 3.1 Vérifier l'affichage du sondage

✅ **À vérifier :**
- [ ] Le nouveau sondage apparaît en **première position** dans la section des sondages
- [ ] Le titre est : "Qu'est-ce qui vous retient de créer votre compte GoëloRides ?"
- [ ] 8 options sont affichées, chacune sur sa propre ligne
- [ ] Chaque option a un cercle blanc avec contour (⚪)
- [ ] Le texte "👉 Votez pour votre format préféré." ou similaire est affiché
- [ ] L'interface est compacte et élégante

### 3.2 Vérifier la responsivité (mobile)

✅ **À vérifier sur mobile :**
- [ ] Le sondage s'affiche correctement sur écran étroit
- [ ] Les options ne débordent pas
- [ ] Les cercles de sélection sont bien alignés
- [ ] Le texte reste lisible
- [ ] Le sondage est facilement utilisable au doigt

### 3.3 Vérifier l'ordre des sondages

✅ **Ordre attendu :**
1. **Qu'est-ce qui vous retient de créer votre compte GoëloRides ?** ← NOUVEAU
2. Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?
3. Quel jour et quelle heure vous conviennent le mieux pour les sorties GoëloRides ?
4. Qu'est-ce qui vous ferait venir rouler avec nous ?

## Étape 4 : Tests fonctionnels

### 4.1 Test de vote anonyme

1. **Ouvrez la page en mode navigation privée / incognito**
2. Cliquez sur une des options du nouveau sondage
3. ✅ **À vérifier :**
   - [ ] Le cercle de l'option sélectionnée se remplit
   - [ ] Le message change pour afficher "Votre choix : [option sélectionnée]"
   - [ ] Les pourcentages s'affichent pour toutes les options
   - [ ] Le badge "Votre choix" apparaît sur l'option sélectionnée
   - [ ] Les barres de progression s'affichent sous chaque option

4. **Rafraîchissez la page (F5)**
5. ✅ **À vérifier :**
   - [ ] Votre vote est toujours affiché
   - [ ] L'option que vous aviez choisie est toujours marquée comme "Votre choix"

### 4.2 Test de changement de vote

1. **Cliquez sur une autre option**
2. ✅ **À vérifier :**
   - [ ] L'ancienne sélection est désactivée
   - [ ] La nouvelle option devient "Votre choix"
   - [ ] Les pourcentages sont recalculés et mis à jour
   - [ ] Pas de message d'erreur dans la console du navigateur

### 4.3 Test de vote authentifié

1. **Connectez-vous avec un compte GoëloRides**
2. **Votez sur le nouveau sondage**
3. ✅ **À vérifier :**
   - [ ] Le vote fonctionne de la même manière qu'en mode anonyme
   - [ ] Le vote est persistant après déconnexion/reconnexion

### 4.4 Test de calcul des pourcentages

1. **Testez avec plusieurs votes (utilisez plusieurs navigateurs ou modes incognito)**
2. ✅ **À vérifier :**
   - [ ] Les pourcentages sont arrondis à l'entier le plus proche
   - [ ] La somme des pourcentages est proche de 100% (peut varier de quelques points à cause de l'arrondi)
   - [ ] Les pourcentages se mettent à jour en temps réel après chaque vote

## Étape 5 : Tests de non-régression

### 5.1 Vérifier les autres sondages

✅ **Pour chaque sondage existant :**
- [ ] Le sondage "Préférences de sorties" fonctionne toujours
- [ ] Le sondage "Horaires" fonctionne toujours
- [ ] Le sondage "Motivations" (multi-choix) fonctionne toujours
- [ ] Les votes précédents sont toujours enregistrés
- [ ] Les pourcentages s'affichent correctement

### 5.2 Vérifier la console du navigateur

✅ **À vérifier :**
- [ ] Aucune erreur JavaScript
- [ ] Aucune erreur de chargement de ressources
- [ ] Les logs montrent que le sondage se charge correctement

## Étape 6 : Tests de la base de données

### 6.1 Vérifier les votes dans la base

Exécutez cette requête pour voir les votes :

```sql
SELECT 
  pv.id,
  pv.poll_id,
  pv.option_id,
  po.label as option_label,
  pv.voter_key,
  pv.user_id,
  pv.created_at
FROM poll_votes pv
JOIN poll_options po ON po.id = pv.option_id
JOIN polls p ON p.id = pv.poll_id
WHERE p.slug = 'freins-creation-compte-v1'
ORDER BY pv.created_at DESC
LIMIT 10;
```

### 6.2 Vérifier les résultats agrégés

```sql
WITH poll_data AS (
  SELECT id FROM polls WHERE slug = 'freins-creation-compte-v1'
)
SELECT 
  po.label,
  COUNT(pv.id) as vote_count,
  ROUND(100.0 * COUNT(pv.id) / NULLIF((SELECT COUNT(*) FROM poll_votes WHERE poll_id = (SELECT id FROM poll_data)), 0)) as percentage
FROM poll_options po
LEFT JOIN poll_votes pv ON pv.option_id = po.id
WHERE po.poll_id = (SELECT id FROM poll_data)
GROUP BY po.id, po.label, po.sort_order
ORDER BY po.sort_order;
```

## Étape 7 : Tests d'intégration

### 7.1 Test du RPC `poll_get_by_slug`

Dans la console JavaScript du navigateur :

```javascript
// Récupérer le client Supabase
const sb = window.goeloGetSb();

// Appeler le RPC pour charger le sondage
const { data, error } = await sb.rpc('poll_get_by_slug', {
  p_slug: 'freins-creation-compte-v1',
  p_voter_key: localStorage.getItem('goelo_poll_voter_key_v1')
});

console.log('Poll data:', data);
console.log('Error:', error);
```

✅ **Résultat attendu :**
- `data.ok` = `true`
- `data.poll` contient les informations du sondage
- `data.options` contient les 8 options avec leurs pourcentages
- `data.my_option_id` contient votre vote (si vous avez voté)

### 7.2 Test du RPC `poll_vote`

```javascript
const sb = window.goeloGetSb();

// Obtenir l'ID du sondage et d'une option
const pollData = await sb.rpc('poll_get_by_slug', {
  p_slug: 'freins-creation-compte-v1',
  p_voter_key: localStorage.getItem('goelo_poll_voter_key_v1')
});

const pollId = pollData.data.poll.id;
const optionId = pollData.data.options[0].id;

// Voter
const { data, error } = await sb.rpc('poll_vote', {
  p_poll_id: pollId,
  p_option_id: optionId,
  p_voter_key: localStorage.getItem('goelo_poll_voter_key_v1')
});

console.log('Vote result:', data);
console.log('Error:', error);
```

## Checklist finale

✅ **Avant de marquer la PR comme "Ready for review" :**
- [ ] La migration a été appliquée sans erreur
- [ ] Le nouveau sondage apparaît en première position
- [ ] Les 8 options sont toutes affichées correctement
- [ ] Le vote fonctionne (anonyme et authentifié)
- [ ] Le changement de vote fonctionne
- [ ] Les pourcentages se calculent correctement
- [ ] Les autres sondages fonctionnent toujours
- [ ] Pas d'erreur dans la console du navigateur
- [ ] L'interface est responsive (mobile + desktop)
- [ ] Les votes sont bien enregistrés dans la base de données

## Problèmes connus et solutions

### Problème : Le sondage ne s'affiche pas

**Solutions :**
1. Vérifier que la migration a bien été appliquée
2. Vérifier que `is_active = true` dans la table `polls`
3. Vérifier la console JavaScript pour des erreurs
4. Vider le cache du navigateur

### Problème : Les pourcentages ne s'affichent pas

**Solutions :**
1. Vérifier qu'au moins un vote a été enregistré
2. Vérifier les logs de la console pour des erreurs RPC
3. Vérifier que le voter_key est bien généré et stocké

### Problème : Le vote ne fonctionne pas

**Solutions :**
1. Vérifier que le JavaScript `goelo-poll.js` est bien chargé
2. Vérifier que Supabase est initialisé
3. Vérifier les permissions RLS dans la base de données
4. Vérifier la console pour des erreurs

## Contact

Si vous rencontrez des problèmes pendant les tests, n'hésitez pas à :
- Commenter sur la PR
- Consulter les logs de la console
- Vérifier les migrations Supabase précédentes
