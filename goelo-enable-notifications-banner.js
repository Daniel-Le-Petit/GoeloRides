/**
 * Bandeau notifications (équivalent EnableNotificationsBanner) — site statique.
 * v2 : bouton explicite « Activer les notifications », mode refus (Safari / iOS) avec consignes,
 * pas d’alert sur simple refus — bascule vers le bandeau « réglages ».
 *
 * API : EnableNotificationsBanner.mount({ container?: HTMLElement })
 */
(function () {
  "use strict";

  /* Ancien snooze 7 jours (localStorage) : on retire pour que le bandeau réapparaisse après déploiement. */
  try {
    localStorage.removeItem("goelo_notify_snooze_until_v1");
  } catch (e) {
    void e;
  }

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
          var result = await Promise.race([
            O.Notifications.requestPermission(),
            new Promise(function (_, rej) {
              setTimeout(function () {
                rej(new Error("permission_timeout"));
              }, 60000);
            })
          ]);
          void result;
          var permAfter = typeof Notification !== "undefined" ? Notification.permission : "default";
          if (permAfter !== "granted") {
            if (permAfter === "denied") {
              return {
                ok: false,
                reason: "permission_denied",
                permission: "denied",
                message:
                  "Notifications refusées. Réglages → Safari pour autoriser ce site. (Option : icône sur l’écran d’accueil → Réglages → Notifications.)"
              };
            }
            return {
              ok: false,
              reason: "permission_not_granted",
              permission: permAfter,
              message:
                "Les notifications ne sont pas activées. Réessaie et choisis « Autoriser » si une boîte de dialogue s’affiche."
            };
          }
          if (O.User && O.User.PushSubscription && typeof O.User.PushSubscription.optIn === "function") {
            try {
              await Promise.race([
                O.User.PushSubscription.optIn(),
                new Promise(function (_, rej) {
                  setTimeout(function () {
                    rej(new Error("optin_timeout"));
                  }, 12000);
                })
              ]);
            } catch (optErr) {
              void optErr;
            }
          }
          return { ok: true, permission: "granted" };
        }
        if (typeof Notification !== "undefined" && Notification.requestPermission) {
          var perm = await Promise.race([
            Notification.requestPermission(),
            new Promise(function (_, rej) {
              setTimeout(function () {
                rej(new Error("permission_timeout"));
              }, 60000);
            })
          ]);
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
          return { ok: true, permission: perm };
        }
        return { ok: false, message: "Notifications non supportées.", reason: "unsupported" };
      } catch (e) {
        var errMsg = e && e.message ? e.message : String(e);
        if (errMsg === "permission_timeout") {
          return {
            ok: false,
            reason: "permission_timeout",
            message:
              "La demande de notification n’a pas abouti à temps. Recharge la page et réessaie."
          };
        }
        return { ok: false, message: errMsg, reason: "error" };
      }
    };
  }

  var STORAGE_DISMISS = "goelo_notify_banner_dismiss_v1";
  /* « Plus tard » : masque jusqu’à fermeture de l’onglet (pas 7 jours). */
  var SESSION_SNOOZE_TAB = "goelo_notify_snooze_tab_v1";
  /** Garde-fou : réactive le bouton si la promesse OneSignal ne se termine pas (réseau, onglet en arrière-plan). */
  var NOTIFY_CLICK_MAX_MS = 90000;

  function resetNotifyBannerPrimaryButton() {
    var bar = document.getElementById("goelo-enable-notifications-banner");
    if (!bar) return;
    var btn = bar.querySelector("#goelo-notify-enable");
    if (!btn) return;
    try {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    } catch (e) {
      void e;
    }
    try {
      delete bar._goeloNotifyInFlight;
    } catch (e2) {
      void e2;
    }
    var mode = bar.getAttribute("data-goelo-notify-mode") || "prompt";
    setBannerMode(bar, mode);
  }

  window.addEventListener(
    "pageshow",
    function (ev) {
      if (ev && ev.persisted) {
        resetNotifyBannerPrimaryButton();
      }
    },
    false
  );

  function isSnoozed() {
    try {
      return sessionStorage.getItem(SESSION_SNOOZE_TAB) === "1";
    } catch (e) {
      return false;
    }
  }

  /** Réaffiche le bandeau (console / support) : efface masquage définitif et snooze session. */
  window.GoeloNotificationsClearBannerState = function () {
    try {
      localStorage.removeItem(STORAGE_DISMISS);
    } catch (e) {
      void e;
    }
    try {
      localStorage.removeItem("goelo_notify_snooze_until_v1");
    } catch (e2) {
      void e2;
    }
    try {
      sessionStorage.removeItem(SESSION_SNOOZE_TAB);
    } catch (e3) {
      void e3;
    }
    resetNotifyBannerPrimaryButton();
  };

  function isDismissedForever() {
    try {
      return localStorage.getItem(STORAGE_DISMISS) === "1";
    } catch (e) {
      return false;
    }
  }

  function isAppleMobileOrTablet() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function setBannerMode(bar, mode) {
    bar.setAttribute("data-goelo-notify-mode", mode);
    var title = bar.querySelector("#goelo-notify-title");
    var hint = bar.querySelector("#goelo-notify-hint");
    var btnEn = bar.querySelector("#goelo-notify-enable");
    var btnLater = bar.querySelector("#goelo-notify-later");
    var retryMsg = bar.querySelector("#goelo-notify-retry");
    if (retryMsg) {
      retryMsg.textContent = "";
      retryMsg.hidden = true;
    }
    if (mode === "denied") {
      bar.classList.add("goelo-enable-notifications-banner--denied");
      if (isAppleMobileOrTablet()) {
        if (title) {
          title.textContent =
            "Active les notifications dans les réglages Safari pour recevoir les sorties.";
        }
        if (hint) {
          hint.innerHTML =
            "Va dans <strong>Réglages → Safari</strong> (sites web ou notifications pour ce site). Ce n’est <strong>pas obligatoire</strong> d’avoir une icône sur l’écran d’accueil : dans Safari ça marche aussi sur iPhone récent. Ensuite <strong>Réessayer</strong> ou recharge la page.";
          hint.hidden = false;
        }
      } else {
        if (title) {
          title.textContent = "Les notifications sont bloquées pour ce site.";
        }
        if (hint) {
          hint.textContent =
            "Dans la barre d’adresse, ouvre le menu du site (cadenas ou i) → autorise les notifications pour ce domaine, puis recharge la page si besoin.";
          hint.hidden = false;
        }
      }
      if (btnEn) {
        btnEn.textContent = "Réessayer";
        btnEn.setAttribute("aria-label", "Vérifier à nouveau les notifications après les réglages");
      }
      if (btnLater) {
        btnLater.textContent = "Masquer pour cette visite";
        btnLater.setAttribute("aria-label", "Masquer le bandeau jusqu’à la prochaine visite sur cet onglet");
      }
    } else {
      bar.classList.remove("goelo-enable-notifications-banner--denied");
      if (title) {
        title.textContent =
          "Ne manque aucune sortie : le bouton ci-dessous ouvre tout de suite la demande de notification du navigateur ou du téléphone.";
      }
      if (hint) {
        hint.textContent = "";
        hint.hidden = true;
      }
      if (btnEn) {
        btnEn.textContent = "Activer les notifications";
        btnEn.setAttribute(
          "aria-label",
          "Activer les notifications — déclenche la demande du téléphone ou du navigateur"
        );
      }
      if (btnLater) {
        btnLater.textContent = "Plus tard";
        btnLater.setAttribute("aria-label", "Masquer le bandeau pour cette visite");
      }
    }
  }

  function wireNotifyBanner(bar, initialMode) {
    var btnEn = bar.querySelector("#goelo-notify-enable");
    var btnLater = bar.querySelector("#goelo-notify-later");
    setBannerMode(bar, initialMode);

    if (btnLater) {
      btnLater.addEventListener("click", function () {
        try {
          sessionStorage.setItem(SESSION_SNOOZE_TAB, "1");
        } catch (e) {
          void e;
        }
        bar.remove();
      });
    }

    if (btnEn) {
      btnEn.addEventListener("click", async function () {
        var curMode = bar.getAttribute("data-goelo-notify-mode") || "prompt";
        if (bar._goeloNotifyInFlight) return;
        bar._goeloNotifyInFlight = true;
        btnEn.setAttribute("aria-busy", "true");
        btnEn.textContent = "Ouverture du dialogue…";
        try {
          var retryMsg = bar.querySelector("#goelo-notify-retry");
          if (retryMsg) {
            retryMsg.textContent = "";
            retryMsg.hidden = true;
          }
          var res;
          if (typeof window.goeloRequestPushSubscription === "function") {
            res = await Promise.race([
              window.goeloRequestPushSubscription(),
              new Promise(function (resolve) {
                setTimeout(function () {
                  resolve({
                    ok: false,
                    reason: "client_timeout",
                    message:
                      "C’est trop long. Recharge la page puis réessaie, ou vérifie la connexion."
                  });
                }, NOTIFY_CLICK_MAX_MS);
              })
            ]);
          } else {
            res = {
              ok: false,
              reason: "no_sdk",
              message: "Le module OneSignal n’est pas prêt. Réessaie ou recharge la page."
            };
          }
          if (res && res.ok) {
            try {
              localStorage.setItem(STORAGE_DISMISS, "1");
            } catch (e) {
              void e;
            }
            bar.remove();
            return;
          }
          if (res && res.reason === "permission_denied") {
            setBannerMode(bar, "denied");
            if (curMode === "denied" && retryMsg) {
              retryMsg.textContent =
                "Toujours bloqué : vérifie Réglages / Safari, puis recharge la page.";
              retryMsg.hidden = false;
            }
            return;
          }
          var msg =
            res && res.message
              ? res.message
              : res && res.reason === "no_onesignal"
                ? "Configuration OneSignal manquante (GOELO_ONESIGNAL_APP_ID)."
                : res && res.reason === "no_onesignal_after_grant"
                  ? "Permission enregistrée ; recharge la page pour finaliser les notifications."
                  : res && res.reason === "no_sdk"
                    ? "Le module OneSignal n’est pas prêt. Réessaie ou recharge la page."
                    : "Impossible d’activer les notifications. Réessaie ou vérifie les réglages du navigateur.";
          if (msg) window.alert(msg);
        } finally {
          if (btnEn) {
            try {
              btnEn.removeAttribute("aria-busy");
            } catch (fe) {
              void fe;
            }
          }
          try {
            delete bar._goeloNotifyInFlight;
          } catch (fe2) {
            void fe2;
          }
          if (bar.isConnected && btnEn && document.body.contains(btnEn)) {
            setBannerMode(bar, bar.getAttribute("data-goelo-notify-mode") || curMode);
          }
        }
      });
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

    var nv = typeof Notification !== "undefined" ? Notification.permission : "default";
    var initialMode = nv === "denied" ? "denied" : "prompt";

    var root = opts.container || document.body;
    var bar = document.createElement("aside");
    bar.id = "goelo-enable-notifications-banner";
    bar.className = "goelo-enable-notifications-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Notifications sorties");
    bar.innerHTML =
      '<div class="goelo-enable-notifications-banner__inner">' +
      '<p id="goelo-notify-title" class="goelo-enable-notifications-banner__text"></p>' +
      '<p id="goelo-notify-hint" class="goelo-enable-notifications-banner__hint" hidden></p>' +
      '<p id="goelo-notify-retry" class="goelo-enable-notifications-banner__retry" hidden></p>' +
      '<div class="goelo-enable-notifications-banner__actions">' +
      '<button type="button" class="goelo-enable-notifications-banner__btn goelo-enable-notifications-banner__btn--primary" id="goelo-notify-enable"></button>' +
      '<button type="button" class="goelo-enable-notifications-banner__btn goelo-enable-notifications-banner__btn--ghost" id="goelo-notify-later"></button>' +
      "</div></div>";

    root.appendChild(bar);
    wireNotifyBanner(bar, initialMode);

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
