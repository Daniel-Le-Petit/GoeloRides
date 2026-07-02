/**
 * GoëloRides — /js/home.js
 * Délègue l'UI rôle à goelo-ui.js ; gère logout et CTAs spécifiques homepage.
 */
(function () {
  "use strict";

  function _$(id) { return document.getElementById(id); }

  function _setLogoutLoading(isLoading) {
    document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      btn.disabled = !!isLoading;
      btn.classList.toggle("is-logging-out", !!isLoading);
      var label = btn.querySelector("[data-goelo-logout-label]");
      var spinner = btn.querySelector("[data-goelo-logout-spinner]");
      if (label) label.hidden = !!isLoading;
      if (spinner) spinner.hidden = !isLoading;
    });
  }

  function _handleLogoutClick() {
    if (document.querySelector("[data-goelo-logout-btn]:disabled")) return;

    if (typeof closeMobileMenu === "function") {
      try { closeMobileMenu(); } catch (e) { void e; }
    }

    _setLogoutLoading(true);

    var signOut = window.goeloSignOut;
    if (typeof signOut !== "function") {
      console.warn("[GoëloHome] goeloSignOut indisponible — redirection directe");
      window.location.href = "/";
      return;
    }

    signOut({ redirect: "/" }).catch(function (err) {
      console.warn("[GoëloHome] déconnexion — erreur finale, redirection forcée", err);
      window.location.href = "/";
    });
  }

  function _bindLogoutButtons() {
    document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      if (btn.dataset.goeloLogoutBound === "1") return;
      btn.dataset.goeloLogoutBound = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        _handleLogoutClick();
      });
    });
  }

  function _init() {
    _bindLogoutButtons();

    var heroCta = document.querySelector(".gr-hero-ctas .gr-btn--ghost[data-goelo-auth-trigger]");
    if (heroCta) heroCta.setAttribute("data-goelo-tr-cta", "");

    function onAuthUi(detail) {
      if (window.GoeloUI) window.GoeloUI.syncRoleUI(detail);
      _bindLogoutButtons();
    }

    window.addEventListener("goelo:role-ready", function (e) {
      onAuthUi(e.detail);
    });
    window.addEventListener("goelo:auth-success", function (e) {
      onAuthUi(e.detail);
    });

    window.addEventListener("goelo:auth-state", function (e) {
      onAuthUi(e.detail);
    });

    if (window.GoeloUI) {
      if (window.GoeloUI.catchUpRoleUI) window.GoeloUI.catchUpRoleUI();
      else if (!window.GOELO_AUTH_PENDING) {
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
