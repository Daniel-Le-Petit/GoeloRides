/**
 * Bouton manuel « Activer les notifications » (complément au bandeau OneSignal).
 * Cible : #goelo-notif-btn et tout élément avec [data-goelo-notif-manual].
 * N’apparaît que si GOELO_ONESIGNAL_APP_ID est défini.
 */
(function () {
  "use strict";

  var WRAP_ID = "goelo-notif-manual-wrap";
  var STORAGE_DISMISS = "goelo_notify_banner_dismiss_v1";

  function getAppId() {
    var id = window.GOELO_ONESIGNAL_APP_ID;
    return id && String(id).trim() ? String(id).trim() : "";
  }

  function isAppleMobileOrTablet() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function currentPerm() {
    if (typeof Notification === "undefined") return "";
    var p = Notification.permission;
    if (p === "granted" || p === "denied") return p;
    return "default";
  }

  function safariDeniedHint() {
    return "Ouvre Réglages → Safari (notifications ou paramètres des sites web), ou Réglages → Notifications si GoëloRides est sur l’écran d’accueil, puis autorise les notifications pour ce site.";
  }

  function updateButtonUi(btn) {
    if (!btn || btn.getAttribute("data-goelo-notif-wired") !== "1") return;
    var root = btn.closest(".goelo-notif-manual");
    var hint = root ? root.querySelector(".goelo-notif-manual__hint") : null;
    if (typeof Notification === "undefined") {
      btn.disabled = true;
      btn.textContent = "Non disponible";
      return;
    }
    var p = currentPerm();
    if (p === "granted") {
      btn.disabled = true;
      btn.textContent = "Notifications activées";
      if (hint) hint.hidden = true;
      return;
    }
    if (p === "denied") {
      btn.disabled = false;
      btn.textContent = isAppleMobileOrTablet()
        ? "Activer via réglages iPhone"
        : "Réglages du navigateur";
      if (hint) hint.hidden = false;
      return;
    }
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-goelo-default-label") || "Activer les notifications";
    if (hint) hint.hidden = false;
  }

  function refreshAllWired() {
    document.querySelectorAll("[data-goelo-notif-wired=\"1\"]").forEach(updateButtonUi);
  }

  async function onManualClick(btn) {
    if (typeof Notification === "undefined") {
      window.alert("Ce navigateur ne gère pas les notifications pour les sites web.");
      return;
    }
    if (typeof window.goeloRequestPushSubscription !== "function") {
      window.alert("Le module notifications n’est pas chargé. Recharge la page.");
      return;
    }
    if (currentPerm() === "denied") {
      window.alert(isAppleMobileOrTablet() ? safariDeniedHint() : "Autorise les notifications pour ce site dans les réglages du navigateur (icône à gauche de l’adresse).");
      return;
    }
    if (btn._goeloManualBusy) return;
    btn._goeloManualBusy = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Ouverture du dialogue…";
    try {
      var res = await window.goeloRequestPushSubscription();
      if (res && res.ok) {
        try {
          localStorage.setItem(STORAGE_DISMISS, "1");
        } catch (e) {
          void e;
        }
        window.alert(
          "C’est bon : tu recevras les sorties, les changements importants et les annulations sur cet appareil."
        );
      } else if (res && res.reason === "permission_denied") {
        window.alert(isAppleMobileOrTablet() ? safariDeniedHint() : "Les notifications sont bloquées. Modifie les réglages du site pour les autoriser.");
      } else if (res && res.message) {
        window.alert(res.message);
      } else {
        window.alert("Impossible de finaliser pour le moment. Réessaie ou recharge la page.");
      }
    } catch (err) {
      console.warn("[GoëloRides] Bouton notifications manuel.", err);
      window.alert("Une erreur est survenue. Réessaie ou recharge la page.");
    } finally {
      btn.removeAttribute("aria-busy");
      try {
        delete btn._goeloManualBusy;
      } catch (e2) {
        void e2;
      }
      updateButtonUi(btn);
    }
  }

  function wireOne(btn) {
    if (!btn || btn.getAttribute("data-goelo-notif-wired") === "1") return;
    btn.setAttribute("data-goelo-notif-wired", "1");
    var lab = (btn.textContent || "Activer les notifications").trim();
    btn.setAttribute("data-goelo-default-label", lab);
    btn.addEventListener("click", function () {
      void onManualClick(btn);
    });
    updateButtonUi(btn);
  }

  function mount() {
    var wrap = document.getElementById(WRAP_ID);
    if (!getAppId()) {
      if (wrap) wrap.hidden = true;
      return;
    }
    if (wrap) wrap.removeAttribute("hidden");
    document.querySelectorAll("#goelo-notif-btn, [data-goelo-notif-manual]").forEach(function (el) {
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        wireOne(el);
      }
    });
  }

  window.addEventListener("goelo-onesignal-ready", refreshAllWired);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
