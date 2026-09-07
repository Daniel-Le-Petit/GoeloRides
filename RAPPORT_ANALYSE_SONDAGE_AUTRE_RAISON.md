# Rapport d'analyse : Sondage "Autre raison"

## Demande initiale

L'utilisateur souhaite voir **le contenu réel des réponses saisies** par les utilisateurs lorsqu'ils ont choisi "Autre raison" dans le sondage :

> « Qu'est-ce qui vous retient de créer votre compte GoëloRides ? »

Actuellement visible dans l'admin :
- ⚪ **Autre raison : 67 %**
- Je découvre encore GoëloRides : 33 %

---

## 1. Structure de la base de données

### Tables identifiées

#### Table `polls`
Contient les sondages avec les champs :
- `id` (UUID)
- `slug` (TEXT) - identifiant unique du sondage
- `question` (TEXT)
- `is_active` (BOOLEAN)
- `poll_type` (TEXT) - valeurs : `'single'` ou `'multi'`
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Table `poll_options`
Contient les options de réponse :
- `id` (UUID)
- `poll_id` (UUID) - référence vers `polls`
- `label` (TEXT) - ex: "Autre raison"
- `subtitle` (TEXT)
- `emoji` (TEXT)
- `level_key` (TEXT) - ex: 'other', 'discovering'
- `sort_order` (SMALLINT)

#### Table `poll_votes` (pour sondages type 'single')
Stocke les votes pour les sondages à **choix unique** :
- `id` (UUID)
- `poll_id` (UUID)
- `option_id` (UUID) - l'option choisie
- `user_id` (UUID) - si utilisateur connecté
- `voter_key` (TEXT) - si utilisateur anonyme
- `created_at` (TIMESTAMPTZ)

⚠️ **Aucun champ pour du texte libre dans `poll_votes`**

#### Table `poll_multi_responses` (pour sondages type 'multi')
Stocke les réponses pour les sondages à **choix multiples** :
- `id` (UUID)
- `poll_id` (UUID)
- `user_id` (UUID)
- `voter_key` (TEXT)
- **`free_text` (TEXT)** ✅ Champ pour texte libre (max 500 caractères)
- `created_at`, `updated_at` (TIMESTAMPTZ)

---

## 2. Configuration du sondage concerné

### Fichier de migration
**`supabase/migrations/20260818120000_poll_account_creation.sql`**

### Caractéristiques du sondage

```sql
INSERT INTO public.polls (slug, question, is_active, poll_type)
VALUES (
  'freins-creation-compte-v1',
  'Qu''est-ce qui vous retient de créer votre compte GoëloRides ?',
  true,
  'single'  -- ❌ SONDAGE À CHOIX UNIQUE
)
```

### Options disponibles

| sort_order | label | level_key |
|------------|-------|-----------|
| 0 | Je découvre encore GoëloRides | discovering |
| 1 | Je préfère simplement suivre les sorties | just-follow |
| 2 | Je ne vois pas encore l'intérêt de créer un compte | no-interest |
| 3 | Je manque de temps | no-time |
| 4 | Je ne savais pas comment faire | dont-know-how |
| 5 | Je préfère m'inscrire autrement | other-way |
| 6 | Je ne suis pas encore prêt(e) à participer | not-ready |
| 7 | **Autre raison** | **other** |

---

## 3. Diagnostic : Le problème

### ❌ Impossibilité de récupérer du texte libre

Le sondage est configuré avec `poll_type = 'single'`, ce qui signifie :

1. ✅ Les utilisateurs peuvent **sélectionner** l'option "Autre raison"
2. ❌ Les utilisateurs **ne peuvent PAS saisir** de texte expliquant leur "autre raison"
3. ❌ La base de données **ne stocke PAS** de texte libre pour les sondages single-choice

### Structure actuelle des votes

```
Table: poll_votes
┌─────────────┬──────────┬───────────┬──────────┬───────────────┬────────────┐
│ id          │ poll_id  │ option_id │ user_id  │ voter_key     │ created_at │
├─────────────┼──────────┼───────────┼──────────┼───────────────┼────────────┤
│ uuid-123... │ poll-abc │ opt-other │ user-x   │ null          │ 2026-09-01 │
│ uuid-456... │ poll-abc │ opt-other │ null     │ anon-key-123  │ 2026-09-02 │
└─────────────┴──────────┴───────────┴──────────┴───────────────┴────────────┘
                                       ↑
                            On sait QUE l'utilisateur a choisi "Autre raison"
                            mais PAS POURQUOI (pas de champ free_text)
```

---

## 4. Solution proposée

Pour capturer les raisons textuelles personnalisées, il existe **3 approches** :

### Option A : Convertir le sondage en type 'multi' (RECOMMANDÉ)

**Avantages :**
- ✅ Utilise l'infrastructure existante (`poll_multi_responses.free_text`)
- ✅ Champ `free_text` de 500 caractères déjà prévu
- ✅ Fonction admin `poll_multi_admin_results()` déjà disponible pour récupérer les textes

**Migration SQL nécessaire :**

```sql
-- 1. Convertir le poll en type 'multi'
UPDATE public.polls
SET poll_type = 'multi'
WHERE slug = 'freins-creation-compte-v1';

-- 2. Migrer les votes existants vers poll_multi_responses
INSERT INTO public.poll_multi_responses (poll_id, user_id, voter_key, free_text, created_at)
SELECT 
  pv.poll_id,
  pv.user_id,
  pv.voter_key,
  '', -- Les anciens votes n'ont pas de free_text
  pv.created_at
FROM public.poll_votes pv
WHERE pv.poll_id = (
  SELECT id FROM public.polls WHERE slug = 'freins-creation-compte-v1'
)
ON CONFLICT DO NOTHING;

-- 3. Créer les liens options pour les votes migrés
INSERT INTO public.poll_multi_response_options (response_id, option_id)
SELECT 
  pmr.id,
  pv.option_id
FROM public.poll_votes pv
JOIN public.poll_multi_responses pmr 
  ON pv.poll_id = pmr.poll_id
  AND (pv.user_id = pmr.user_id OR pv.voter_key = pmr.voter_key)
WHERE pv.poll_id = (
  SELECT id FROM public.polls WHERE slug = 'freins-creation-compte-v1'
)
ON CONFLICT DO NOTHING;

-- 4. Supprimer les anciens votes
DELETE FROM public.poll_votes
WHERE poll_id = (
  SELECT id FROM public.polls WHERE slug = 'freins-creation-compte-v1'
);
```

**Frontend à adapter :**
- Modifier le composant du sondage pour permettre plusieurs choix
- Ajouter un champ texte qui s'affiche quand "Autre raison" est coché
- Utiliser la fonction `poll_multi_submit()` au lieu de `poll_vote()`

### Option B : Ajouter un champ free_text à poll_votes

**Avantages :**
- ✅ Garde le type 'single'
- ✅ Moins de changements frontend

**Inconvénients :**
- ❌ Nécessite des modifications SQL étendues
- ❌ Duplication de logique (free_text dans 2 tables)

**Migration SQL :**

```sql
-- Ajouter le champ free_text
ALTER TABLE public.poll_votes
ADD COLUMN IF NOT EXISTS free_text TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT poll_votes_free_text_len CHECK (length(free_text) <= 500);

-- Modifier la fonction poll_vote() pour accepter le paramètre free_text
-- [Code de la fonction à modifier]

-- Modifier poll_admin_results() pour inclure les free_texts
-- [Code de la fonction à modifier]
```

### Option C : Créer un nouveau sondage multi depuis le début

**Si vous préférez repartir de zéro :**
- Désactiver le sondage actuel
- Créer un nouveau sondage avec `poll_type = 'multi'`
- Inconvénient : perte des votes précédents

---

## 5. Récupération des données actuelles

### Requête pour voir les votes "Autre raison" (sans texte)

```javascript
// Via RPC admin (nécessite authentification admin)
const { data } = await supabase.rpc('poll_admin_list');

// Trouver le poll
const poll = data.polls.find(p => p.slug === 'freins-creation-compte-v1');

// Trouver l'option "Autre raison"
const autreOption = poll.options.find(o => o.level_key === 'other');

console.log(`Nombre de votes pour "Autre raison": ${autreOption.votes}`);
// Résultat : nombre de votes, mais AUCUN texte libre
```

### Ce qu'on peut voir actuellement

Pour chaque vote "Autre raison" on a :
- ✅ Le nombre total de votes (2 sur 3 = 67% selon votre admin)
- ✅ La date du vote (`created_at`)
- ✅ Si c'est un utilisateur connecté ou anonyme
- ❌ **RIEN sur la raison spécifique** car le champ n'existe pas

---

## 6. Recommandation finale

### ✅ Solution recommandée : Option A (Convertir en type 'multi')

**Pourquoi ?**
1. Infrastructure déjà prête
2. Fonction admin déjà codée
3. Permet de collecter les vraies raisons des utilisateurs

**Prochaines étapes :**

1. **Créer la migration** `/workspace/supabase/migrations/YYYYMMDD_convert_poll_to_multi.sql`
2. **Exécuter la migration** sur la base de données Supabase
3. **Adapter le frontend** pour :
   - Afficher un champ texte quand "Autre raison" est coché
   - Soumettre via `poll_multi_submit(poll_id, [option_ids], free_text, voter_key)`
4. **Utiliser** `poll_multi_admin_results(poll_id)` dans l'admin pour voir les textes

### Après la migration

L'admin pourra appeler :

```javascript
const { data } = await supabase.rpc('poll_multi_admin_results', {
  p_poll_id: '<poll-uuid>'
});

// data.free_texts = [
//   { id: '...', text: 'Je préfère attendre la nouvelle version', created_at: '...' },
//   { id: '...', text: 'Trop compliqué pour le moment', created_at: '...' },
//   ...
// ]
```

---

## Conclusion

**Réponse à la demande initiale :**

> « Je veux que tu me montres le contenu réel des réponses saisies par les utilisateurs lorsqu'ils ont choisi "Autre raison". »

**Résultat de l'analyse :**

❌ **Il n'y a PAS de contenu textuel à montrer** car :
1. Le sondage est de type 'single' (choix unique)
2. La table `poll_votes` ne contient **aucun champ de texte libre**
3. Les utilisateurs ont pu **sélectionner** "Autre raison" mais **pas saisir** de texte

**Ce que nous savons :**
- ✅ 2 utilisateurs (67%) ont voté pour "Autre raison"
- ❌ Aucun détail sur leurs raisons spécifiques

**Pour collecter ces raisons à l'avenir :**
→ Appliquer la **migration vers type 'multi'** (voir Option A ci-dessus)

---

## Fichiers concernés

- `/workspace/supabase/migrations/20260818120000_poll_account_creation.sql` - Migration du sondage
- `/workspace/supabase/migrations/20260731120000_site_polls.sql` - Structure polls single
- `/workspace/supabase/migrations/20260801170000_poll_multi_motivations.sql` - Structure polls multi
- `/workspace/js/goelo-admin-polls.js` - Interface admin
- `/workspace/admin-sondages.html` - Page admin sondages

---

**Date du rapport :** 2026-09-07  
**Analyste :** Cloud Agent - GoëloRides
