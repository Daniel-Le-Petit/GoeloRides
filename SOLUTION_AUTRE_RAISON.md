# Solution : Récupérer les réponses "Autre raison"

## 🔍 Diagnostic

Vous avez demandé à voir le contenu des réponses "Autre raison" du sondage :

> « Qu'est-ce qui vous retient de créer votre compte GoëloRides ? »

**Résultat de l'analyse :**

❌ **Les réponses textuelles n'existent pas dans la base de données actuelle.**

### Pourquoi ?

Le sondage est configuré avec `poll_type = 'single'` (choix unique), ce qui signifie :

1. ✅ Les utilisateurs peuvent **SÉLECTIONNER** "Autre raison"
2. ❌ Les utilisateurs **NE PEUVENT PAS SAISIR** de texte expliquant leur raison
3. ❌ La table `poll_votes` **NE STOCKE PAS** de texte libre

### Ce que vous voyez actuellement dans l'admin

```
⚪ Autre raison : 67 % (2 votes)
⚪ Je découvre encore GoëloRides : 33 % (1 vote)
```

→ Vous savez **combien** de personnes ont choisi "Autre raison"  
→ Vous ne savez **pas pourquoi** (aucun texte stocké)

---

## 🛠️ Solution : Convertir en sondage multi-choix

Pour commencer à collecter les raisons textuelles, il faut :

### 1️⃣ Appliquer la migration SQL

**Fichier créé :** `/workspace/supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql`

Cette migration va :
- ✅ Convertir le sondage en type `'multi'`
- ✅ Migrer les votes existants vers la nouvelle structure
- ✅ Activer le champ `free_text` pour les futures réponses

**Comment l'appliquer :**

#### Option A : Via Supabase Dashboard

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet `iqxyiwnjwcepfgngkzsm`
3. Menu **SQL Editor**
4. Copiez le contenu de `supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql`
5. Cliquez **Run**

#### Option B : Via CLI Supabase (si installé)

```bash
cd /workspace
supabase db push
```

#### Option C : Via psql (si accès direct)

```bash
psql "postgresql://postgres:PASSWORD@db.iqxyiwnjwcepfgngkzsm.supabase.co:5432/postgres" \
  -f supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql
```

### 2️⃣ Adapter le frontend

Après la migration, il faut modifier le formulaire de vote pour permettre la saisie de texte.

**Fichiers à modifier :**

#### A. Composant du sondage (à identifier)

Rechercher le composant qui affiche le sondage et remplacer l'appel à `poll_vote()` par `poll_multi_submit()`.

**Avant (single-choice) :**
```javascript
const { data } = await supabase.rpc('poll_vote', {
  p_poll_id: pollId,
  p_option_id: selectedOptionId,
  p_voter_key: voterKey
});
```

**Après (multi-choice avec texte) :**
```javascript
const { data } = await supabase.rpc('poll_multi_submit', {
  p_poll_id: pollId,
  p_option_ids: [selectedOptionId], // Tableau d'IDs
  p_free_text: freeTextValue || '', // Texte libre (optionnel)
  p_voter_key: voterKey
});
```

#### B. Ajouter un champ texte conditionnel

Afficher un champ texte quand l'option "Autre raison" est sélectionnée :

```html
<!-- Pseudo-code HTML/JS -->
<div class="poll-options">
  <label v-for="option in options" :key="option.id">
    <input 
      type="radio" 
      :value="option.id" 
      v-model="selectedOption"
      name="poll-option"
    />
    {{ option.label }}
  </label>
  
  <!-- Champ texte affiché uniquement si "Autre raison" sélectionné -->
  <div v-if="isAutreRaisonSelected" class="free-text-input">
    <label for="free-text">Précisez votre raison :</label>
    <textarea 
      id="free-text"
      v-model="freeText"
      maxlength="500"
      placeholder="Dites-nous pourquoi..."
      rows="3"
    ></textarea>
  </div>
</div>
```

```javascript
computed: {
  isAutreRaisonSelected() {
    const selectedOpt = this.options.find(o => o.id === this.selectedOption);
    return selectedOpt && selectedOpt.level_key === 'other';
  }
}
```

### 3️⃣ Récupérer les réponses textuelles

Une fois la migration appliquée et le frontend adapté, vous pourrez récupérer les textes.

#### Via l'admin JavaScript

```javascript
// Dans l'admin (js/goelo-admin-polls.js ou console navigateur)

// 1. Se connecter en tant qu'admin
const supabase = window.goeloGetSb();

// 2. Trouver l'ID du sondage
const { data: pollList } = await supabase.rpc('poll_admin_list');
const poll = pollList.polls.find(p => p.slug === 'freins-creation-compte-v1');

// 3. Récupérer les résultats détaillés avec textes
const { data: results } = await supabase.rpc('poll_multi_admin_results', {
  p_poll_id: poll.id
});

// 4. Afficher les textes libres
console.log('Textes libres:', results.free_texts);

// Exemple de résultat:
// [
//   { 
//     id: 'uuid-123',
//     text: 'Je préfère attendre une version plus stable',
//     created_at: '2026-09-05T10:30:00Z'
//   },
//   {
//     id: 'uuid-456',
//     text: 'Trop compliqué à comprendre pour le moment',
//     created_at: '2026-09-06T14:20:00Z'
//   }
// ]
```

#### Via le script Node.js

```bash
# 1. Obtenir votre token d'accès admin
# Dans la console du navigateur (admin connecté):
(await supabase.auth.getSession()).data.session.access_token

# 2. Exécuter le script
node scripts/get_autre_raison_responses.js YOUR_ACCESS_TOKEN
```

### 4️⃣ Intégrer dans l'interface admin

Modifier `/workspace/js/goelo-admin-polls.js` pour afficher les textes libres :

```javascript
async function renderPollDetails(pollId) {
  const sb = getSb();
  
  // Récupérer les détails
  const res = await sb.rpc('poll_multi_admin_results', { p_poll_id: pollId });
  
  if (res.error || !res.data) {
    console.error('Erreur:', res.error);
    return;
  }
  
  const { poll, options, free_texts, responses_count } = res.data;
  
  // Afficher les statistiques d'options
  let html = '<div class="poll-details">';
  html += `<h3>${escapeHtml(poll.question)}</h3>`;
  html += `<p>Total réponses: ${responses_count}</p>`;
  
  // Options
  html += '<div class="poll-options-stats">';
  options.forEach(opt => {
    html += `<div class="opt-stat">`;
    html += `  <strong>${escapeHtml(opt.label)}</strong>: `;
    html += `  ${opt.votes} vote(s) (${opt.percent}%)`;
    html += `</div>`;
  });
  html += '</div>';
  
  // Textes libres
  if (free_texts && free_texts.length > 0) {
    html += '<div class="free-texts-section">';
    html += '<h4>📝 Réponses textuelles :</h4>';
    free_texts.forEach((entry, i) => {
      const date = new Date(entry.created_at).toLocaleString('fr-FR');
      html += `<div class="free-text-entry">`;
      html += `  <small>${date}</small>`;
      html += `  <p>"${escapeHtml(entry.text)}"</p>`;
      html += `</div>`;
    });
    html += '</div>';
  }
  
  html += '</div>';
  
  document.getElementById('poll-details-container').innerHTML = html;
}
```

---

## 📋 Checklist de déploiement

- [ ] **Migration SQL appliquée** (20260907120000_convert_poll_freins_to_multi.sql)
- [ ] **Frontend adapté** pour :
  - [ ] Afficher un champ texte conditionnel
  - [ ] Appeler `poll_multi_submit()` au lieu de `poll_vote()`
- [ ] **Admin adapté** pour :
  - [ ] Appeler `poll_multi_admin_results()` au lieu de `poll_admin_results()`
  - [ ] Afficher les textes libres dans l'interface
- [ ] **Tests** :
  - [ ] Voter avec "Autre raison" + texte libre
  - [ ] Vérifier que le texte est stocké
  - [ ] Vérifier que l'admin peut voir le texte

---

## 📊 Après déploiement

Une fois tout en place, vous pourrez :

✅ Voir combien de personnes ont voté "Autre raison" (comme avant)  
✅ **Lire le texte saisi** par chaque personne ayant choisi "Autre raison"  
✅ Analyser les vraies raisons qui freinent la création de compte  
✅ Adapter votre stratégie en fonction des retours

---

## ⚠️ Limitations actuelles

Avant la migration :

❌ Aucun texte libre stocké pour les 2 votes "Autre raison" existants  
❌ Impossible de récupérer les raisons spécifiques des votes passés  

→ **Solution :** Les données passées sont perdues, mais les futurs votes captureront le texte

---

## 📁 Fichiers créés

1. **`RAPPORT_ANALYSE_SONDAGE_AUTRE_RAISON.md`**  
   Analyse détaillée du problème et des solutions

2. **`supabase/migrations/20260907120000_convert_poll_freins_to_multi.sql`**  
   Migration pour convertir le sondage en type multi

3. **`scripts/get_autre_raison_responses.js`**  
   Script Node.js pour récupérer les textes libres

4. **`SOLUTION_AUTRE_RAISON.md`** (ce fichier)  
   Guide de déploiement étape par étape

---

## 🆘 Besoin d'aide ?

### Le sondage n'apparaît pas dans la base

→ Vérifiez que la migration `20260818120000_poll_account_creation.sql` a été appliquée

### "Forbidden" lors de l'appel RPC

→ Assurez-vous d'être connecté en tant qu'admin (rôle `goelo_admin` dans le JWT)

### Les textes libres n'apparaissent pas

→ Vérifiez :
1. La migration vers type 'multi' a été appliquée
2. Le frontend soumet bien via `poll_multi_submit()`
3. Le paramètre `p_free_text` est bien renseigné (même vide)

---

## 🎯 Résultat final attendu

**Interface admin après déploiement :**

```
═══════════════════════════════════════════════════════════
Sondage : Qu'est-ce qui vous retient de créer votre compte ?
Type : multi  |  3 réponses
═══════════════════════════════════════════════════════════

📊 STATISTIQUES:
  ⚪ Autre raison : 67% (2 votes)
  ⚪ Je découvre encore GoëloRides : 33% (1 vote)

📝 RÉPONSES TEXTUELLES:

1. [05/09/2026 10:30]
   "Je préfère attendre d'avoir plus de retours avant de créer mon compte"

2. [06/09/2026 14:20]
   "Le processus d'inscription me semble compliqué"

═══════════════════════════════════════════════════════════
```

**Vous pourrez enfin lire ce que les utilisateurs pensent vraiment ! 🎉**

---

**Date :** 2026-09-07  
**Agent :** Cloud Agent GoëloRides
