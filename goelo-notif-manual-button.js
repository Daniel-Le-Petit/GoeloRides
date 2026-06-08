/**
 * Bouton principal notifications (#goelo-notif-btn) + aide (#goelo-notif-help).
 * iOS in-app (Instagram, etc.) : pas d’API Notification — rangée #goelo-notif-inapp-actions
 * (lien Safari nouvel onglet, copier, partager) pour sortir du WebView.
 *
 * API : window.goeloInitNotifications() — ré-exécute le câblage (ex. contenu injecté après coup).
 */
(function () {
  "use strict";

  var WRAP_ID = "goelo-notif-manual-wrap";
  var HELP_ID = "goelo-notif-help";
  var INAPP_ROW_ID = "goelo-notif-inapp-actions";
  var STORAGE_DISMISS = "goelo_notify_banner_dismiss_v1";

  var HELP_DESKTOP =
    "Reçois les sorties, les changements et les annulations en temps réel.";
  var HELP_IOS_ONBOARD =
    "Appareil iOS : si tu as déjà refusé, aucune nouvelle fenêtre ne s’ouvrira — passe par Réglages → Safari (sites web / notifications), puis réessaie.";
  var HELP_DENIED_IOS =
    "Notifications bloquées pour ce site. Ouvre Réglages → Safari (ou Réglages → Notifications si GoëloRides est sur l’écran d’accueil), autorise ce site, puis recharge la page.";
  var HELP_DENIED_DESKTOP =
    "Notifications bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l’adresse), puis recharge la page.";
  var HELP_IOS_NO_API_INAPP =
    "Tu n’es probablement pas dans le Safari du système (Instagram, Messenger, Mail… masquent la vraie fenêtre Safari). Descends : touche « Ouvrir dans Safari » ou « Copier le lien », puis réessaie « Activer les notifications » une fois dans Safari.";
  var HELP_IOS_NO_API_OTHER =
    "Ce mode ne permet pas les notifications web ici. Si tu es déjà dans l’app Safari : mets iOS à jour (16.4+), ferme la navigation privée, recharge la page ou rouvre l’URL dans un nouvel onglet. Sinon utilise les boutons ci-dessous.";

  var inAppEscapeWired = false;

  function getAppId() {
    var id = window.GOELO_ONESIGNAL_APP_ID;
    return id && String(id).trim() ? String(id).trim() : "";
  }

  function isIOSClassicUa() {
    var ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua);
  }

  function isAppleMobileOrTablet() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  /** UA typique d’un WebView intégré (Instagram, Messenger, etc.). */
  function isLikelyInAppEmbeddedBrowser() {
    var ua = navigator.userAgent || "";
    return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|Twitter|TikTok|Snapchat|LinkedInApp|Messenger|GSA\/|; wv\)/i.test(ua);
  }

  function isIOSLikeForHelp() {
    return isIOSClassicUa() || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function getAbsolutePageUrl() {
    try {
      return String(location.href || "");
    } catch (e) {
      return "";
    }
  }

  function currentPerm() {
    if (typeof Notification === "undefined") return "";
    var p = Notification.permission;
    if (p === "granted" || p === "denied") return p;
    return "default";
  }

  function findHelpForButton(btn) {
    if (!btn) return null;
    var byId = document.getElementById(HELP_ID);
    if (byId && (btn === document.getElementById("goelo-notif-btn") || byId.closest(".goelo-notif-manual") === btn.closest(".goelo-notif-manual"))) {
      return byId;
    }
    var root = btn.closest(".goelo-notif-manual");
    if (root) {
      var h = root.querySelector("#" + HELP_ID) || root.querySelector(".goelo-notif-manual__hint");
      if (h) return h;
    }
    return document.getElementById(HELP_ID);
  }

  function applyHelpLine(btn, perm) {
    var help = findHelpForButton(btn);
    if (!help) return;
    if (perm === "denied") {
      help.textContent = isAppleMobileOrTablet() ? HELP_DENIED_IOS : HELP_DENIED_DESKTOP;
      help.hidden = false;
      return;
    }
    if (perm === "granted") {
      help.hidden = true;
      return;
    }
    help.hidden = false;
    help.textContent = isIOSLikeForHelp() ? HELP_IOS_ONBOARD : HELP_DESKTOP;
  }

  function alertIOSDeniedDetailed() {
    window.alert(
      "Notifications bloquées pour ce site.\n\n" +
        "Sur iPhone ou iPad :\n" +
        "• Réglages → Safari → (Notifications, ou Avancé / données des sites web selon ta version)\n" +
        "• Si GoëloRides est sur l’écran d’accueil : Réglages → Notifications → GoëloRides\n\n" +
        "Ensuite recharge cette page et réappuie sur le bouton."
    );
  }

  function alertDesktopDenied() {
    window.alert(
      "Notifications bloquées pour ce site.\n\n" +
        "Ouvre les réglages du site dans la barre d’adresse (cadenas ou icône « i »), autorise les notifications pour ce domaine, puis recharge la page."
    );
  }

  async function copyPageUrlToClipboard() {
    var u = getAbsolutePageUrl();
    if (!u) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(u);
        window.alert(
          "Lien copié.\n\nOuvre Safari, colle dans la barre d’adresse, valide, puis touche « Activer les notifications » sur la page."
        );
        return;
      }
    } catch (e) {
      void e;
    }
    try {
      window.prompt("Copie ce lien puis ouvre-le dans Safari :", u);
    } catch (e2) {
      window.alert(u);
    }
  }

  async function sharePageUrlSheet() {
    var u = getAbsolutePageUrl();
    if (!u || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title: document.title || "GoëloRides",
        text: "Ouvre dans Safari pour activer les notifications.",
        url: u
      });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      void e;
    }
  }

  function wireInAppEscapeOnce() {
    if (inAppEscapeWired) return;
    var copyBtn = document.getElementById("goelo-notif-copy-link");
    var shareBtn = document.getElementById("goelo-notif-share-link");
    if (!copyBtn && !shareBtn) return;
    inAppEscapeWired = true;
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        void copyPageUrlToClipboard();
      });
    }
    if (shareBtn) {
      shareBtn.addEventListener("click", function () {
        void sharePageUrlSheet();
      });
    }
  }

  function syncInAppEscapeUi() {
    var row = document.getElementById(INAPP_ROW_ID);
    if (!row) return;
    wireInAppEscapeOnce();
    var show = typeof Notification === "undefined" && isAppleMobileOrTablet() && !!getAppId();
    row.hidden = !show;
    if (!show) return;
    var u = getAbsolutePageUrl();
    var a = document.getElementById("goelo-notif-open-safari");
    if (a && u) {
      a.href = u;
    }
    var shareBtn = document.getElementById("goelo-notif-share-link");
    if (shareBtn) {
      shareBtn.hidden = typeof navigator.share !== "function";
    }
  }

  function updateButtonUi(btn) {
    if (!btn || btn.getAttribute("data-goelo-notif-wired") !== "1") return;
    if (typeof Notification === "undefined") {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.add("goelo-notif-manual__btn--needs-safari");
      btn.textContent = isAppleMobileOrTablet()
        ? isLikelyInAppEmbeddedBrowser()
          ? "Ouvrir dans Safari ↓"
          : "Safari / iOS : voir aide ↓"
        : "Notifications : navigateur limité";
      var help0 = findHelpForButton(btn);
      if (help0) {
        help0.hidden = false;
        if (isAppleMobileOrTablet()) {
          help0.textContent = isLikelyInAppEmbeddedBrowser() ? HELP_IOS_NO_API_INAPP : HELP_IOS_NO_API_OTHER;
        } else {
          help0.textContent = "Ce navigateur ne fournit pas l’API notifications pour les sites web. Essaie Safari, Chrome ou Firefox récent.";
        }
      }
      syncInAppEscapeUi();
      return;
    }
    btn.classList.remove("goelo-notif-manual__btn--needs-safari");
    var p = currentPerm();
    if (p === "granted") {
      btn.disabled = true;
      btn.textContent = "✔ Notifications activées";
      applyHelpLine(btn, "granted");
      syncInAppEscapeUi();
      return;
    }
    if (p === "denied") {
      btn.disabled = false;
      btn.textContent = isAppleMobileOrTablet() ? "Réglages Safari / iOS" : "Réglages du navigateur";
      applyHelpLine(btn, "denied");
      syncInAppEscapeUi();
      return;
    }
    btn.disabled = false;
    btn.textContent = btn.getAttribute("data-goelo-default-label") || "🚴 Activer les notifications";
    applyHelpLine(btn, "default");
    syncInAppEscapeUi();
  }

  function refreshAllWired() {
    document.querySelectorAll("[data-goelo-notif-wired=\"1\"]").forEach(updateButtonUi);
  }

  async function onManualClick(btn) {
    if (typeof Notification === "undefined") {
      if (isAppleMobileOrTablet()) {
        syncInAppEscapeUi();
        var rowEl = document.getElementById(INAPP_ROW_ID);
        if (rowEl && !rowEl.hidden) {
          try {
            rowEl.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch (se) {
            void se;
          }
          window.alert(
            isLikelyInAppEmbeddedBrowser()
              ? "Les notifications web ne fonctionnent pas dans ce navigateur intégré.\n\nUtilise les boutons juste en dessous : « Ouvrir dans Safari » ou « Copier le lien »."
              : "Ce mode ne permet pas les notifications web ici.\n\nSi tu es dans Safari : mets à jour vers iOS 16.4+, ferme la navigation privée, recharge la page ou copie l’URL dans un nouvel onglet. Sinon utilise les boutons ci-dessous."
          );
        } else {
          window.alert(
            typeof window.goeloUnsupportedNotificationMessage === "function"
              ? window.goeloUnsupportedNotificationMessage()
              : "Ce navigateur ne gère pas les notifications pour les sites web."
          );
        }
      } else {
        window.alert(
          typeof window.goeloUnsupportedNotificationMessage === "function"
            ? window.goeloUnsupportedNotificationMessage()
            : "Ce navigateur ne gère pas les notifications pour les sites web."
        );
      }
      return;
    }
    if (typeof window.goeloRequestPushSubscription !== "function") {
      window.alert("Le module notifications n’est pas chargé. Recharge la page.");
      return;
    }

    if (currentPerm() === "denied") {
      if (isAppleMobileOrTablet()) {
        alertIOSDeniedDetailed();
      } else {
        alertDesktopDenied();
      }
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
        window.alert("🚴 Parfait ! Tu recevras les sorties GoëloRides, les changements importants et les annulations sur cet appareil.");
      } else if (res && res.reason === "permission_denied") {
        if (isAppleMobileOrTablet()) {
          alertIOSDeniedDetailed();
        } else {
          alertDesktopDenied();
        }
      } else if (res && res.reason === "permission_not_granted") {
        window.alert(
          "Tu n’as pas choisi « Autoriser » (ou la fenêtre s’est fermée). Réessaie quand tu veux — le bouton reste disponible."
        );
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
    var lab = (btn.textContent || "🚴 Activer les notifications").trim();
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
    syncInAppEscapeUi();
  }

  window.goeloInitNotifications = function goeloInitNotifications() {
    mount();
    refreshAllWired();
  };

  window.addEventListener("goelo-onesignal-ready", refreshAllWired);

  window.addEventListener(
    "pageshow",
    function (ev) {
      if (ev && ev.persisted) {
        refreshAllWired();
      }
    },
    false
  );

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      refreshAllWired();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
