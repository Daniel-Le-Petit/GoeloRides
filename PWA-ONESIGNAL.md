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
