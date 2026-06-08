/**
 * OneSignal Web SDK v16 — site 100 % statique (Render).
 * Le worker est le fichier public OneSignalSDKWorker.js à la racine (importScripts CDN v16), sans sous-dossier ni second SW PWA sur /.
 *
 * Config (avant ce script, dans chaque HTML) :
 *   window.GOELO_ONESIGNAL_APP_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
 * Optionnel iOS (Safari Web Push, dashboard OneSignal) :
 *   window.GOELO_ONESIGNAL_SAFARI_WEB_ID = "web.onesignal...";
 *
 * API exposée :
 *   goeloOneSignalInitPromise() → Promise<OneSignal|null>
 *   goeloRequestPushSubscription() → Promise<{ ok, ... }>  (à appeler après geste utilisateur)
 *   goeloSendNotification(type, payload)  et alias sendNotification()
 *   GOELO_NOTIFICATION_TYPES
 */
(function () {
  "use strict";

  var TYPES = {
    NEW_RIDE: "NEW_RIDE",
    RIDE_UPDATE: "RIDE_UPDATE",
    RIDE_CANCELLED: "RIDE_CANCELLED"
  };

  window.GOELO_NOTIFICATION_TYPES = TYPES;

  var initPromise = null;
  var oneSignalInstance = null;

  function getAppId() {
    var id = window.GOELO_ONESIGNAL_APP_ID;
    return id && String(id).trim() ? String(id).trim() : "";
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("load_failed:" + src));
      };
      document.head.appendChild(s);
    });
  }

  function isLocalhost() {
    var h = location.hostname || "";
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  /** Évite un clic « Activer » bloqué si init / optIn reste en attente (SW, réseau, iOS). */
  function raceTimeout(promise, ms, onTimeoutMsg) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(onTimeoutMsg || "timeout"));
      }, ms);
      Promise.resolve(promise).then(
        function (v) {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(v);
        },
        function (e) {
          if (done) return;
          done = true;
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  window.goeloOneSignalInitPromise = function goeloOneSignalInitPromise() {
    if (initPromise) return initPromise;
    var appId = getAppId();
    if (!appId) {
      initPromise = Promise.resolve(null);
      return initPromise;
    }

    initPromise = (async function () {
      return await new Promise(function (resolve) {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function (OneSignal) {
          try {
            var opts = {
              appId: appId
            };
            var swid = window.GOELO_ONESIGNAL_SAFARI_WEB_ID;
            if (swid && String(swid).trim()) {
              opts.safari_web_id = String(swid).trim();
            }
            if (isLocalhost()) {
              opts.allowLocalhostAsSecureOrigin = true;
            }
            await OneSignal.init(opts);
            oneSignalInstance = OneSignal;
            try {
              window.dispatchEvent(new CustomEvent("goelo-onesignal-ready", { detail: { OneSignal: OneSignal } }));
            } catch (evErr) {
              void evErr;
            }
            resolve(OneSignal);
          } catch (err) {
            console.warn("[GoëloRides] OneSignal : init échouée.", err);
            resolve(null);
          }
        });
        loadScript("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js").catch(function (e) {
          console.warn("[GoëloRides] OneSignal : chargement SDK impossible.", e);
          resolve(null);
        });
      });
    })();

    return initPromise;
  };

  /**
   * Demande d’activation push (uniquement après clic utilisateur).
   * Utilise l’API Notifications du SDK v16 si disponible, sinon repli navigateur.
   */
  window.goeloRequestPushSubscription = async function goeloRequestPushSubscription() {
    var OneSignal;
    try {
      OneSignal = await raceTimeout(window.goeloOneSignalInitPromise(), 25000, "init_timeout");
    } catch (toErr) {
      void toErr;
      return {
        ok: false,
        reason: "timeout",
        message:
          "OneSignal met trop longtemps à démarrer (réseau ou service worker). Ferme les onglets du site, recharge la page et réessaie."
      };
    }
    if (!OneSignal) {
      return { ok: false, reason: "no_onesignal", message: "App ID OneSignal non configuré." };
    }
    try {
      if (OneSignal.Notifications && typeof OneSignal.Notifications.requestPermission === "function") {
        var result = await OneSignal.Notifications.requestPermission();
        if (OneSignal.User && OneSignal.User.PushSubscription && typeof OneSignal.User.PushSubscription.optIn === "function") {
          try {
            await raceTimeout(OneSignal.User.PushSubscription.optIn(), 12000, "optin_timeout");
          } catch (optErr) {
            void optErr;
            /* Permission peut déjà être OK ; ne pas bloquer l’UI indéfiniment. */
          }
        }
        return { ok: true, result: result };
      }
      if (typeof Notification !== "undefined" && Notification.requestPermission) {
        var perm = await Notification.requestPermission();
        return { ok: perm === "granted", permission: perm };
      }
      return { ok: false, reason: "unsupported", message: "Notifications non supportées sur ce navigateur." };
    } catch (e) {
      console.warn("[GoëloRides] OneSignal : demande permission.", e);
      return { ok: false, reason: "error", error: e && e.message ? e.message : String(e) };
    }
  };

  /**
   * Enveloppe côté client pour les campagnes OneSignal (dashboard / REST).
   * Aucun envoi réel depuis le navigateur sans clé REST (voulu).
   */
  function goeloSendNotification(type, payload) {
    var t = type != null ? String(type) : "";
    var p = payload != null && typeof payload === "object" ? payload : {};
    var valid = Object.values(TYPES).indexOf(t) !== -1;
    var envelope = {
      type: t,
      payload: p,
      sentFromClient: false,
      hint:
        "Configurer les messages dans le tableau OneSignal (Segments / API REST) en t’appuyant sur le type et le payload documentés."
    };
    if (!valid && t) {
      envelope.warning = "Type inconnu — utiliser GOELO_NOTIFICATION_TYPES.";
    }
    if (typeof console !== "undefined" && console.info) {
      console.info("[GoëloRides] sendNotification (enveloppe OneSignal)", envelope);
    }
    return envelope;
  }

  window.goeloSendNotification = goeloSendNotification;
  if (typeof window.sendNotification !== "function") {
    window.sendNotification = goeloSendNotification;
  }

  void goeloOneSignalInitPromise();
})();
