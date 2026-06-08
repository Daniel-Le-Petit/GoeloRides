/**
 * Panneau de debug temporaire (OneSignal / iOS / Safari) — site statique.
 * Activer : `window.GOELO_DEBUG = true` dans la page **avant** ce script, puis recharger.
 * Retirer : supprimer ce fichier + les balises script associées + le flag.
 *
 * API : `showGoeloDebugPanel()` — affiche l’overlay (uniquement si `GOELO_DEBUG === true`).
 * Clic sur le panneau : suppression du DOM.
 */
(function () {
  "use strict";

  var PANEL_ID = "goelo-debug-panel-overlay";
  var AUTO_SHOW_MS = 2000;

  function detectIOS() {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "oui (" + (/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : "iPod") + ")";
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "oui (iPad desktop UA)";
    return "non";
  }

  function detectInAppBrowser() {
    var ua = navigator.userAgent || "";
    var patterns =
      /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Gmail|GoogleApp\/|LinkedInApp|Line\/|Snapchat|TikTok|Twitter| ; wv\)|MiuiBrowser\/.*;\s*wv\)/i;
    if (patterns.test(ua)) return "probable in-app (UA)";
    return "non détecté (UA)";
  }

  function notificationSupport() {
    return "Notification" in window ? "oui" : "non";
  }

  function notificationPermissionStr() {
    try {
      if (!("Notification" in window) || typeof Notification === "undefined") return "N/A (pas d’API)";
      return String(Notification.permission || "(vide)");
    } catch (e) {
      return "erreur lecture";
    }
  }

  function serviceWorkerSupport() {
    return "serviceWorker" in navigator ? "oui" : "non";
  }

  function oneSignalState() {
    if (typeof window.OneSignal === "undefined") return "not loaded";
    if (window.OneSignal === null) return "null";
    return "loaded (objet présent)";
  }

  function goeloRidesOneSignalReadyStr() {
    try {
      var g = window.GOELORIDES;
      if (!g || typeof g !== "object") return "(window.GOELORIDES absent)";
      if (!Object.prototype.hasOwnProperty.call(g, "oneSignalReady")) return "(oneSignalReady absent)";
      return String(g.oneSignalReady);
    } catch (e) {
      return "(erreur)";
    }
  }

  function goeloAppIdHint() {
    var id = window.GOELO_ONESIGNAL_APP_ID;
    if (!id || !String(id).trim()) return "GOELO_ONESIGNAL_APP_ID : absent";
    return "GOELO_ONESIGNAL_APP_ID : défini (" + String(id).trim().length + " car.)";
  }

  window.showGoeloDebugPanel = function showGoeloDebugPanel() {
    if (window.GOELO_DEBUG !== true) {
      return;
    }
    var old = document.getElementById(PANEL_ID);
    if (old) {
      try {
        old.remove();
      } catch (e) {
        void e;
      }
    }

    var ua = navigator.userAgent || "";
    var lines = [
      "GoëloRides — debug (tap / clic = fermer)",
      "—",
      "UA : " + ua,
      "iOS / iPadOS ? " + detectIOS(),
      "In-app (IG, FB, Gmail…) ? " + detectInAppBrowser(),
      "Notification API ? " + notificationSupport(),
      "Notification.permission : " + notificationPermissionStr(),
      "serviceWorker ? " + serviceWorkerSupport(),
      "window.OneSignal : " + oneSignalState(),
      "GOELORIDES.oneSignalReady : " + goeloRidesOneSignalReadyStr(),
      goeloAppIdHint(),
      "location : " + (function () {
        try {
          return String(location.href || "");
        } catch (e2) {
          return "?";
        }
      })()
    ];

    var el = document.createElement("div");
    el.id = PANEL_ID;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Panneau debug GoëloRides");
    el.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:0",
      "width:100%",
      "max-height:42vh",
      "overflow:auto",
      "box-sizing:border-box",
      "margin:0",
      "padding:10px",
      "background:#111",
      "color:#fff",
      "font-family:ui-monospace,Menlo,Consolas,monospace",
      "font-size:12px",
      "line-height:1.45",
      "z-index:999999",
      "border-top:3px solid #00ff88",
      "-webkit-overflow-scrolling:touch"
    ].join(";");

    var pre = document.createElement("pre");
    pre.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word;";
    pre.textContent = lines.join("\n");
    el.appendChild(pre);

    el.addEventListener(
      "click",
      function () {
        try {
          el.remove();
        } catch (e3) {
          void e3;
        }
      },
      false
    );

    try {
      document.body.appendChild(el);
    } catch (e4) {
      void e4;
    }
  };

  if (window.GOELO_DEBUG === true) {
    setTimeout(function () {
      if (typeof window.showGoeloDebugPanel === "function") {
        window.showGoeloDebugPanel();
      }
    }, AUTO_SHOW_MS);
  }
})();
