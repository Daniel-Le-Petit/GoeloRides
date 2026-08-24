# 🗑️ Nettoyage des activités — Guide rapide

## 📍 Où se trouve le bouton ?

**Page** : Admin > Activités  
**Section** : "Analyse visiteurs"  
**Position** : À côté du bouton "Actualiser"

```
┌─────────────────────────────────────────────────────┐
│  Analyse VISITEURS                                  │
│  Parcours, scénarios et funnel                     │
│                                                      │
│  [↻ Actualiser] [🗑️ Nettoyer les activités]       │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 Que fait ce bouton ?

### Il supprime automatiquement :

1. ✅ **Toutes les activités de plus de 7 jours**
   - Exemples : connexions anciennes, consultations de sorties, etc.
   
2. ✅ **Toutes les activités de l'utilisateur "Daniel"**
   - Même si elles sont récentes (< 7 jours)
   - Identification via le profil (UUID), pas juste le texte

### Il NE supprime PAS :

- ❌ Les activités récentes (< 7 jours) des autres utilisateurs
- ❌ Les sorties elles-mêmes (seulement les logs d'activité)
- ❌ Les inscriptions actives aux sorties
- ❌ Les commentaires (sauf dans les logs d'activité)

---

## 🚀 Comment l'utiliser ?

### Étape 1 : Ouvrir la page

1. Se connecter en tant qu'**administrateur**
2. Aller dans **Admin > Activités**
3. Repérer le bouton rouge **"🗑️ Nettoyer les activités"**

### Étape 2 : Cliquer et confirmer

1. Cliquer sur le bouton
2. Une confirmation s'affiche :

```
Supprimer les activités de plus de 7 jours ainsi que
toutes les activités de l'utilisateur Daniel ?

Cette action est irréversible.
```

3. Cliquer **OK** pour confirmer ou **Annuler** pour abandonner

### Étape 3 : Résultat

Un message s'affiche en bas à droite :

```
✅ Nettoyage terminé : 
• 42 activités de plus de 7 jours supprimées 
• 15 activités de Daniel supprimées 
• Total : 57 éléments supprimés
```

La liste des activités se rafraîchit automatiquement après 800ms.

---

## ⚠️ Attention

### ⚠️ Suppression définitive

Les activités supprimées **ne peuvent pas être restaurées**.

### ⚠️ Qui peut l'utiliser ?

Seuls les **administrateurs** peuvent utiliser ce bouton.

Si un utilisateur normal essaie, il reçoit une erreur "forbidden".

### ⚠️ Daniel qui ?

Le système cherche l'utilisateur dont le **pseudo** est exactement **"Daniel"** (sensible à la casse).

Si Daniel change son pseudo, les anciennes activités avec son UUID seront toujours supprimées.

---

## 🧪 Exemple d'utilisation

### Situation : Base de données encombrée

Votre base `activity_events` contient :
- 1000 activités anciennes (> 7 jours)
- 50 activités récentes d'utilisateurs normaux
- 30 activités de Daniel (toutes dates confondues)

### Action : Clic sur "Nettoyer les activités"

### Résultat après confirmation :

```
Nettoyage terminé :
• 1000 activités de plus de 7 jours supprimées
• 30 activités de Daniel supprimées
• Total : 1030 éléments supprimés
```

**Note** : Les 50 activités récentes des autres utilisateurs sont **conservées**.

---

## 🔍 Vérifier avant de nettoyer

### Combien d'activités seront supprimées ?

```sql
-- Activités anciennes (> 7 jours)
SELECT count(*) 
FROM activity_events
WHERE created_at < now() - interval '7 days';

-- Activités de Daniel (toutes dates)
SELECT count(*) 
FROM activity_events
WHERE actor_id = (SELECT id FROM profiles WHERE pseudo = 'Daniel');
```

### Voir les activités de Daniel

```sql
SELECT 
  ae.id,
  ae.event_type,
  ae.created_at,
  p.pseudo,
  ae.metadata
FROM activity_events ae
JOIN profiles p ON p.id = ae.actor_id
WHERE p.pseudo = 'Daniel'
ORDER BY ae.created_at DESC;
```

---

## ❓ FAQ

### Pourquoi "Daniel" spécifiquement ?

C'est une exigence du client. Le système a été conçu pour nettoyer les activités d'un utilisateur test nommé "Daniel".

### Peut-on changer le nom "Daniel" ?

Oui, en modifiant la fonction SQL `activity_admin_cleanup()` :

```sql
-- Ligne à modifier :
WHERE p.pseudo = 'Daniel'

-- Remplacer par :
WHERE p.pseudo = 'NouveauNom'
```

### Que se passe-t-il si Daniel n'existe pas ?

Le système ne supprime aucune activité pour ce critère. Seules les activités anciennes (> 7 jours) sont supprimées.

### Combien de temps prend le nettoyage ?

Quelques secondes pour des milliers d'activités.

Si vous avez des millions d'activités, cela peut prendre plus de temps.

### Peut-on annuler après avoir confirmé ?

**Non**, une fois confirmé, la suppression est immédiate et irréversible.

### Les activités de Daniel > 7 jours sont-elles comptées deux fois ?

**Non**, elles sont comptées une seule fois dans `deleted_old`.

Exemple :
- 5 activités de Daniel > 7 jours
- 3 activités de Daniel < 7 jours

Résultat :
- `deleted_old` = 5
- `deleted_daniel` = 3
- `deleted_total` = 8 (pas 11)

---

## 🛠️ Dépannage

### Le bouton ne s'affiche pas

**Causes possibles** :
1. Vous n'êtes pas admin
2. Le fichier `admin.html` n'a pas été déployé
3. Cache navigateur

**Solutions** :
1. Vérifier votre rôle : `SELECT role FROM profiles WHERE id = auth.uid();`
2. Vider le cache navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
3. Vérifier que le fichier HTML contient le bouton

### Le bouton ne fait rien

**Causes possibles** :
1. Erreur JavaScript
2. Supabase non connecté
3. Migration non appliquée

**Solutions** :
1. Ouvrir la console JavaScript (F12) et regarder les erreurs
2. Vérifier que `window.goeloGetSb()` retourne un objet
3. Vérifier que la migration `20260824120000_activity_cleanup.sql` est appliquée

### Erreur "forbidden"

**Cause** : Vous n'êtes pas administrateur

**Solution** : Vérifier votre rôle dans la table `profiles`

```sql
SELECT id, pseudo, role FROM profiles WHERE id = auth.uid();
```

Si le rôle n'est pas `'admin'`, demander à un administrateur de vous donner ce rôle.

### Erreur "function does not exist"

**Cause** : La migration n'a pas été appliquée

**Solution** : Appliquer la migration

```bash
# Via Supabase CLI
supabase db push

# Ou via Dashboard > SQL Editor
# Copier et exécuter le contenu de :
# supabase/migrations/20260824120000_activity_cleanup.sql
```

---

## 📚 Documentation complète

Pour plus de détails, consulter :

1. **`LIVRAISON.md`** — Vue d'ensemble de la livraison
2. **`ACTIVITY_CLEANUP_DOC.md`** — Guide technique complet
3. **`ACTIVITY_CLEANUP_TESTS.sql`** — Script de test SQL
4. **`ACTIVITY_CLEANUP_SUMMARY.md`** — Récapitulatif technique
5. **`IMPLEMENTATION_COMPLETE.md`** — Checklist d'implémentation

---

## 📧 Support

En cas de problème, consulter d'abord :

1. La console JavaScript (F12)
2. Les logs Supabase (Dashboard > Logs)
3. La section "Dépannage" dans `ACTIVITY_CLEANUP_DOC.md`

---

*Guide créé le 24 août 2026*
