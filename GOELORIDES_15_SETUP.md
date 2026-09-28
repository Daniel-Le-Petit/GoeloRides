# GoëloRides #15 - Instructions de déploiement

## Sortie créée

- **Nom**: GoëloRides #15 - Les Falaises du Goëlo
- **Date**: 5 octobre 2026
- **Heure**: 09:00 (RDV 08:45)
- **Niveau**: Groupe Vert (Intermédiaire) - 18-22 km/h
- **Distance**: 52,5 km
- **Dénivelé**: 620 m
- **Lieu de départ**: Parking du Casino — Port d'Armor, Saint-Quay-Portrieux

## Étapes pour faire apparaître la sortie sur le site

### Option 1 : Via le Dashboard Supabase (Recommandé)

1. **Connectez-vous au Dashboard Supabase**
   - URL: https://app.supabase.com
   - Sélectionnez votre projet GoëloRides

2. **Ouvrez l'éditeur SQL**
   - Menu latéral → **SQL Editor**
   - Cliquez sur **New query**

3. **Exécutez la migration**
   - Copiez le contenu du fichier : `supabase/migrations/20260928113000_goelorides_15.sql`
   - Collez-le dans l'éditeur
   - Cliquez sur **Run** ou appuyez sur `Ctrl+Enter`

4. **Vérifiez l'insertion**
   ```sql
   SELECT id, track_name, front_config->>'rideDateIso' as date_sortie
   FROM routes 
   WHERE id = 'goelorides_15';
   ```

### Option 2 : Via Supabase CLI (Pour développeurs)

```bash
# Depuis le répertoire du projet
supabase db push

# Ou exécuter directement la migration
psql $DATABASE_URL -f supabase/migrations/20260928113000_goelorides_15.sql
```

## Vérification sur le site

Une fois la migration appliquée, la sortie apparaîtra automatiquement :

### 1. Page d'accueil (`index.html`)
- Section "Prochaines sorties"
- La sortie #15 du 5 octobre devrait apparaître en premier (date future la plus proche)

### 2. Page Sorties (`sorties.html`)
- Liste complète des sorties
- Filtres disponibles : Route, Groupe Vert, À venir

### 3. Fiche détaillée
- URL: `sortie.html?id=goelorides_15`
- Accessible en cliquant sur la carte de la sortie

## Vérifications techniques

### Si la sortie n'apparaît pas :

1. **Vérifier que la migration a réussi**
   ```sql
   SELECT COUNT(*) FROM routes WHERE id = 'goelorides_15';
   -- Doit retourner : 1
   ```

2. **Vérifier la configuration du site**
   - Ouvrir la console du navigateur (F12)
   - Vérifier qu'il n'y a pas d'erreurs de connexion Supabase
   - Les variables `window.GOELO_SUPABASE_URL` et `window.GOELO_SUPABASE_ANON_KEY` doivent être définies

3. **Vérifier le filtrage par date**
   - La sortie doit avoir une `rideDateIso` future (2026-10-05)
   - Le système filtre automatiquement les sorties passées

4. **Forcer le rechargement**
   - Vider le cache du navigateur : `Ctrl+F5` (Windows) ou `Cmd+Shift+R` (Mac)
   - Ou ouvrir en navigation privée

## Modification de la sortie

Pour modifier la sortie ultérieurement, vous pouvez :

### Option A : Via l'interface Team Rider (si configurée)
1. Se connecter en tant qu'admin sur le site
2. Menu "Gérer les sorties"
3. Sélectionner "GoëloRides #15"
4. Modifier les détails
5. Enregistrer

### Option B : Via SQL directement
```sql
UPDATE routes
SET front_config = front_config || jsonb_build_object(
  'description', '<p>Nouvelle description...</p>',
  'maxParticipants', 40
)
WHERE id = 'goelorides_15';
```

## Personnalisation

Pour personnaliser davantage la sortie, modifiez les champs suivants dans le `front_config` :

- `rideDateIso` : Date de la sortie (format YYYY-MM-DD)
- `rideTime` : Heure de départ (format HH:MM)
- `meetTime` : Heure de rendez-vous
- `meetPlace` : Lieu de rendez-vous
- `description` : Description HTML de la sortie
- `maxParticipants` : Nombre maximum de participants
- `km` et `dplus` : Distance et dénivelé
- `levelClass` : Niveau (level-blanc, level-vert, level-bleu)

## Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs dans la console du navigateur
2. Vérifiez les logs Supabase (Dashboard → Logs)
3. Consultez `supabase/SUPABASE.md` pour la configuration générale
