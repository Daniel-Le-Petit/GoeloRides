# Schéma Supabase : Tables des sondages

## Vue d'ensemble

Le système de sondages GoëloRides utilise **4 tables principales** :

```
polls ──┬──> poll_options
        │
        ├──> poll_votes (type: 'single')
        │
        └──> poll_multi_responses ──> poll_multi_response_options
             (type: 'multi')
```

---

## 📋 Table : `polls`

Contient les définitions des sondages.

| Colonne | Type | Description | Contraintes |
|---------|------|-------------|-------------|
| `id` | UUID | Identifiant unique | PRIMARY KEY |
| `slug` | TEXT | Identifiant textuel unique | UNIQUE, 2-80 chars |
| `question` | TEXT | La question du sondage | NOT NULL, 3-300 chars |
| `poll_type` | TEXT | Type de sondage | `'single'` ou `'multi'` |
| `is_active` | BOOLEAN | Sondage actif ? | NOT NULL, default: false |
| `created_at` | TIMESTAMPTZ | Date de création | NOT NULL |
| `updated_at` | TIMESTAMPTZ | Date de modification | NOT NULL |

### Contraintes spéciales

- **Un seul sondage actif** à la fois (index unique sur `is_active = true`)
- Le `slug` doit être unique s'il est défini

### Exemple

```sql
INSERT INTO polls (slug, question, poll_type, is_active)
VALUES (
  'freins-creation-compte-v1',
  'Qu''est-ce qui vous retient de créer votre compte GoëloRides ?',
  'single',
  true
);
```

---

## 🔘 Table : `poll_options`

Contient les options de réponse pour chaque sondage.

| Colonne | Type | Description | Contraintes |
|---------|------|-------------|-------------|
| `id` | UUID | Identifiant unique | PRIMARY KEY |
| `poll_id` | UUID | Référence vers `polls` | FOREIGN KEY, CASCADE DELETE |
| `label` | TEXT | Libellé de l'option | NOT NULL, 1-120 chars |
| `subtitle` | TEXT | Sous-titre (optionnel) | Max 200 chars |
| `emoji` | TEXT | Emoji affiché | Default: '' |
| `level_key` | TEXT | Clé d'identification | Ex: 'other', 'discovering' |
| `sort_order` | SMALLINT | Ordre d'affichage | NOT NULL, default: 0 |
| `created_at` | TIMESTAMPTZ | Date de création | NOT NULL |

### Index

- `(poll_id, sort_order)` pour un tri rapide

### Exemple

```sql
INSERT INTO poll_options (poll_id, label, emoji, level_key, sort_order)
VALUES
  ('poll-uuid', 'Je découvre encore GoëloRides', '⚪', 'discovering', 0),
  ('poll-uuid', 'Autre raison', '⚪', 'other', 7);
```

---

## ✅ Table : `poll_votes` (sondages single-choice)

Stocke les votes pour les sondages de type **`'single'`** (un seul choix possible).

| Colonne | Type | Description | Contraintes |
|---------|------|-------------|-------------|
| `id` | UUID | Identifiant unique | PRIMARY KEY |
| `poll_id` | UUID | Référence vers `polls` | FOREIGN KEY, CASCADE DELETE |
| `option_id` | UUID | Option choisie | FOREIGN KEY vers `poll_options` |
| `user_id` | UUID | Utilisateur connecté | FOREIGN KEY vers `auth.users`, nullable |
| `voter_key` | TEXT | Clé anonyme | 16-80 chars, nullable |
| `created_at` | TIMESTAMPTZ | Date du vote | NOT NULL |

### Contraintes d'identité

**Un vote par identité** (user_id OU voter_key, pas les deux) :

```sql
-- Un seul vote par utilisateur connecté
UNIQUE INDEX ON (poll_id, user_id) WHERE user_id IS NOT NULL

-- Un seul vote par clé anonyme
UNIQUE INDEX ON (poll_id, voter_key) WHERE voter_key IS NOT NULL
```

### ⚠️ Limitation

**Aucun champ pour du texte libre** dans cette table.

Les votes enregistrent uniquement :
- ✅ Quelle option a été choisie
- ✅ Qui a voté (user_id ou voter_key)
- ✅ Quand

Mais **PAS** :
- ❌ De texte libre expliquant le choix

### Exemple

```sql
-- Vote utilisateur connecté
INSERT INTO poll_votes (poll_id, option_id, user_id)
VALUES ('poll-uuid', 'option-autre-uuid', 'user-abc-uuid');

-- Vote anonyme
INSERT INTO poll_votes (poll_id, option_id, voter_key)
VALUES ('poll-uuid', 'option-autre-uuid', 'anon-key-12345678901234567890');
```

---

## ☑️ Table : `poll_multi_responses` (sondages multi-choice)

Stocke les réponses pour les sondages de type **`'multi'`** (plusieurs choix + texte libre).

| Colonne | Type | Description | Contraintes |
|---------|------|-------------|-------------|
| `id` | UUID | Identifiant unique | PRIMARY KEY |
| `poll_id` | UUID | Référence vers `polls` | FOREIGN KEY, CASCADE DELETE |
| `user_id` | UUID | Utilisateur connecté | FOREIGN KEY vers `auth.users`, nullable |
| `voter_key` | TEXT | Clé anonyme | 16-80 chars, nullable |
| **`free_text`** | **TEXT** | **Texte libre saisi** | **Max 500 chars** ⭐ |
| `created_at` | TIMESTAMPTZ | Date de création | NOT NULL |
| `updated_at` | TIMESTAMPTZ | Date de modification | NOT NULL |

### Contraintes d'identité

```sql
-- Une seule réponse par utilisateur connecté
UNIQUE INDEX ON (poll_id, user_id) WHERE user_id IS NOT NULL

-- Une seule réponse par clé anonyme
UNIQUE INDEX ON (poll_id, voter_key) WHERE voter_key IS NOT NULL
```

### ✅ Avantage

**Cette table POSSÈDE un champ `free_text`** pour stocker du texte libre !

### Exemple

```sql
INSERT INTO poll_multi_responses (poll_id, user_id, free_text)
VALUES (
  'poll-uuid',
  'user-abc-uuid',
  'Je préfère attendre d''avoir plus de retours avant de m''inscrire'
);
```

---

## 🔗 Table : `poll_multi_response_options`

Table de liaison entre les réponses multi et les options cochées.

| Colonne | Type | Description | Contraintes |
|---------|------|-------------|-------------|
| `response_id` | UUID | Référence vers `poll_multi_responses` | FOREIGN KEY, CASCADE DELETE |
| `option_id` | UUID | Option cochée | FOREIGN KEY vers `poll_options` |

### Clé primaire composée

```sql
PRIMARY KEY (response_id, option_id)
```

Une même réponse peut avoir **plusieurs options cochées**.

### Exemple

```sql
-- Un utilisateur coche 3 options pour une réponse
INSERT INTO poll_multi_response_options (response_id, option_id)
VALUES
  ('response-123', 'option-a'),
  ('response-123', 'option-b'),
  ('response-123', 'option-autre');
```

---

## 🔍 Analyse du sondage "freins-creation-compte-v1"

### Configuration actuelle

```sql
-- polls
id: <uuid>
slug: 'freins-creation-compte-v1'
question: 'Qu''est-ce qui vous retient de créer votre compte GoëloRides ?'
poll_type: 'single' ⚠️
is_active: true
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
| **7** | **Autre raison** | **other** |

### Votes actuels (supposés)

**Table utilisée :** `poll_votes` (car `poll_type = 'single'`)

```sql
SELECT 
  po.label,
  COUNT(*) as votes,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id)) as percent
FROM polls p
JOIN poll_options po ON po.poll_id = p.id
LEFT JOIN poll_votes pv ON pv.option_id = po.id
WHERE p.slug = 'freins-creation-compte-v1'
GROUP BY po.label, po.sort_order
ORDER BY po.sort_order;

-- Résultat (d'après l'admin) :
-- | label                           | votes | percent |
-- |---------------------------------|-------|---------|
-- | Je découvre encore GoëloRides   |   1   |   33%   |
-- | Autre raison                    |   2   |   67%   |
```

### ❌ Problème

Les 2 votes pour "Autre raison" sont dans `poll_votes`.

**Cette table n'a pas de colonne `free_text`.**

→ Impossible de savoir **pourquoi** ils ont choisi "Autre raison".

---

## 🛠️ Solution : Conversion vers type 'multi'

### Étape 1 : Changer poll_type

```sql
UPDATE polls
SET poll_type = 'multi'
WHERE slug = 'freins-creation-compte-v1';
```

### Étape 2 : Migrer les votes

```sql
-- 1. Créer les réponses multi (sans texte pour l'instant)
INSERT INTO poll_multi_responses (poll_id, user_id, voter_key, free_text, created_at)
SELECT poll_id, user_id, voter_key, '', created_at
FROM poll_votes
WHERE poll_id = (SELECT id FROM polls WHERE slug = 'freins-creation-compte-v1');

-- 2. Lier les options
INSERT INTO poll_multi_response_options (response_id, option_id)
SELECT pmr.id, pv.option_id
FROM poll_votes pv
JOIN poll_multi_responses pmr 
  ON pv.poll_id = pmr.poll_id
  AND (pv.user_id = pmr.user_id OR pv.voter_key = pmr.voter_key)
WHERE pv.poll_id = (SELECT id FROM polls WHERE slug = 'freins-creation-compte-v1');

-- 3. Supprimer les anciens votes
DELETE FROM poll_votes
WHERE poll_id = (SELECT id FROM polls WHERE slug = 'freins-creation-compte-v1');
```

### Après migration

**Nouvelle structure :**

```sql
-- Réponse 1
poll_multi_responses:
  id: response-1
  poll_id: poll-uuid
  user_id: user-abc
  free_text: '' -- vide car vote ancien
  
poll_multi_response_options:
  response_id: response-1
  option_id: option-autre-uuid

-- Réponse 2
poll_multi_responses:
  id: response-2
  poll_id: poll-uuid
  user_id: user-def
  free_text: '' -- vide car vote ancien

poll_multi_response_options:
  response_id: response-2
  option_id: option-autre-uuid
```

### Nouveaux votes (après migration + frontend adapté)

```sql
-- Un utilisateur vote "Autre raison" + texte libre
INSERT INTO poll_multi_responses (poll_id, user_id, free_text)
VALUES (
  'poll-uuid',
  'user-xyz',
  'Je préfère attendre la nouvelle version de l''application'
);

INSERT INTO poll_multi_response_options (response_id, option_id)
VALUES ('response-3', 'option-autre-uuid');

-- ✅ Maintenant on a le TEXTE !
```

---

## 📊 Requêtes utiles

### Lister tous les sondages

```sql
SELECT id, slug, question, poll_type, is_active
FROM polls
ORDER BY created_at DESC;
```

### Compter les votes par option (single)

```sql
SELECT 
  po.label,
  COUNT(pv.id) as votes
FROM poll_options po
LEFT JOIN poll_votes pv ON pv.option_id = po.id
WHERE po.poll_id = '<poll-uuid>'
GROUP BY po.id, po.label, po.sort_order
ORDER BY po.sort_order;
```

### Récupérer les textes libres (multi)

```sql
SELECT 
  pmr.free_text,
  pmr.created_at,
  ARRAY_AGG(po.label) as options_choisies
FROM poll_multi_responses pmr
JOIN poll_multi_response_options pmro ON pmro.response_id = pmr.id
JOIN poll_options po ON po.id = pmro.option_id
WHERE pmr.poll_id = '<poll-uuid>'
  AND LENGTH(TRIM(pmr.free_text)) > 0
GROUP BY pmr.id, pmr.free_text, pmr.created_at
ORDER BY pmr.created_at DESC;
```

### Filtrer uniquement les réponses "Autre raison" avec texte

```sql
SELECT 
  pmr.free_text,
  pmr.created_at
FROM poll_multi_responses pmr
JOIN poll_multi_response_options pmro ON pmro.response_id = pmr.id
JOIN poll_options po ON po.id = pmro.option_id
WHERE pmr.poll_id = '<poll-uuid>'
  AND po.level_key = 'other'
  AND LENGTH(TRIM(pmr.free_text)) > 0
ORDER BY pmr.created_at DESC;
```

---

## 🎯 Résumé

| Type de sondage | Table de votes | Champ texte libre |
|----------------|----------------|-------------------|
| `'single'` | `poll_votes` | ❌ Aucun |
| `'multi'` | `poll_multi_responses` | ✅ `free_text` (500 chars) |

**Pour le sondage "freins-creation-compte-v1" :**

- ❌ Actuellement en mode `'single'` → pas de texte libre
- ✅ À migrer vers `'multi'` → texte libre disponible

---

## 📁 Fichiers sources

- `/workspace/supabase/migrations/20260731120000_site_polls.sql` - Structure polls single
- `/workspace/supabase/migrations/20260801170000_poll_multi_motivations.sql` - Structure polls multi
- `/workspace/supabase/migrations/20260818120000_poll_account_creation.sql` - Création du sondage
- `/workspace/supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql` - Migration vers multi

---

**Date :** 2026-09-07  
**Source :** Analyse Cloud Agent GoëloRides
