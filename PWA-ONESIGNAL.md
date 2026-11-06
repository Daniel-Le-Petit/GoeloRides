# GoëloRides — PWA & notifications push (OneSignal)

Ce dépôt est un **site statique** (HTML + JS, **sans React** ni build). OneSignal est intégré en **vanilla JS**.

## Règle : un seul worker push à la racine

- **Uniquement** le fichier public **`/OneSignalSDKWorker.js`** à la racine du dépôt (même nom que OneSignal attend par défaut).
- Contenu **exact** (une ligne) :

```js
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
```

- Le fichier **sur le CDN** s’appelle `OneSignalSDK.sw.js` (pas `…OneSignalSDKWorker.js` sur le CDN — ce nom-là est réservé au **fichier local** sur ton domaine).
- **Pas** de second worker dans `push/…`, **pas** de `sw.js` PWA séparé sur `/` : cela créait un risque de double enregistrement et d’abonnements incohérents.

## Fichiers concernés

| Fichier | Rôle |
|--------|------|
| `manifest.json` | Web App Manifest (`display: standalone`, icônes, thème) — « Ajouter à l’écran d’accueil » |
| `OneSignalSDKWorker.js` | **Seul** worker push ; servi en `https://…/OneSignalSDKWorker.js` (doit afficher du JS, pas du HTML ni 404) |
| `goelo-onesignal.js` | Charge le SDK page v16, `OneSignal.init({ appId })` **sans** `serviceWorkerPath` (défaut = racine) |
| `goelo-enable-notifications-banner.js` | Définit `window.goeloRequestPushSubscription` ; **bandeau flottant** : plus monté automatiquement — `EnableNotificationsBanner.mount()` reste pour support / debug. |
| `goelo-pwa-notifications.css` | Styles du bandeau (si monté) + **pied de page** `.goelo-footer-notify-bar` |
| `goelo-notif-manual-button.js` | **Entrée principale** : `#goelo-footer-notify` + `#goelo-footer-notify-inapp` (Safari, copier, partager sur iPhone hors Safari). Le bloc hero `#goelo-notif-manual-wrap` reste masqué. `window.goeloInitNotifications()`. |
| `goelo-debug-panel.js` | **Debug temporaire** (désactivé par défaut) : overlay bas d’écran si `window.GOELO_DEBUG === true` ; `showGoeloDebugPanel()` ; clic = fermer. Ne modifie pas OneSignal ni le SW. |

**Pages publiques** : `goelo-onesignal.js` + `goelo-enable-notifications-banner.js` + `goelo-notif-manual-button.js` ; le pied de page affiche l’option seulement si `window.GOELO_ONESIGNAL_APP_ID` est renseigné.

## Configuration OneSignal (100 % frontend)

1. App **Web** sur [OneSignal](https://onesignal.com/), **App ID** (UUID).
2. Dashboard : **Settings → Platforms → Web** — URL du site (ex. `https://goelorides.onrender.com`).
3. **Safari / iOS** : doc OneSignal « Safari Web Push », **Safari Web ID** si affiché → `window.GOELO_ONESIGNAL_SAFARI_WEB_ID` (et `safari_web_id` dans l’init si tu étends le snippet).

```js
window.GOELO_ONESIGNAL_APP_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
window.GOELO_ONESIGNAL_SAFARI_WEB_ID = ""; // optionnel
```

Sans `GOELO_ONESIGNAL_APP_ID`, le chargement conditionnel du SDK / le **lien pied de page** notifications restent inactifs selon la page.

### Render (site statique)

Pas d’injection automatique de secrets : mêmes options que pour Supabase (variables dans un bloc `<script>` ou fichier de config servi statiquement).

## Test crucial après déploiement

Ouvre **`https://goelorides.onrender.com/OneSignalSDKWorker.js`**

- Tu dois voir **du JavaScript brut** (la ligne `importScripts(…)`).
- **Pas** de 404, **pas** une page HTML du site.

Chrome → **Application → Service Workers** : un seul worker lié à OneSignal pour l’origine (selon navigateur / onglet).

## API JavaScript utiles

- `window.GOELO_NOTIFICATION_TYPES` — `NEW_RIDE`, `RIDE_UPDATE`, `RIDE_CANCELLED`
- `window.goeloSendNotification(type, payload)` — enveloppe / log ; envoi réel = dashboard ou **API REST** (clé jamais côté navigateur).
- `window.goeloOneSignalInitPromise()`, `window.goeloRequestPushSubscription()` — boîte **native** en premier ; dès **Autoriser**, retour **`ok` immédiat** (`pendingFinalize`) et **init + optIn** OneSignal **en arrière-plan** (le flux du bouton ne bloque plus sur le service worker). Plafond init ~120 s ; tâche de fond ~60 s + `optIn` ~20 s. En cas d’échec silencieux en arrière-plan : message dans la **console** + recharger la page si besoin.
- **Safari / WebKit** : `Notification.permission` peut être vide ou non standard tant que la Promise de `requestPermission()` n’a pas reflété le choix — le code normalise tout sauf `granted` / `denied` en `default`, et si la Promise renvoie **`granted`**, on ne repasse **pas** par le flux lent OneSignal (évite l’impression « rien ne se passe » / longue attente).
- **iPhone in-app** (Instagram, Messenger, etc.) : souvent **`typeof Notification === "undefined"`** — Apple ne permet pas les notifications web dans ce WebView ; il faut **Safari** (ou copier le lien). Le **pied de page** propose **Ouvrir dans Safari**, **Copier le lien** et **Partager** quand c’est pertinent. **Pas besoin d’ajouter le site à l’écran d’accueil** pour activer les push dans Safari sur iPhone récent ; c’est seulement un plus.
- Les balises `<script src="goelo-onesignal.js?v=…">` / `goelo-enable-notifications-banner.js?v=…` / `goelo-notif-manual-button.js?v=…` : **incrémente `?v=`** à chaque changement de ces fichiers pour éviter un vieux JS en cache.
- `window.EnableNotificationsBanner.mount({ container })` — bandeau flottant (optionnel ; plus monté automatiquement).
- `window.GoeloNotificationsClearBannerState()` — en console : efface masquage définitif après succès, snooze session, ancienne clé snooze 7 jours si présente ; utile si un ancien bandeau avait été masqué.
- `window.goeloInitNotifications()` — re-exécute le câblage du bouton **`#goelo-footer-notify`** (utile si le pied de page est injecté après chargement).
- **Debug mobile** : dans le HTML, passer `window.GOELO_DEBUG = true` **avant** `goelo-debug-panel.js`, recharger ; panneau bas d’écran après 2 s, ou `showGoeloDebugPanel()` en console (avec le flag à `true`). Clic sur le panneau = fermer.

## Icônes PWA

`manifest.json` pointe vers `assets/hero-accueil.png` et `favicon.ico`. Tu peux ajouter des PNG **192×192** et **512×512** dédiés pour un meilleur rendu sur l’écran d’accueil.

## Confirmations et alertes de participation

L’inscription à une sortie est déjà automatique : `toggle_signup` crée une action
`joined` lorsque des places sont disponibles, ou `waiting` si la sortie est pleine.
Aucune validation administrateur n’est ajoutée. Les demandes de compte Ride Leader
(`approve-demande`) sont un autre flux, qui reste inchangé.

La migration `20261106160000_participation_notification_recipients.sql` étend la
file transactionnelle existante, après la migration du 2 novembre :

- Une transition effective vers `joined` produit une confirmation pour le participant,
  une alerte pour les administrateurs abonnés et le Ride Leader désigné par
  `routes.assigned_team_rider_id`.
- Un même appareil reçoit un seul message par événement, même si son propriétaire
  cumule les rôles. La confirmation personnelle est prioritaire pour un membre.
- Les alertes de désinscription sont conservées ; le Ride Leader les reçoit aussi.
  Les inscriptions en attente ne sont pas annoncées comme confirmées. Une promotion
  de la liste d’attente vers `joined` déclenche la confirmation.
- Aucun trigger n’est ajouté sur la publication des sorties. `NEW_RIDE` reste une
  enveloppe côté client, sans envoi REST.

`goelo-onesignal.js` associe un abonnement déjà consenti au compte connecté via
`participation_device_set`. Le serveur déduit l’identité de `auth.uid()`, sans rôle
fourni par le navigateur. La préférence des alertes admin reste indépendante de la
permission push générale. La déconnexion explicite désactive les livraisons du compte
sur cet appareil avant de fermer la session ; si la révocation serveur échoue, le
client tente un `optOut` OneSignal. Aucun envoi n’est garanti si le navigateur refuse
les notifications ou si l’utilisateur n’a pas activé son abonnement.

Pour un invité par pseudo, la liaison utilise le jeton secret de participation
existant, vérifié contre `guest_pseudo_registrations`. Aucun rapprochement par pseudo
ou e-mail n’est effectué. La confirmation est mise en file après la liaison vérifiée,
dans les cinq minutes suivant l’inscription ; les anciens événements ne sont pas
rejoués au démarrage. Un invité ajouté manuellement sans compte, abonnement ni jeton
personnel ne peut pas recevoir de push individuel.

Le worker recontrôle l’appareil, le compte, l’affectation actuelle du Ride Leader et
l’état de participation juste avant chaque envoi. Les retries conservent la clé
OneSignal d’idempotence. GitHub Actions traite la file environ toutes les cinq minutes ;
ce délai dépend du planificateur GitHub et ne constitue pas un envoi instantané.

### Configuration serveur à vérifier avant activation

Les secrets Supabase ne sont pas partagés automatiquement avec GitHub Actions.
Dans les secrets Actions du dépôt, vérifier **uniquement leur présence**, sans les
copier dans le frontend :

- `SUPABASE_DATABASE_URL` : connexion serveur utilisée par le worker PostgreSQL.
- `ONESIGNAL_REST_API_KEY` : clé REST de l’application OneSignal.
- Variable Actions optionnelle `ONESIGNAL_APP_ID` : même App ID public que celui du
  frontend ; sinon le worker utilise sa valeur publique par défaut.

La lecture des métadonnées de secrets GitHub a été refusée pendant cette tâche :
leur configuration n’a donc pas été confirmée. Aucune notification réelle ni migration
sur la base de production n’a été exécutée. Ne pas lancer le workflow manuellement
pour vérifier les secrets : sur `main`, il peut appliquer des migrations et envoyer
les notifications en attente.

Tests locaux :

```sh
node --test goelorides-tests/tests/unit/admin-participation*.test.cjs
# PostgreSQL local jetable uniquement, avec les variables PG* de la CI :
node goelorides-tests/tests/integration/admin-participation-notifications-postgres.cjs
```

### Nouveau compte cycliste : administrateur uniquement

Un trigger `AFTER INSERT` sur `auth.users`, exécuté après le trigger existant
`on_auth_user_created`, ajoute un événement `account_created` pour les nouveaux
profils de rôle `user`. Il n’ajoute aucune validation manuelle du compte. L’alerte
« Nouveau compte cycliste » ouvre `admin-cyclistes.html` et vise uniquement les
appareils administrateurs ayant activé leurs alertes. Le cycliste ne reçoit pas de
push de bienvenue. La création est détectée dès l’insertion du compte Auth, sans
attendre la confirmation éventuelle de l’adresse e-mail.

Un index unique garantit un seul événement par compte ; une connexion, une mise à
jour du profil ou une réapplication de la migration ne renvoie pas cette alerte.
Les anciens comptes ne sont pas repris. Une panne du mécanisme d’alerte ne bloque
pas la création du compte. Le test PostgreSQL couvre l’événement et son envoi avec
un fournisseur OneSignal simulé, sans accès au service réel.

Le job d’envoi utilise `--require-configured` : une clé absente ou refusée produit
un échec du workflow, plutôt qu’un résultat vert sans service d’envoi configuré.
La présence d’une clé et un job réussi sans message en attente ne prouvent pas la
réception d’un push ; celle-ci se vérifie sur un appareil abonné lors d’un événement réel.
