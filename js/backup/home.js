/**
 * GoëloRides — /js/home.js
 * ─────────────────────────────────────────────────────────────────
 * UI dynamique de la home page selon le rôle détecté par auth.js.
 * NE modifie PAS le design existant — adapte uniquement :
 *   • Le bouton "Se connecter" / "Mon espace"
 *   • La bannière Team Rider (onboarding)
 *   • Le bouton hero "Rejoindre en Team Rider"
 *   • L'accès au formulaire "Nouvelle sortie"
 *
 * Dépendance : auth.js doit être chargé AVANT home.js.
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  /* ── Attendre que le rôle soit résolu ──────────────────────── */
  function _onRoleReady(callback) {
    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      /* Rôle déjà connu (auth.js a tourné avant DOMContentLoaded) */
      callback({ role: window.GOELO_ROLE, user: window.GOELO_USER });
      return;
    }
    window.addEventListener("goelo:role-ready", function handler(e) {
      window.removeEventListener("goelo:role-ready", handler);
      callback(e.detail);
    }, { once: true });
  }

  /* ── Helpers DOM ───────────────────────────────────────────── */
  function _show(el) { if (el) el.hidden = false; }
  function _hide(el) { if (el) el.hidden = true; }
  function _setText(el, text) { if (el) el.textContent = text; }

  /* ══════════════════════════════════════════════════════════════
     RENDER PAR RÔLE
     ══════════════════════════════════════════════════════════════ */

  /**
   * visitor — état par défaut du HTML.
   * Rien à modifier, le HTML existant est déjà en état "visitor".
   * On s'assure juste que les éléments Team Rider sont masqués.
   */
  function _renderVisitor() {
    /* Bannière / aside Team Rider */
    var trBanner = document.getElementById("gr-teamrider-banner");
    _hide(trBanner);

    /* Bouton connexion dans le header */
    var connectBtn = document.querySelector(".gr-header-connect, [data-goelo-auth-trigger]");
    /* Déjà en état par défaut — on ne touche à rien */

    /* S'assurer que le bouton "Nouvelle sortie" est verrouillé */
    var newRouteBtn = document.querySelector(".btn-new-route, [data-new-route-trigger]");
    if (newRouteBtn) {
      newRouteBtn.setAttribute("data-goelo-auth-trigger", "");
      newRouteBtn.removeAttribute("data-open-new-route");
    }
  }

  /**
   * user — connecté mais sans accès Team Rider.
   * Affiche un message de bienvenue + bouton "Demander l'accès".
   */
  function _renderUser(user) {
    var pseudo = _getPseudo(user);

    /* Salutation dans le topbar si le slot existe */
    var greetingEl = document.querySelector(".goelo-auth-home-greeting");
    if (greetingEl) {
      greetingEl.textContent = "Bonjour, " + pseudo + " \uD83D\uDC4B";
      greetingEl.hidden = false;
    }

    /* Remplacer le bouton "Se connecter" par "Mon profil" */
    var connectBtn = document.querySelector(".gr-header-connect");
    if (connectBtn) {
      connectBtn.textContent = pseudo;
      connectBtn.removeAttribute("data-goelo-auth-trigger");
      connectBtn.href = "gestion-team-rider.html";
    }

    /* Bouton hero "Rejoindre en Team Rider" → demande d'accès */
    var trBtn = document.querySelector("[data-goelo-auth-trigger].home-hero-tr");
    if (trBtn) {
      trBtn.textContent = "Demander l'acc\u00e8s Team Rider";
      trBtn.removeAttribute("data-goelo-auth-trigger");
      trBtn.href = "gestion-team-rider.html";
    }
  }

  /**
   * teamrider — accès complet à la gestion des sorties.
   * Cache l'onboarding, déverrouille les actions.
   */
  function _renderTeamRider(user) {
    var pseudo = _getPseudo(user);

    /* Salutation */
    var greetingEl = document.querySelector(".goelo-auth-home-greeting");
    if (greetingEl) {
      greetingEl.textContent = "Team Rider \u2014 " + pseudo;
      greetingEl.hidden = false;
    }

    /* Header : lien vers le cockpit */
    var connectBtn = document.querySelector(".gr-header-connect");
    if (connectBtn) {
      connectBtn.textContent = "\uD83D\uDEB4 " + pseudo;
      connectBtn.removeAttribute("data-goelo-auth-trigger");
      connectBtn.href = "team-rider.html";
    }

    /* Bouton hero "Rejoindre" → cockpit */
    var trBtns = document.querySelectorAll("[data-goelo-auth-trigger]");
    trBtns.forEach(function (btn) {
      if (btn.classList.contains("home-hero-tr") ||
          btn.textContent.indexOf("Team Rider") !== -1) {
        btn.textContent = "Mon cockpit Team Rider";
        btn.removeAttribute("data-goelo-auth-trigger");
        btn.href = "team-rider.html";
      }
    });

    /* Déverrouiller le bouton "Nouvelle sortie" */
    var newRouteBtn = document.querySelector(".btn-new-route, [data-new-route-trigger]");
    if (newRouteBtn) {
      newRouteBtn.removeAttribute("data-goelo-auth-trigger");
      newRouteBtn.setAttribute("data-open-new-route", "");
    }

    /* Déverrouiller le lien "Créer une sortie" dans la nav */
    var createLink = document.querySelector(".gr-nav__cta, a[href='gestion-sorties.html']");
    if (createLink) {
      createLink.removeAttribute("data-goelo-auth-trigger");
      createLink.classList.remove("is-locked");
      var lockIcon = createLink.querySelector(".gr-nav__cta-lock");
      if (lockIcon) lockIcon.textContent = "+";
    }

    /* Cache la bannière onboarding si elle existe */
    var onboarding = document.getElementById("gr-teamrider-banner");
    _hide(onboarding);

    /* Déverrouiller l'aside sorties si présent */
    var aside = document.getElementById("so-aside");
    if (aside) {
      aside.classList.add("is-unlocked");
      var lockDiv = aside.querySelector(".so-aside__lock");
      if (lockDiv) lockDiv.textContent = "\u2713";
    }
  }

  /**
   * admin — tous les droits + redirection si sur index.
   */
  function _renderAdmin(user) {
    /* Appliquer d'abord tout ce que teamrider a */
    _renderTeamRider(user);

    /* Mettre à jour le label */
    var greetingEl = document.querySelector(".goelo-auth-home-greeting");
    if (greetingEl) {
      greetingEl.textContent = "\uD83D\uDC51 Admin \u2014 " + _getPseudo(user);
    }

    var connectBtn = document.querySelector(".gr-header-connect");
    if (connectBtn) {
      connectBtn.textContent = "\uD83D\uDC51 Admin";
      connectBtn.href = "admin.html";
    }

    /* Redirection automatique vers admin.html si on est sur index */
    var path = window.location.pathname;
    if (path.endsWith("index.html") || path === "/" || path.endsWith("/")) {
      window.location.href = "admin.html";
    }
  }

  /* ── Pseudo ────────────────────────────────────────────────── */
  function _getPseudo(user) {
    if (!user) return "Rider";
    return (user.user_metadata && user.user_metadata.pseudo)
      || (user.user_metadata && user.user_metadata.name)
      || (user.email ? user.email.split("@")[0] : "Rider");
  }

  /* ══════════════════════════════════════════════════════════════
     DISPATCH PAR RÔLE
     ══════════════════════════════════════════════════════════════ */
  function _applyRole(detail) {
    var role = detail.role || "visitor";
    var user = detail.user || null;

    switch (role) {
      case "admin":      _renderAdmin(user);      break;
      case "teamrider":  _renderTeamRider(user);  break;
      case "user":       _renderUser(user);        break;
      default:           _renderVisitor();         break;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════ */
  function _init() {
    /* Rendre visitor d'abord (état stable avant que le rôle arrive) */
    _renderVisitor();

    /* Attendre le rôle résolu par auth.js */
    _onRoleReady(function (detail) {
      _applyRole(detail);
    });

    /* Re-appliquer si le rôle change (connexion / déconnexion) */
    window.addEventListener("goelo:role-ready", function (e) {
      _applyRole(e.detail);
    });

    /* Bouton déconnexion si présent */
    var logoutBtn = document.getElementById("goelo-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        var sb = window.goeloGetSb ? window.goeloGetSb() : null;
        if (sb) await sb.auth.signOut();
        window.GOELO_ROLE = "visitor";
        window.GOELO_USER = null;
        window.location.reload();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})(); 
