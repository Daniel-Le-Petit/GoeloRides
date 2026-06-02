# Goëlo Rides × Supabase

## 1. Appliquer le schéma SQL

Dans le dashboard Supabase : **SQL Editor** → coller et exécuter le fichier :

`supabase/migrations/20250528120000_goelo_signup.sql`

(Création des tables `routes`, `signups`, `imported_participant_names`, RLS, et des fonctions RPC.)

Puis exécuter **également** (sorties dynamiques + bouton « Gérer les sorties ») :

`supabase/migrations/20250601120000_route_create_dynamic.sql`

(Élargit `routes.id`, colonnes `route_kind` / `front_config`, RPC `routes_list` **avec argument** `p_filter jsonb`, `route_create`, et met à jour `signup_*` pour tout `route_id` actif dans `routes`.)

Si tu avais exécuté une **version antérieure** de ce fichier avec `routes_list()` sans paramètre et que l’API renvoie **PGRST202** / 404, exécute en plus :

`supabase/migrations/20250601130100_routes_list_jsonb_signature.sql`

**Sécurité modale admin (admin + mot de passe)** — à exécuter pour que seuls les comptes administrateurs puissent appeler `route_create` :

`supabase/migrations/20250607120000_route_create_admin_auth.sql`

(Crée `goelo_admin_resolve_login`, restreint `route_create` aux JWT **authenticated** avec `app_metadata.goelo_admin = true`, retire l’exécution **anon** sur `route_create`.)

Puis exécuter **également** (promotion Team Rider depuis le site, sans clé service dans le navigateur) :

`supabase/migrations/20250608120000_goelo_admin_set_team_rider.sql`

(Crée la RPC `goelo_admin_set_team_rider` : seul un JWT déjà `goelo_admin` peut mettre à jour `auth.users.raw_app_meta_data` pour un autre compte identifié par e-mail.)

Puis exécuter **si tu veux modifier une sortie déjà créée** depuis le site (sans recréer une ligne) :

`supabase/migrations/20250609120000_route_update.sql`

(Crée la RPC `route_update` : même garde admin que `route_create`, uniquement sur les routes `route_kind = 'custom'`.)

Puis exécuter **si tu veux supprimer une sortie personnalisée** depuis le site (désactivation, elle disparaît des listes) :

`supabase/migrations/20250610120000_route_delete.sql`

(Crée la RPC `route_delete(p_route_id text)` : même garde admin, `is_active = false` sur les routes `route_kind = 'custom'` uniquement.)

## 2. Clé anon côté site

Le site utilise **RPC `SECURITY DEFINER`** : la clé **anon** ne donne pas un accès direct en lecture/écriture sur `signups` (RLS bloque), seulement l’appel aux fonctions `signup_*`.

Récupère :

- **Project URL** : *Settings → API → Project URL* (ou l’URL affichée en haut, `https://<ref>.supabase.co`).
- **Clé publique côté client** (une des deux) :
  - *Settings → API* → onglet **Legacy API Keys** → **anon** « public » (JWT `eyJ…`) ;
  - ou onglet **API Keys** → **Publishable key** (`sb_publishable_…`).

## 3. Configurer `index.html` et `sorties.html` (sans committer les secrets dans le dépôt public)

**Option A — variables globales** (recommandé) : dans **`index.html`** et **`sorties.html`**, dans le petit bloc `<script>` qui définit les variables **avant** les scripts `parcours.js` / chargement de la page Sorties, ajoute :

```html
<script>
  window.GOELO_SUPABASE_URL = "https://xxxxxxxx.supabase.co";
  window.GOELO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....";
</script>
```

Si ces deux variables sont vides, le site continue d’utiliser **localStorage** (`goeloRides_inscriptions_v1`) comme avant.

La logique carte / inscriptions / modale **Gérer les sorties** est dans **`parcours.js`** (chargé par `index.html` et `sorties.html`). Les deux pages doivent donc exposer les **mêmes** `window.GOELO_SUPABASE_*` si tu utilises Supabase.

**Attention :** si l’URL est renseignée mais la clé anon est vide (fichier versionné sans secret), le site affiche un **avertissement dans la console** et enregistre **uniquement en local** — la table `signups` dans Supabase restera vide tant que la clé complète n’est pas collée en local ou au déploiement.

**Déploiement :** envoie aussi **`parcours.js`**, **`sortie.js`**, **`sorties.js`**, **`goelo-auth.js`** et **`parcours.css`** avec `index.html`, `sorties.html`, `sortie.html` et `groupes.html` (même dossier à la racine du site).

**Si tu vois `401` / `Invalid API key` :**

- Va dans **Project Settings → API**. Selon l’interface du projet :
  - onglet **Legacy API Keys** → copie **anon** « public » (long JWT commençant par `eyJ`, **deux** caractères `.` dans la chaîne) ;
  - ou onglet **API Keys** → **Publishable key** (`sb_publishable_…`) — le site envoie la même valeur dans `apikey` et `Authorization` (requis par PostgREST pour ce format).
- L’URL `https://xxxxx.supabase.co` doit être celle **du même projet** que la clé.
- Pas d’espace ni de retour à la ligne dans le JWT (le script enlève les espaces, pas une coupure manuelle au milieu du token).
- Faute fréquente : le préfixe s’écrit **`sb_publishable_`** (comme *publishable*), **pas** `sb_publishedable_`.

**Autres pièges :**

- Mets un **`;`** après la ligne URL si la ligne suivante commence par `window` sur la même ligne copiée-collée (sinon JavaScript fusionne les deux chaînes et tout casse).
- Vérifie l’onglet **Network** : `POST …/rest/v1/rpc/signup_register` doit être **200** (sinon lire le corps : 401 = clé / projet, 404 = migration SQL non appliquée).
- Le code relit `window.GOELO_SUPABASE_*` à chaque appel ; un petit script de config peut être placé **après** `parcours.js` dans le HTML (moins pratique) ou **avant** dans le `<head>` / en tête de `<body>`.

**Option B** : renseigner directement les chaînes dans l’objet `SUPABASE` dans le script (moins recommandé si le dépôt est public).

## 4. CORS

Si le site est servi depuis un domaine (ex. Render), vérifie **Settings → API → CORS** : ajoute l’URL du site. Pour les tests locaux, ajoute `http://127.0.0.1:8765` (ou le port utilisé).

## 5. Administrateurs (« Gérer les sorties »)

Après les migrations **`20250607120000_route_create_admin_auth.sql`** et **`20250608120000_goelo_admin_set_team_rider.sql`** :

### Premier compte avec droit créateur (bootstrap)

Il faut **au moins un** utilisateur Auth avec `goelo_admin: true` dans **`raw_app_meta_data`** (équivalent **App Meta Data**). Si le dashboard ne permet pas d’éditer le JSON, utilise **SQL Editor** une fois pour ton e-mail :

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('goelo_admin', true)
WHERE lower(email) = lower('admin@exemple.com');
```

### Ensuite : depuis le site (Team Riders)

1. Connecte-toi dans la modale **Gérer les sorties** avec ce compte admin (e-mail + mot de passe).
2. Ouvre la section **Team Riders** (sous « Session admin »), saisis l’e-mail d’un utilisateur **déjà** présent dans **Authentication → Users**, coche ou décoche **Donner le droit créateur**, puis **Appliquer**.
3. La personne doit **se déconnecter puis se reconnecter** dans la même modale pour recevoir un JWT à jour (sinon l’ancien jeton ne contient pas encore `goelo_admin`).

**Sécurité :** la clé **anon** du site ne suffit pas à modifier `auth.users` : seule la RPC `SECURITY DEFINER` le fait, et elle vérifie que l’appelant a déjà `goelo_admin` dans **son** JWT. On ne met **jamais** la clé **service_role** dans le HTML.

### Autres points

- **Authentication → Users** : crée les comptes (e-mail + mot de passe) avant de les promouvoir.
- **Pseudo** : pour se connecter avec un pseudo au lieu de l’e-mail, insère une ligne dans **`goelo_admin_login_aliases`** (SQL Editor), par ex.  
  `INSERT INTO public.goelo_admin_login_aliases (alias_lower, auth_email) VALUES ('monpseudo', 'admin@exemple.com');`  
  avec **`auth_email`** exactement l’e-mail du compte Auth.

- **« E-mail ou mot de passe incorrect »** : l’API Supabase renvoie souvent la même erreur pour *mauvais mot de passe*, *compte absent sur ce projet*, ou *e-mail pas encore confirmé*. Vérifie **`email_confirmed_at`**, et réinitialise le mot de passe si besoin.

La session admin est stockée dans **`sessionStorage`** (clé `goelo_admin_auth_v1`) ; **Se déconnecter** dans la barre « Session admin » de la modale.

**E-mail de confirmation** : si le projet exige une confirmation d’e-mail avant première connexion, valide le mail depuis la boîte du compte concerné.

## 6. Données

- **Inscriptions web** : table `signups` (désinscription = `canceled_at` renseigné).
- **Noms sans e-mail** (ex-import `participants.json`) : table `imported_participant_names` ; le fichier JSON reste fusionné côté client si tu le gardes.
- **E-mail Formsubmit** : inchangé ; les notifications partent toujours si `SIGNUP.formEmail` est rempli.

## 7. Sécurité (à terme)

La clé **anon** exposée permet d’appeler les RPC d’inscription / listes. `route_create` n’est plus exécutable en **anon** après la migration admin. Pour limiter le spam sur les autres RPC, tu pourras ajouter **Rate limiting** (Edge Function), **CAPTCHA**, ou **clé secrète** dans une Edge Function.

## 8. Codes d’erreur affichés aux utilisateurs (support)

En cas d’échec d’enregistrement (Supabase ou navigateur), une boîte de dialogue peut indiquer un **numéro d’erreur** à transmettre à l’administrateur :

| Code | Signification (côté client) |
|------|-----------------------------|
| **36** | Réseau : impossible de joindre l’URL Supabase (DNS, hors-ligne, CORS, etc.). |
| **37** | Le serveur a répondu avec un code HTTP d’erreur (le message inclut **HTTP xxx** quand c’est connu). |
| **38** | Réponse vide ou pas au format JSON attendu. |
| **39** | Corps JSON illisible après réception. |
| **40** | Réponse reçue mais la fonction RPC signale un refus (`ok: false`) ou cas inattendu. |
| **41** | Échec d’écriture dans **localStorage** du navigateur (quota, mode privé strict, etc.). |

Les scripts concernés : **`parcours.js`**, **`sortie.js`** (et la couche RPC alignée dans **`sorties.js`** pour les lectures).

## 9. Compte cycliste (`goelo-auth.js`)

Toutes les pages avec la barre latérale chargent **`goelo-auth.js`** : un bouton **Se connecter** (icône + libellé) sous le menu ouvre une fenêtre **Connexion** (e-mail + mot de passe) ou **Inscription** (pseudo + e-mail + mot de passe). Les appels passent par l’**API Auth** Supabase (`/auth/v1/signup`, `/auth/v1/token`). Le pseudo est stocké dans **`user_metadata.pseudo`**. La session (jetons + rafraîchissement) est enregistrée dans **`localStorage`** sous la clé **`goelo_user_auth_v1`** ; l’e-mail est aussi recopié dans **`goeloRides_last_email`** pour pré-remplir les formulaires d’inscription aux sorties.

**Dashboard** : **Authentication → Providers → Email** activé ; autoriser les **inscriptions** si le public doit créer un compte. Si la **confirmation e-mail** est obligatoire, l’utilisateur doit valider le lien reçu avant la première connexion (sinon pas de `access_token` à l’inscription). Sinon la connexion peut renvoyer *Invalid login credentials* même avec le bon mot de passe.

**Connexion refusée** : vérifier dans **Authentication → Users** que l’utilisateur existe, que l’e-mail est confirmé (`email_confirmed_at` renseigné), et que le mot de passe est le bon (sinon **Reset password** depuis le dashboard ou flux « Mot de passe oublié » si tu l’actives).

**Fichiers à déployer** : inclure **`goelo-auth.js`** à la racine avec **`app-chrome.css`**. Sur **`groupes.html`**, **`sortie.html`** et **`sorties.html`**, renseigner les mêmes `window.GOELO_SUPABASE_*` que sur l’accueil si tu veux le compte actif partout.

**Note** : la connexion standard Supabase utilise **l’e-mail**, pas le pseudo seul (le pseudo sert au affichage et aux métadonnées). Pour un login « pseudo uniquement », il faudrait une table d’alias dédiée (comme pour les admins).
