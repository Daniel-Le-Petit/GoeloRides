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
| `goelo-enable-notifications-banner.js` | Bandeau **v2** : bouton explicite « Activer les notifications » (geste → demande native) ; si **refus** (`denied`), bandeau ambre avec consignes **Safari / iOS** ou navigateur desktop ; « Plus tard » / masquage = **session** (fermeture onglet) |
| `goelo-pwa-notifications.css` | Styles du bandeau (safe area mobile) |

**Accueil (`index.html`)** : init OneSignal peut être dans le `<head>` (snippet dashboard) + `GOELO_ONESIGNAL_APP_ID` pour le bandeau. Les autres pages utilisent en général `goelo-onesignal.js` + variables `window.GOELO_ONESIGNAL_*`.

## Configuration OneSignal (100 % frontend)

1. App **Web** sur [OneSignal](https://onesignal.com/), **App ID** (UUID).
2. Dashboard : **Settings → Platforms → Web** — URL du site (ex. `https://goelorides.onrender.com`).
3. **Safari / iOS** : doc OneSignal « Safari Web Push », **Safari Web ID** si affiché → `window.GOELO_ONESIGNAL_SAFARI_WEB_ID` (et `safari_web_id` dans l’init si tu étends le snippet).

```js
window.GOELO_ONESIGNAL_APP_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
window.GOELO_ONESIGNAL_SAFARI_WEB_ID = ""; // optionnel
```

Sans `GOELO_ONESIGNAL_APP_ID`, le chargement conditionnel du SDK / le bandeau peuvent rester inactifs selon la page.

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
- `window.goeloOneSignalInitPromise()`, `window.goeloRequestPushSubscription()` (init ~25 s, demande de permission ~60 s max). Retours utiles : `ok`, `reason` (`permission_denied`, `permission_not_granted`, `timeout`, …), `message`.
- `window.EnableNotificationsBanner.mount({ container })`
- `window.GoeloNotificationsClearBannerState()` — en console : réaffiche le bandeau (efface masquage définitif après succès, snooze session, ancienne clé snooze 7 jours si présente)

## Icônes PWA

`manifest.json` pointe vers `assets/hero-accueil.png` et `favicon.ico`. Tu peux ajouter des PNG **192×192** et **512×512** dédiés pour un meilleur rendu sur l’écran d’accueil.
