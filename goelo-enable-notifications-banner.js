/**
 * Équivalent du composant React « EnableNotificationsBanner » — site statique sans build.
 * Bandeau discret ; permission uniquement au clic sur « Activer ».
 *
 * API : EnableNotificationsBanner.mount({ container?: HTMLElement })
 */
(function () {
  "use strict";

  async function waitForOneSignalSdk(maxMs) {
    var step = 80;
    var deadline = Date.now() + (typeof maxMs === "number" ? maxMs : 12000);
    while (Date.now() < deadline) {
      if (window.OneSignal) return window.OneSignal;
      await new Promise(function (r) {
        setTimeout(r, step);
      });
    }
    return window.OneSignal || null;
  }

  if (typeof window.goeloRequestPushSubscription !== "function") {
    window.goeloRequestPushSubscription = async function goeloRequestPushSubscription() {
      var O = await waitForOneSignalSdk(12000);
      if (!O) {
        return {
          ok: false,
          message:
            "Le module OneSignal n’est pas prêt (réseau lent ou bloqueur). Réessaie dans quelques secondes ou recharge la page.",
          reason: "no_sdk"
        };
      }
      try {
        if (O.Notifications && typeof O.Notifications.requestPermission === "function") {
          var result = await O.Notifications.requestPermission();
          if (O.User && O.User.PushSubscription && typeof O.User.PushSubscription.optIn === "function") {
            try {
              await O.User.PushSubscription.optIn();
            } catch (optErr) {
              void optErr;
            }
          }
          return { ok: true, result: result };
        }
        if (typeof Notification !== "undefined" && Notification.requestPermission) {
          var perm = await Notification.requestPermission();
          return { ok: perm === "granted", permission: perm };
        }
        return { ok: false, message: "Notifications non supportées.", reason: "unsupported" };
      } catch (e) {
        return { ok: false, message: e && e.message ? e.message : String(e), reason: "error" };
      }
    };
  }

  var STORAGE_DISMISS = "goelo_notify_banner_dismiss_v1";
  var STORAGE_SNOOZE_UNTIL = "goelo_notify_snooze_until_v1";
  var SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

  function readSnoozeUntil() {
    try {
      var n = parseInt(localStorage.getItem(STORAGE_SNOOZE_UNTIL) || "0", 10);
      return Number.isFinite(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function isSnoozed() {
    return Date.now() < readSnoozeUntil();
  }

  function isDismissedForever() {
    try {
      return localStorage.getItem(STORAGE_DISMISS) === "1";
    } catch (e) {
      return false;
    }
  }

  function shouldShow() {
    if (!window.GOELO_ONESIGNAL_APP_ID || !String(window.GOELO_ONESIGNAL_APP_ID).trim()) {
      return false;
    }
    if (isDismissedForever()) return false;
    if (isSnoozed()) return false;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      return false;
    }
    return true;
  }

  function mount(opts) {
    opts = opts || {};
    if (!shouldShow()) return null;
    if (document.getElementById("goelo-enable-notifications-banner")) return document.getElementById("goelo-enable-notifications-banner");

    var root = opts.container || document.body;
    var bar = document.createElement("aside");
    bar.id = "goelo-enable-notifications-banner";
    bar.className = "goelo-enable-notifications-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Notifications sorties");
    bar.innerHTML =
      '<div class="goelo-enable-notifications-banner__inner">' +
      '<p class="goelo-enable-notifications-banner__text">Active les notifications pour être informé des sorties GoëloRides</p>' +
      '<div class="goelo-enable-notifications-banner__actions">' +
      '<button type="button" class="goelo-enable-notifications-banner__btn goelo-enable-notifications-banner__btn--primary" id="goelo-notify-enable">Activer</button>' +
      '<button type="button" class="goelo-enable-notifications-banner__btn goelo-enable-notifications-banner__btn--ghost" id="goelo-notify-later">Plus tard</button>' +
      "</div></div>";

    root.appendChild(bar);

    var btnEn = bar.querySelector("#goelo-notify-enable");
    var btnLater = bar.querySelector("#goelo-notify-later");

    if (btnLater) {
      btnLater.addEventListener("click", function () {
        try {
          localStorage.setItem(STORAGE_SNOOZE_UNTIL, String(Date.now() + SNOOZE_MS));
        } catch (e) {
          void e;
        }
        bar.remove();
      });
    }

    if (btnEn) {
      btnEn.addEventListener("click", async function () {
        btnEn.disabled = true;
        var res = await window.goeloRequestPushSubscription();
        if (res && res.ok) {
          try {
            localStorage.setItem(STORAGE_DISMISS, "1");
          } catch (e) {
            void e;
          }
          bar.remove();
          return;
        }
        btnEn.disabled = false;
        var msg =
          res && res.message
            ? res.message
            : res && res.reason === "no_onesignal"
              ? "Configuration OneSignal manquante (GOELO_ONESIGNAL_APP_ID)."
              : "Impossible d’activer les notifications. Réessaie ou vérifie les réglages du navigateur.";
        window.alert(msg);
      });
    }

    return bar;
  }

  function unmount() {
    var el = document.getElementById("goelo-enable-notifications-banner");
    if (el) el.remove();
  }

  window.EnableNotificationsBanner = {
    mount: mount,
    unmount: unmount
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mount();
    });
  } else {
    mount();
  }
})();
