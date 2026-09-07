# 📊 Sondage "Autre raison" - Récapitulatif

## ❓ Ta question

> **« Je veux voir le contenu réel des réponses "Autre raison" du sondage dans l'admin GoëloRides »**

---

## 💥 La réponse courte

**Il n'y a pas de texte à te montrer.**

Les utilisateurs ont pu **sélectionner** "Autre raison", mais **pas écrire de texte**.

---

## 🔍 Pourquoi ?

### Structure actuelle du sondage

```
Sondage: "Qu'est-ce qui vous retient de créer votre compte ?"
Type: 'single' (choix unique)
Table utilisée: poll_votes

┌─────────────────────────────────────────────┐
│ Table: poll_votes                           │
├─────────────┬──────────┬───────────────────┤
│ id          │ poll_id  │ option_id         │
│ uuid-1      │ poll-x   │ opt-autre ◄──┐    │
│ uuid-2      │ poll-x   │ opt-autre    │    │
└─────────────┴──────────┴──────────────┴────┘
                                         │
                                         └─ "Autre raison"
                                            mais AUCUN texte
```

### Ce que la base contient

| ✅ On sait | ❌ On ne sait pas |
|-----------|------------------|
| 2 personnes ont voté "Autre raison" | Quelle est leur raison spécifique |
| Quand elles ont voté | Pourquoi elles ont choisi cette option |
| Si c'étaient des users connectés ou anonymes | Aucun détail textuel |

---

## 📋 Tables identifiées dans Supabase

### 1. Table `polls`
Contient la définition du sondage :
- **Slug** : `'freins-creation-compte-v1'`
- **Question** : "Qu'est-ce qui vous retient de créer votre compte GoëloRides ?"
- **Type** : `'single'` ⚠️

### 2. Table `poll_options`
Contient les 8 options :
1. Je découvre encore GoëloRides
2. Je préfère simplement suivre les sorties
3. Je ne vois pas encore l'intérêt de créer un compte
4. Je manque de temps
5. Je ne savais pas comment faire
6. Je préfère m'inscrire autrement
7. Je ne suis pas encore prêt(e) à participer
8. **Autre raison** (`level_key = 'other'`)

### 3. Table `poll_votes`
Stocke les votes :
- ✅ Contient : `poll_id`, `option_id`, `user_id`, `voter_key`, `created_at`
- ❌ **Ne contient PAS** : de champ texte libre

### 4. Table `poll_multi_responses` (non utilisée actuellement)
Pour les sondages type `'multi'` :
- ✅ **Contient** : champ `free_text` (500 caractères max)
- ❌ Mais le sondage actuel n'utilise **PAS** cette table

---

## ✅ Solution créée

J'ai préparé **tout ce qu'il faut** pour capturer les textes à partir de maintenant.

### 📦 Fichiers créés

| Fichier | Rôle |
|---------|------|
| **`REPONSE_UTILISATEUR.md`** | 📄 Résumé simple (lis-moi en premier) |
| **`SCHEMA_SONDAGES_SUPABASE.md`** | 📚 Documentation technique complète des tables |
| **`RAPPORT_ANALYSE_SONDAGE_AUTRE_RAISON.md`** | 🔬 Analyse détaillée du problème |
| **`SOLUTION_AUTRE_RAISON.md`** | 🚀 Guide de déploiement étape par étape |
| **`supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql`** | 🛠️ Migration SQL prête à appliquer |
| **`scripts/get_autre_raison_responses.js`** | 🤖 Script Node.js pour récupérer les textes |

---

## 🚀 Pour activer la capture de texte

### Étape 1 : Appliquer la migration (5 min)

**Via Supabase Dashboard :**
1. https://supabase.com/dashboard
2. Projet `iqxyiwnjwcepfgngkzsm`
3. SQL Editor
4. Copie/colle le fichier `supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql`
5. Run

**Ce que ça fait :**
- Convertit le sondage en type `'multi'`
- Migre les 2 votes existants
- Active le champ `free_text`

### Étape 2 : Adapter le frontend (30 min)

**Ajouter un champ texte :**
```html
<div v-if="selectedOption === 'other'">
  <label>Précisez votre raison :</label>
  <textarea v-model="freeText" maxlength="500"></textarea>
</div>
```

**Changer l'API :**
```javascript
// Avant
supabase.rpc('poll_vote', { p_poll_id, p_option_id, p_voter_key })

// Après
supabase.rpc('poll_multi_submit', { 
  p_poll_id, 
  p_option_ids: [optionId], 
  p_free_text: freeText,
  p_voter_key 
})
```

### Étape 3 : Voir les résultats dans l'admin

```javascript
const { data } = await supabase.rpc('poll_multi_admin_results', {
  p_poll_id: pollId
});

// data.free_texts = [
//   { text: "Ma raison...", created_at: "2026-09-07" },
//   ...
// ]
```

---

## 🎯 Résultat final

### Avant (maintenant)

```
Admin GoëloRides > Sondages

⚪ Autre raison : 67% (2 votes)
   └─ Aucun détail disponible
```

### Après la migration

```
Admin GoëloRides > Sondages

⚪ Autre raison : 67% (2 votes)

📝 Textes libres:
   1. "Je préfère attendre d'avoir plus de retours" (05/09)
   2. "Le processus d'inscription me semble compliqué" (06/09)
```

---

## ⚠️ Important

### Les 2 votes actuels

❌ **Perdus** : Impossible de récupérer leurs textes (jamais stockés)

### Les futurs votes

✅ **Capturés** : Après migration + adaptation frontend

---

## 🗂️ Structure Supabase complète

```
polls (table des sondages)
├─ id: uuid
├─ slug: 'freins-creation-compte-v1'
├─ question: "Qu'est-ce qui vous retient..."
├─ poll_type: 'single' → à changer en 'multi' ⚠️
└─ is_active: true

poll_options (options de réponse)
├─ Option 1: "Je découvre encore..."
├─ Option 2: "Je préfère simplement..."
├─ ...
└─ Option 8: "Autre raison" (level_key='other')

poll_votes (votes actuels - type single)
├─ vote 1 → option "Autre raison"
└─ vote 2 → option "Autre raison"
    ❌ Aucun champ free_text ici

poll_multi_responses (après migration - type multi)
├─ réponse 1 → free_text: "..." ✅
└─ réponse 2 → free_text: "..." ✅
    
poll_multi_response_options (liaison réponse-options)
├─ réponse 1 → option "Autre raison"
└─ réponse 2 → option "Autre raison"
```

---

## 📚 Documentation complète

Pour plus de détails, consulte :

1. **`REPONSE_UTILISATEUR.md`** ← Commence par là
2. **`SOLUTION_AUTRE_RAISON.md`** ← Guide de déploiement
3. **`SCHEMA_SONDAGES_SUPABASE.md`** ← Structure technique
4. **`RAPPORT_ANALYSE_SONDAGE_AUTRE_RAISON.md`** ← Analyse complète

---

## 🤝 Besoin d'aide ?

Si tu veux que je :
- Applique la migration
- Adapte le code frontend
- Modifie l'interface admin

→ **Dis-moi ce que tu veux !**

---

**Créé le** : 2026-09-07  
**Par** : Cloud Agent GoëloRides  
**Status** : ✅ Prêt à déployer
