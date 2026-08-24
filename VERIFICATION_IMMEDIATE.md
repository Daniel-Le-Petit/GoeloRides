# ⚠️ VÉRIFICATION IMMÉDIATE - Votes disparus

## 🚨 RÈGLE ABSOLUE : NE PAS MODIFIER LES DONNÉES

**Ce document est pour diagnostiquer UNIQUEMENT. Aucune modification ne sera faite sans votre validation explicite.**

---

## Étape 1 : Exécuter le diagnostic SQL

### Sur Supabase Dashboard :

1. Ouvrez l'onglet **SQL Editor**
2. Copiez TOUT le contenu de `DIAGNOSTIC_VOTES.sql`
3. Exécutez-le
4. **COPIEZ TOUS LES RÉSULTATS** et partagez-les

**Ce qu'on cherche :**
- Les sondages existants sont-ils toujours en base ?
- Leurs IDs sont-ils les mêmes ?
- Les votes sont-ils toujours présents ?
- Y a-t-il des votes orphelins ?
- Les sondages existants sont-ils marqués `is_active = true` ?

---

## Étape 2 : Vérifier la console navigateur

1. Ouvrez la page d'accueil en **mode navigation privée** (pour éviter le cache)
2. Ouvrez la **Console** (F12 → Console)
3. Cherchez les logs `[GoëloPoll]`
4. **Copiez tous les messages** de la console

**Ce qu'on cherche :**
- Est-ce que `GoeloPoll.initAll` est appelé ?
- Combien de sondages sont initialisés ?
- Y a-t-il des erreurs RPC ?
- Les slugs correspondent-ils ?

**Exemple de ce que vous devriez voir :**
```
[GoëloPoll] init OK gr-poll-account-root freins-creation-compte-v1
[GoëloPoll] init OK gr-poll-root preferences-sorties-v1
[GoëloPoll] init OK gr-poll-schedule-root preferences-horaire-v1
[GoëloPoll] load {poll_id: "...", slug: "preferences-sorties-v1", ...}
```

---

## Étape 3 : Vérifier les migrations appliquées

### Via Supabase Dashboard :

```sql
-- Liste des migrations appliquées
SELECT * FROM supabase_migrations.schema_migrations
WHERE version LIKE '202607%' OR version LIKE '202608%'
ORDER BY version DESC;
```

**Migrations critiques à vérifier :**
- ✅ `20260731120000_site_polls.sql` (création des tables polls)
- ✅ `20260731143000_poll_options_distances_v2.sql` (mise à jour options)
- ✅ `20260731160000_poll_vote_allow_update.sql` (fonction poll_vote)
- ✅ `20260801120000_poll_multi_active_schedule.sql` (fonction poll_get_by_slug + plusieurs actifs)
- ✅ `20260801170000_poll_multi_motivations.sql` (sondage multi-choix)
- ❓ `20260818120000_poll_account_creation.sql` (nouveau sondage)

**Si `20260801120000_poll_multi_active_schedule.sql` n'est PAS appliquée :**
→ C'est probablement la cause ! Cette migration est ESSENTIELLE pour charger plusieurs sondages en parallèle.

---

## Étape 4 : Requêtes de diagnostic rapide

### 4.1 Combien de sondages actifs ?

```sql
SELECT slug, question, is_active, poll_type, 
       (SELECT COUNT(*) FROM poll_votes WHERE poll_id = polls.id) as votes_count
FROM polls
WHERE is_active = true
ORDER BY created_at;
```

**Attendu :** Vous devriez voir au moins 3-4 sondages actifs avec des votes.

### 4.2 Les votes du sondage "préférences sorties" sont-ils là ?

```sql
SELECT 
  po.label,
  COUNT(pv.id) as vote_count
FROM polls p
JOIN poll_options po ON po.poll_id = p.id
LEFT JOIN poll_votes pv ON pv.option_id = po.id
WHERE p.slug = 'preferences-sorties-v1'
GROUP BY po.id, po.label, po.sort_order
ORDER BY po.sort_order;
```

**Si vous voyez des votes :** Les données sont là ! Le problème est dans le chargement UI.

**Si aucun vote :** Les données ont été perdues (mais je doute fort, vu ma migration).

### 4.3 Test de la fonction RPC directement

```sql
-- Tester poll_get_by_slug (devrait renvoyer les résultats)
SELECT public.poll_get_by_slug('preferences-sorties-v1', NULL);

-- Si erreur "function does not exist" → la migration 20260801120000 n'est pas appliquée !
```

---

## Étape 5 : Vérifier le localStorage du navigateur

1. Console → Application → Local Storage → votre domaine
2. Cherchez les clés commençant par `goelo_poll_`
3. Notez les valeurs de :
   - `goelo_poll_voter_key_v1`
   - `goelo_poll_voted_` (avec l'ID du sondage)

---

## 📊 Résultats attendus

### ✅ Si tout va bien :

- Les anciens sondages existent en base avec `is_active = true`
- Les votes sont toujours associés aux bonnes options
- La fonction `poll_get_by_slug` existe
- Les logs JavaScript montrent que tous les sondages se chargent
- Les pourcentages correspondent aux votes en base

### ⚠️ Si problème identifié :

**Scénario A : Migration manquante**
→ Appliquer `20260801120000_poll_multi_active_schedule.sql`

**Scénario B : Sondages désactivés**
→ Script SQL de réactivation (SANS toucher aux votes)

**Scénario C : Problème de chargement JavaScript**
→ Vérifier les slugs dans le HTML vs base de données

**Scénario D : Votes orphelins**
→ Identifier pourquoi les relations ont été cassées

---

## 🆘 Une fois le diagnostic fait

**Partagez-moi :**
1. Les résultats du script `DIAGNOSTIC_VOTES.sql`
2. Les logs de la console JavaScript
3. Le résultat de la requête sur les migrations appliquées
4. Les résultats des 3 requêtes de diagnostic rapide

**Je pourrai alors :**
- Identifier précisément la cause
- Proposer une solution de restauration SANS PERTE DE DONNÉES
- Vérifier que tous les votes historiques sont intacts

---

## ⚠️ CE QU'IL NE FAUT SURTOUT PAS FAIRE

❌ **NE PAS** exécuter `DELETE` ou `TRUNCATE` sur les tables polls/poll_votes
❌ **NE PAS** recréer les sondages existants avec de nouveaux IDs
❌ **NE PAS** modifier les IDs des votes existants
❌ **NE PAS** appliquer de migration "correctif" avant le diagnostic
❌ **NE PAS** vider le cache ou localStorage avant d'avoir noté les valeurs

---

## ✅ Actions immédiates recommandées

1. **Exécutez `DIAGNOSTIC_VOTES.sql`** → Partagez les résultats
2. **Vérifiez la console JavaScript** → Partagez les logs
3. **Attendez mon analyse** avant toute modification

Les votes sont probablement toujours là. On va les retrouver ensemble.
