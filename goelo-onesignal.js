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
 *   goeloRequestPushSubscription() → Promise<{ ok, reason?, permission?, message?, pendingFinalize? }>
 *       (permission native d’abord ; si accord : ok tout de suite, finalisation OneSignal en arrière-plan)
 *   goeloUnsupportedNotificationMessage() — texte explicite (surtout iPhone in-app sans `Notification`)
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

  (function goeloInjectOneSignalEarlyHints() {
    if (!getAppId()) return;
    try {
      if (document.documentElement.getAttribute("data-goelo-os-hints") === "1") return;
      document.documentElement.setAttribute("data-goelo-os-hints", "1");
    } catch (e) {
      return;
    }
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) return;
    try {
      if (!document.querySelector('link[data-goelo-preconnect="onesignal"]')) {
        var pre = document.createElement("link");
        pre.rel = "preconnect";
        pre.href = "https://cdn.onesignal.com";
        pre.setAttribute("data-goelo-preconnect", "onesignal");
        head.appendChild(pre);
      }
    } catch (e2) {
      void e2;
    }
    try {
      if (!document.querySelector('link[data-goelo-preload="onesignal-page"]')) {
        var pl = document.createElement("link");
        pl.rel = "preload";
        pl.as = "script";
        pl.href = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        pl.crossOrigin = "anonymous";
        pl.setAttribute("data-goelo-preload", "onesignal-page");
        head.appendChild(pl);
      }
    } catch (e3) {
      void e3;
    }
  })();

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
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

  function isLikelyIOSDevice() {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  /**
   * Message utilisateur quand l’API Notifications n’existe pas ou qu’aucune voie permission n’est dispo.
   * Sur iPhone, le cas le plus fréquent est le navigateur **in-app** (Instagram, Messenger…) : pas de `window.Notification`.
   */
  function goeloUnsupportedNotificationMessage() {
    if (isLikelyIOSDevice()) {
      return (
        "Tu suis sans doute le lien depuis Instagram, Messenger ou la messagerie : dans cette fenêtre, les notifications ne peuvent pas s’allumer.\n\n" +
        "Rien à installer : ouvre le site dans Safari (icône boussole), colle l’adresse ou tape-la, puis touche « Activer les notifications » sur la page. Sur iPhone récent, ça suffit — pas besoin d’ajouter une icône sur l’écran d’accueil.\n\n" +
        "(Si tu préfères un raccourci sur l’écran d’accueil, tu peux, mais ce n’est pas obligatoire.)"
      );
    }
    return (
      "Les notifications ne sont pas disponibles dans ce navigateur. Utilise une version récente de Safari, Chrome ou Firefox, sur une page HTTPS (pas une prévisualisation ou un WebView limité)."
    );
  }

  window.goeloUnsupportedNotificationMessage = goeloUnsupportedNotificationMessage;

  /** granted | denied | default — les navigateurs envoient parfois undefined / "" / "prompt". */
  function notificationPermNormalized() {
    if (typeof Notification === "undefined") return "";
    var p = Notification.permission;
    if (p === "granted" || p === "denied") return p;
    return "default";
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

  /** Délai max pour qu’init ne reste jamais bloquée indéfiniment (SW / réseau). */
  var INIT_ABSOLUTE_CAP_MS = 120000;
  /** Après la permission native : garde-fou si OneSignal.init n’est pas prête (SW / réseau). */
  var INIT_WAIT_AFTER_CLICK_MS = 60000;

  function startOneSignalInnerInit(appId) {
    return new Promise(function (resolve) {
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
  }

  window.goeloOneSignalInitPromise = function goeloOneSignalInitPromise() {
    if (initPromise) return initPromise;
    var appId = getAppId();
    if (!appId) {
      initPromise = Promise.resolve(null);
      return initPromise;
    }

    var inner = startOneSignalInnerInit(appId);
    initPromise = Promise.race([
      inner,
      new Promise(function (res) {
        setTimeout(function () {
          console.warn(
            "[GoëloRides] OneSignal : délai max d’init (" +
              INIT_ABSOLUTE_CAP_MS +
              " ms) — souvent réseau lent ou service worker bloqué."
          );
          res(null);
        }, INIT_ABSOLUTE_CAP_MS);
      })
    ]);

    return initPromise;
  };

  /**
   * Demande d’activation push (uniquement après clic utilisateur).
   * Boîte native dès que possible ; si la permission est accordée, retour ok immédiat et
   * OneSignal.init + optIn en arrière-plan (sans bloquer la disparition du bandeau).
   */
  window.goeloRequestPushSubscription = async function goeloRequestPushSubscription() {
    if (typeof Notification === "undefined") {
      return { ok: false, reason: "unsupported", message: goeloUnsupportedNotificationMessage() };
    }
    var permEarly = notificationPermNormalized();

    if (permEarly === "denied") {
      return {
        ok: false,
        reason: "permission_denied",
        permission: "denied",
        message:
          "Notifications refusées. Va dans Réglages → Safari pour autoriser ce site, puis recharge. (Option seulement : si tu as une icône Goëlo sur l’écran d’accueil, Réglages → Notifications.)"
      };
    }

    /** True si l’utilisateur vient d’obtenir « granted » via la boîte native (Promise), même si `Notification.permission` reste vide un instant (WebKit). */
    var nativeDialogGranted = false;
    if (typeof Notification !== "undefined" && typeof Notification.requestPermission === "function" && permEarly === "default") {
      var nperm;
      try {
        nperm = await raceTimeout(Notification.requestPermission(), 20000, "permission_timeout_native");
      } catch (pe0) {
        void pe0;
        return {
          ok: false,
          reason: "permission_timeout",
          message:
            "La demande de notification n’a pas abouti à temps. Recharge la page et réessaie."
        };
      }
      if (nperm === "denied") {
        return {
          ok: false,
          reason: "permission_denied",
          permission: "denied",
          message:
            "Notifications refusées. Va dans Réglages → Safari pour autoriser ce site, puis recharge. (Option seulement : si tu as une icône Goëlo sur l’écran d’accueil, Réglages → Notifications.)"
        };
      }
      if (nperm !== "granted") {
        return {
          ok: false,
          reason: "permission_not_granted",
          permission: nperm,
          message:
            "Les notifications ne sont pas activées. Réessaie et choisis « Autoriser » si une boîte de dialogue s’affiche."
        };
      }
      nativeDialogGranted = true;
    }

    /* Cas rare : pas de dialogue natif ou permission encore illisible — flux bloquant init + SDK. */
    if (!nativeDialogGranted && notificationPermNormalized() !== "granted") {
      var OneSignalSlow;
      try {
        OneSignalSlow = await raceTimeout(window.goeloOneSignalInitPromise(), INIT_WAIT_AFTER_CLICK_MS, "init_timeout");
      } catch (toErr) {
        void toErr;
        return {
          ok: false,
          reason: "timeout",
          message:
            "OneSignal met trop longtemps à démarrer (réseau ou service worker). Ferme les onglets du site, recharge la page et réessaie."
        };
      }
      if (!OneSignalSlow) {
        return {
          ok: false,
          reason: "no_onesignal",
          message:
            "OneSignal ne s’est pas lancé. Recharge la page et réessaie (connexion ou bloqueur de contenu)."
        };
      }
      try {
        if (OneSignalSlow.Notifications && typeof OneSignalSlow.Notifications.requestPermission === "function") {
          var result;
          try {
            result = await raceTimeout(OneSignalSlow.Notifications.requestPermission(), 60000, "permission_timeout");
          } catch (pe) {
            void pe;
            return {
              ok: false,
              reason: "permission_timeout",
              message:
                "La demande de notification n’a pas abouti à temps. Ferme les autres fenêtres du site, recharge la page et réessaie."
            };
          }
          var permNow = notificationPermNormalized() || "default";
          if (permNow !== "granted") {
            if (permNow === "denied") {
              return {
                ok: false,
                reason: "permission_denied",
                permission: "denied",
                message:
                  "Notifications refusées. Autorise ce site dans les réglages du navigateur (icône cadenas ou à gauche de l’adresse)."
              };
            }
            return {
              ok: false,
              reason: "permission_not_granted",
              permission: permNow,
              message:
                "Les notifications ne sont pas activées. Réessaie et choisis « Autoriser » si une boîte de dialogue s’affiche."
            };
          }
          void result;
        } else if (typeof Notification !== "undefined" && Notification.requestPermission) {
          var perm;
          try {
            perm = await raceTimeout(Notification.requestPermission(), 60000, "permission_timeout");
          } catch (pe2) {
            void pe2;
            return {
              ok: false,
              reason: "permission_timeout",
              message:
                "La demande de notification n’a pas abouti à temps. Recharge la page et réessaie."
            };
          }
          if (perm === "denied") {
            return {
              ok: false,
              reason: "permission_denied",
              permission: "denied",
              message:
                "Notifications refusées. Autorise ce site dans les réglages du navigateur (icône cadenas ou à gauche de l’adresse)."
            };
          }
          if (perm !== "granted") {
            return {
              ok: false,
              reason: "permission_not_granted",
              permission: perm,
              message:
                "Les notifications ne sont pas activées. Réessaie et choisis « Autoriser » si une boîte de dialogue s’affiche."
            };
          }
        } else {
          return { ok: false, reason: "unsupported", message: goeloUnsupportedNotificationMessage() };
        }

        if (OneSignalSlow.User && OneSignalSlow.User.PushSubscription && typeof OneSignalSlow.User.PushSubscription.optIn === "function") {
          try {
            await raceTimeout(OneSignalSlow.User.PushSubscription.optIn(), 20000, "optin_timeout");
          } catch (optErr) {
            void optErr;
          }
        }
        return { ok: true, permission: "granted" };
      } catch (e) {
        console.warn("[GoëloRides] OneSignal : demande permission.", e);
        return { ok: false, reason: "error", error: e && e.message ? e.message : String(e) };
      }
    }

    void (async function goeloFinalizeOneSignalPush() {
      try {
        var O = await raceTimeout(window.goeloOneSignalInitPromise(), INIT_WAIT_AFTER_CLICK_MS, "init_timeout");
        if (!O) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn(
              "[GoëloRides] OneSignal : permission accordée mais init absente — recharge la page pour finaliser l’abonnement push."
            );
          }
          return;
        }
        if (O.User && O.User.PushSubscription && typeof O.User.PushSubscription.optIn === "function") {
          try {
            await raceTimeout(O.User.PushSubscription.optIn(), 20000, "optin_timeout");
          } catch (optErr2) {
            void optErr2;
          }
        }
      } catch (bgErr) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[GoëloRides] OneSignal : finalisation push en arrière-plan.", bgErr);
        }
      }
    })();

    return { ok: true, permission: "granted", pendingFinalize: true };
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
