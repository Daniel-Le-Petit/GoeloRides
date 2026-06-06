# Sauvegardes Supabase → Cloudflare R2 (free-friendly)

Objectif : **aucun serveur à gérer**, exécution **automatique** via **GitHub Actions** (minutes gratuites), stockage **privé** sur **R2**, scripts **identiques** en local et en CI.

---

## Étape A — Créer le bucket R2 + token API

Fais ceci dans l’ordre (compte Cloudflare requis ; R2 peut demander une **carte bancaire** à l’activation même si la facturation reste à 0 € sur le free tier — vérifier les conditions actuelles sur cloudflare.com).

### A.1 Activer R2 et créer le bucket

1. Va sur [dash.cloudflare.com](https://dash.cloudflare.com) et connecte-toi.
2. Menu latéral → **R2** (section *Stockage*). Si c’est la première fois, suis l’assistant pour **activer R2** sur ton compte.
3. Clique **Create bucket**.
4. **Bucket name** : par ex. `goelorides-backups` (nom global unique sur ton compte ; note-le exactement pour le secret GitHub `R2_BUCKET_NAME`).
5. **Location** : laisse la suggestion par défaut (souvent **Automatic**) sauf contrainte régionale.
6. Clique **Create bucket**.

### A.2 Vérifier que le bucket est privé

1. Ouvre ton bucket → onglet **Settings**.
2. Section **Public access** (ou équivalent « R2.dev subdomain » / « Custom domain ») : **aucun accès public** ne doit être activé pour nos backups. Si un domaine public est proposé, ne l’active **pas** pour ce bucket.

### A.3 Récupérer l’Account ID

1. Menu **R2** → page d’accueil R2 (liste des buckets) ou **Overview**.
2. À droite ou en haut, repère **Account ID** (chaîne hexadécimale). **Copie-la** → ce sera le secret GitHub `R2_ACCOUNT_ID`.

### A.4 Créer un token API (S3-compatible)

1. Toujours dans **R2** → **Manage R2 API Tokens** (lien souvent en haut à droite de la page R2).
2. **Create API token**.
3. **Token name** : ex. `github-actions-goelorides-backup`.
4. **Permissions** : **Object Read & Write** (ou **Admin Read & Write** si l’UI ne propose que ça — le minimum utile est lecture + écriture d’objets).
5. **Specify bucket** : choisis **only** le bucket `goelorides-backups` (moins de surface d’attaque qu’un accès à tous les buckets).
6. **Create API Token**.
7. La page affiche **Access Key ID** et **Secret Access Key** : copie-les **tout de suite** (le secret ne sera plus affiché).  
   - `R2_ACCESS_KEY_ID` = Access Key ID  
   - `R2_SECRET_ACCESS_KEY` = Secret Access Key  

Tu as maintenant : **Account ID**, **nom du bucket**, **Access Key**, **Secret Key**.

---

## Étape B — Secrets GitHub (Actions)

1. Ouvre ton dépôt sur GitHub (ex. `https://github.com/<toi>/GoeloRides`).
2. **Settings** (onglet du dépôt, pas de ton compte).
3. Menu gauche → **Secrets and variables** → **Actions**.
4. Onglet **Secrets** → **New repository secret** pour chaque ligne du tableau (nom **exact**, une valeur par secret).

| Nom du secret | Valeur à coller |
|-----------------|-----------------|
| `SUPABASE_DATABASE_URL` | Supabase → **Project Settings** → **Database** → *Connection string* → onglet **URI**. Utilise la connexion **directe** (hôte `db.<ref>.supabase.co`, port **5432**). Ajoute `?sslmode=require` à la fin de l’URL si la doc Supabase le recommande. |
| `R2_ACCOUNT_ID` | Account ID Cloudflare (étape A.3). |
| `R2_ACCESS_KEY_ID` | Access Key ID du token (étape A.4). |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key du token (étape A.4). |
| `R2_BUCKET_NAME` | Nom exact du bucket, ex. `goelorides-backups`. |
| `R2_PREFIX` | *(optionnel)* Laisse vide **ou** ne crée pas ce secret pour utiliser le défaut `backups/goelorides-`. Si tu crées le secret, mets exactement `backups/goelorides-` (avec le tiret final). |

5. Vérifie qu’il n’y a **pas d’espace** avant/après les valeurs collées.

**Tester sans attendre le cron** : onglet **Actions** → workflow **Supabase backup → R2** → **Run workflow** → branche `main` → **Run workflow**. Ouvre l’exécution : la ligne *Dump & upload to R2* doit être verte ; dans Cloudflare R2, ouvre le bucket → tu dois voir un objet du type `backups/goelorides-AAAA-MM-JJ.dump`.

---

## Étape C — Lifecycle : supprimer après 7 jours (préfixe `backups/goelorides-`)

1. Cloudflare → **R2** → ouvre le bucket `goelorides-backups`.
2. Onglet **Settings**.
3. Section **Object lifecycle rules** (ou *Object lifecycles*) → **Add rule** / **Ajouter une règle**.
4. Renseigne par exemple :
   - **Rule name** : `delete-goelorides-dumps-7d`
   - **Prefix** (filtre) : `backups/goelorides-`  
     *(doit correspondre au préfixe utilisé par le script ; le défaut du dépôt est `backups/goelorides-`.)*
   - **Action** : supprimer les objets après **7** jours (libellé du type *Delete objects after N days* / *Expire* — selon l’UI actuelle).
5. Enregistre la règle.

Les objets concernés sont supprimés automatiquement après ~7 jours (traitement parfois différé d’environ 24 h selon Cloudflare). Tu peux ajouter une **deuxième** règle pour *Abort incomplete multipart uploads* après 7 jours (bonne hygiène, optionnel).

Documentation officielle : [Object lifecycles (R2)](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

---

## Référence rapide (déjà fait plus haut)

- **Workflow** : `.github/workflows/supabase-backup-r2.yml` — cron ~04:20 UTC + déclenchement manuel.
- **Script backup** : `scripts/backup-supabase-r2.sh` (même logique en CI et en local).
- **Config locale** : copier `scripts/env.backup.example` → `.env.backup` (ignoré par git).

### Restore en local (rappel)

```bash
cp scripts/env.backup.example .env.backup
# Remplir R2_* + TARGET_DATABASE_URL (base de **test**)
bash scripts/restore-supabase-from-r2.sh 2026-06-15
```

Confirmer en tapant **`OUI`** quand le script le demande. `pg_restore` utilise `--clean` : **destructif** sur la base cible.

### Dépannage

- **pg_dump en CI** : URI incorrecte, mot de passe réinitialisé, ou port 5432 bloqué (peu fréquent avec Supabase).
- **aws s3 cp** : `R2_ACCOUNT_ID`, clés, nom du bucket ; endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
- **Fichier absent dans R2** : vérifier le préfixe (`backups/goelorides-` vs secret `R2_PREFIX`).

Le **schéma** reste versionné dans `supabase/migrations/` ; le dump sert surtout aux **données** + restauration globale via `pg_restore`.
