/**
 * GoëloRides — /js/home.js
 * Délègue l'UI rôle à goelo-ui.js ; gère logout et CTAs spécifiques homepage.
 */
(function () {
  "use strict";

  function _$(id) { return document.getElementById(id); }

  function _init() {
    var logoutBtn = _$("goelo-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        if (typeof window.goeloSignOut === "function") {
          window.goeloSignOut().then(function () { window.location.reload(); });
        }
      });
    }

    var heroCta = document.querySelector(".gr-hero-ctas .gr-btn--ghost[data-goelo-auth-trigger]");
    if (heroCta) heroCta.setAttribute("data-goelo-tr-cta", "");

    if (window.GoeloUI) {
      window.addEventListener("goelo:role-ready", function (e) {
        window.GoeloUI.syncRoleUI(e.detail);
      });
      if (!window.GOELO_AUTH_PENDING) {
        window.GoeloUI.syncRoleUI({ role: window.GOELO_ROLE, user: window.GOELO_USER });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }
})();
