/**
 * GoëloRides — /js/home.js
 * ═══════════════════════════════════════════════════════════════
 * UI dynamique de la home page selon le rôle résolu par auth.js.
 *
 * Ce fichier NE modifie PAS le design — il adapte uniquement :
 *   • Le bouton header "Se connecter"
 *   • Le bouton hero "Rejoindre en Team Rider"
 *   • L'accès au formulaire "Nouvelle sortie"
 *   • La bannière / aside Team Rider
 *
 * Dépendance : auth.js chargé AVANT home.js.
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  "use strict";

  /* ── Helpers DOM ─────────────────────────────────────────── */
  function _$(id)        { return document.getElementById(id); }
  function _q(sel)       { return document.querySelector(sel); }
  function _qa(sel)      { return document.querySelectorAll(sel); }
  function _hide(el)     { if (el) el.hidden = true; }
  function _show(el)     { if (el) el.hidden = false; }
  function _text(el, t)  { if (el) el.textContent = t; }

  /* Pseudo depuis l'objet user Supabase */
  function _pseudo(user) {
    if (!user) return "Rider";
    var um = user.user_metadata || {};
    return um.pseudo || um.name || (user.email ? user.email.split("@")[0] : "Rider");
  }

  /* ════════════════════════════════════════════════════════════
     RENDERS PAR RÔLE
     ════════════════════════════════════════════════════════════ */

  /**
   * visitor — état par défaut.
   * Rien à changer dans le HTML ; on s'assure simplement que les
   * éléments réservés sont bien masqués.
   */
  function _renderVisitor() {
    /* Éléments visibles seulement si connecté */
    _hide(_$("goelo-user-greeting"));
    _hide(_$("goelo-logout-btn"));

    /* Bouton header : "Se connecter" (état HTML par défaut) */
    var btn = _q(".gr-header-connect, [data-goelo-connect-btn]");
    if (btn) {
      btn.textContent = "Se connecter";
      btn.setAttribute("data-goelo-auth-trigger", "");
      btn.removeAttribute("href");
      btn.onclick = null;
    }

    /* Bouton hero TR : état verrouillé par défaut dans le HTML */
  }

  /**
   * user — connecté, pas encore Team Rider.
   * Affiche le pseudo + invite à demander l'accès TR.
   */
  function _renderUser(user) {
    var pseudo = _pseudo(user);

    /* Salutation */
    var greeting = _$("goelo-user-greeting");
    if (greeting) { _text(greeting, "Bonjour, " + pseudo + " 👋"); _show(greeting); }

    /* Header : pseudo → lien profil ou formulaire demande */
    var btn = _q(".gr-header-connect, [data-goelo-connect-btn]");
    if (btn) {
      _text(btn, pseudo);
      btn.removeAttribute("data-goelo-auth-trigger");
      btn.href = "gestion-team-rider.html";
    }

    /* Bouton logout */
    _show(_$("goelo-logout-btn"));

    /* Bouton hero "Rejoindre" → demande d'accès */
    _qa("[data-goelo-tr-cta]").forEach(function (el) {
      _text(el, "Demander l'accès Team Rider");
      el.removeAttribute("data-goelo-auth-trigger");
      if (el.tagName === "A") el.href = "gestion-team-rider.html";
      else el.onclick = function () { window.location.href = "gestion-team-rider.html"; };
    });

    /* Masquer bannière onboarding si présente */
    _hide(_$("gr-teamrider-banner"));
  }

  /**
   * team_rider — accès complet.
   * Déverrouille les boutons d'action et redirige vers le cockpit.
   */
  function _renderTeamRider(user) {
    var pseudo = _pseudo(user);

    /* Salutation */
    var greeting = _$("goelo-user-greeting");
    if (greeting) { _text(greeting, "🚴 " + pseudo); _show(greeting); }

    /* Header */
    var btn = _q(".gr-header-connect, [data-goelo-connect-btn]");
    if (btn) {
      _text(btn, "Mon cockpit");
      btn.removeAttribute("data-goelo-auth-trigger");
      btn.href = "team-rider.html";
    }

    /* Logout */
    _show(_$("goelo-logout-btn"));

    /* Boutons hero TR → cockpit */
    _qa("[data-goelo-tr-cta]").forEach(function (el) {
      _text(el, "Mon cockpit Team Rider →");
      el.removeAttribute("data-goelo-auth-trigger");
      if (el.tagName === "A") el.href = "team-rider.html";
      else el.onclick = function () { window.location.href = "team-rider.html"; };
    });

    /* Déverrouiller le bouton "Nouvelle sortie" */
    _qa(".btn-new-route, [data-new-route-trigger]").forEach(function (el) {
      el.removeAttribute("data-goelo-auth-trigger");
      el.setAttribute("data-open-new-route", "");
    });

    /* Déverrouiller le lien "Créer une sortie" dans la nav */
    var createLink = _q(".gr-nav__cta, a[href='gestion-sorties.html']");
    if (createLink) {
      createLink.removeAttribute("data-goelo-auth-trigger");
      createLink.classList.remove("is-locked");
      var lock = createLink.querySelector(".gr-nav__cta-lock");
      if (lock) lock.textContent = "+";
    }

    /* Déverrouiller l'aside "Réservé TR" sur sorties.html */
    var aside = _$("so-aside");
    if (aside) {
      aside.classList.add("is-unlocked");
      var lockDiv = aside.querySelector(".so-aside__lock");
      if (lockDiv) lockDiv.textContent = "✓";
    }

    /* Masquer onboarding */
    _hide(_$("gr-teamrider-banner"));
  }

  /**
   * admin — tous les droits + redirection automatique.
   */
  function _renderAdmin(user) {
    /* Appliquer les droits team_rider d'abord */
    _renderTeamRider(user);

    /* Mise à jour labels admin */
    var greeting = _$("goelo-user-greeting");
    if (greeting) _text(greeting, "👑 Admin");

    var btn = _q(".gr-header-connect, [data-goelo-connect-btn]");
    if (btn) { _text(btn, "👑 Admin"); btn.href = "admin.html"; }

    /* Redirection automatique vers admin.html */
    var path = window.location.pathname;
    if (path.endsWith("index.html") || path === "/" || path.endsWith("/")) {
      window.location.href = "admin.html";
    }
  }

  /* ════════════════════════════════════════════════════════════
     DISPATCH
     ════════════════════════════════════════════════════════════ */
  function _applyRole(detail) {
    var role = detail.role || "visitor";
    var user = detail.user || null;

    switch (role) {
      case "admin":      _renderAdmin(user);      break;
      case "team_rider": _renderTeamRider(user);  break;
      case "user":       _renderUser(user);        break;
      default:           _renderVisitor();         break;
    }
  }

  /* ════════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════════ */
  function _init() {
    /* État stable par défaut avant que le rôle arrive */
    _renderVisitor();

    /* Rôle déjà connu (auth.js plus rapide que DOMContentLoaded) */
    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      _applyRole({ role: window.GOELO_ROLE, user: window.GOELO_USER });
    }

    /* Écouter le rôle résolu (et les changements ultérieurs) */
    window.addEventListener("goelo:role-ready", function (e) {
      _applyRole(e.detail);
    });

    /* Bouton déconnexion */
    var logoutBtn = _$("goelo-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        if (typeof window.goeloSignOut === "function") {
          window.goeloSignOut().then(function () {
            window.location.reload();
          });
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
