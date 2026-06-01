# Goëlo Rides × Supabase

## 1. Appliquer le schéma SQL

Dans le dashboard Supabase : **SQL Editor** → coller et exécuter le fichier :

`supabase/migrations/20250528120000_goelo_signup.sql`

(Création des tables `routes`, `signups`, `imported_participant_names`, RLS, et des fonctions RPC.)

Puis exécuter **également** (sorties dynamiques + bouton « Nouvelle sortie ») :

`supabase/migrations/20250601120000_route_create_dynamic.sql`

(Élargit `routes.id`, colonnes `route_kind` / `front_config`, RPC `routes_list` **avec argument** `p_filter jsonb`, `route_create`, et met à jour `signup_*` pour tout `route_id` actif dans `routes`.)

Si tu avais exécuté une **version antérieure** de ce fichier avec `routes_list()` sans paramètre et que l’API renvoie **PGRST202** / 404, exécute en plus :

`supabase/migrations/20250601130100_routes_list_jsonb_signature.sql`

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

La logique carte / inscriptions / « Nouvelle sortie » est dans **`parcours.js`** (chargé par `index.html` et `sorties.html`). Les deux pages doivent donc exposer les **mêmes** `window.GOELO_SUPABASE_*` si tu utilises Supabase.

**Attention :** si l’URL est renseignée mais la clé anon est vide (fichier versionné sans secret), le site affiche un **avertissement dans la console** et enregistre **uniquement en local** — la table `signups` dans Supabase restera vide tant que la clé complète n’est pas collée en local ou au déploiement.

**Déploiement :** envoie aussi **`parcours.js`**, **`sortie.js`**, **`sorties.js`** et **`parcours.css`** avec `index.html`, `sorties.html` et `sortie.html` (même dossier à la racine du site).

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

## 5. Données

- **Inscriptions web** : table `signups` (désinscription = `canceled_at` renseigné).
- **Noms sans e-mail** (ex-import `participants.json`) : table `imported_participant_names` ; le fichier JSON reste fusionné côté client si tu le gardes.
- **E-mail Formsubmit** : inchangé ; les notifications partent toujours si `SIGNUP.formEmail` est rempli.

## 6. Sécurité (à terme)

La clé **anon** exposée permet d’appeler les RPC (inscription / liste / désinscription). Pour limiter le spam, tu pourras ajouter **Rate limiting** (Edge Function), **CAPTCHA**, ou **clé secrète** dans une Edge Function et retirer l’`EXECUTE` anon sur `signup_register` / `signup_unregister`.

## 7. Codes d’erreur affichés aux utilisateurs (support)

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
