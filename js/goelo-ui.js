/**
 * GoëloRides — UI partagée rôles + permissions visuelles
 * Design system : badges rôle (identité) ≠ badges niveau (difficulté sortie)
 */
(function (global) {
  "use strict";

  var ROLE_LABELS = {
    visitor:     "Visitor",
    user:        "Cycliste",
    team_rider:  "Team Rider",
    admin:       "Admin"
  };

  function role() {
    var r = global.GOELO_ROLE;
    if (r === "admin" || r === "team_rider" || r === "user") return r;
    return "visitor";
  }

  function headerDisplayName() {
    if (global.GOELO_DISPLAY_NAME && String(global.GOELO_DISPLAY_NAME).trim()) {
      return String(global.GOELO_DISPLAY_NAME).trim();
    }
    if (global.GoeloProfile) return global.GoeloProfile.sessionDisplayName();
    return "User";
  }

  function waitForRole() {
    if (!global.GOELO_AUTH_PENDING) return Promise.resolve(role());
    return new Promise(function (resolve) {
      global.addEventListener("goelo:role-ready", function handler(e) {
        global.removeEventListener("goelo:role-ready", handler);
        resolve((e.detail && e.detail.role) || role());
      });
    });
  }

  function setRoleBadges(r) {
    global.document.querySelectorAll("[data-goelo-role-badge]").forEach(function (el) {
      el.className = "go-role-badge go-role-badge--" + r;
      el.textContent = ROLE_LABELS[r] || r;
      el.hidden = false;
    });
  }

  function syncHeaderConnect(r, user) {
    var btn = global.document.querySelector(".gr-header-connect, [data-goelo-connect-btn]");
    if (!btn) return;

    btn.classList.remove("is-loading");
    btn.removeAttribute("data-goelo-auth-trigger");

    if (r === "visitor") {
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg> Se connecter';
      btn.setAttribute("data-goelo-auth-trigger", "");
      btn.removeAttribute("href");
      btn.onclick = null;
      return;
    }

    if (r === "user") {
      btn.textContent = headerDisplayName();
      btn.href = "sorties.html";
      return;
    }
    if (r === "team_rider") {
      btn.textContent = "Mon cockpit";
      btn.href = "team-rider.html";
      return;
    }
    if (r === "admin") {
      btn.textContent = "Gestion admin";
      btn.href = "admin.html";
    }
  }

  function syncHeroCtas(r) {
    global.document.querySelectorAll("[data-goelo-tr-cta]").forEach(function (el) {
      el.removeAttribute("data-goelo-auth-trigger");
      if (r === "visitor") {
        el.textContent = "Rejoindre en Team Rider";
        el.setAttribute("data-goelo-auth-trigger", "");
        el.removeAttribute("href");
        return;
      }
      if (r === "user") {
        el.textContent = "Devenir Team Rider";
        if (el.tagName === "A") el.href = "gestion-team-rider.html";
        else el.onclick = function () { global.location.href = "gestion-team-rider.html"; };
        return;
      }
      if (r === "team_rider") {
        el.textContent = "Team Rider actif ✓";
        if (el.tagName === "A") el.href = "team-rider.html";
        else el.onclick = function () { global.location.href = "team-rider.html"; };
        return;
      }
      if (r === "admin") {
        el.textContent = "Panneau admin";
        if (el.tagName === "A") el.href = "admin.html";
        else el.onclick = function () { global.location.href = "admin.html"; };
      }
    });

    var heroTr = global.document.querySelector(".gr-hero-ctas [data-goelo-auth-trigger].gr-btn--ghost");
    if (heroTr && !heroTr.hasAttribute("data-goelo-tr-cta")) {
      heroTr.setAttribute("data-goelo-tr-cta", "");
    }
  }

  function syncNavCreate(r) {
    var createBtn = global.document.getElementById("nav-create-sortie")
      || global.document.querySelector("a.gr-nav__cta[href*='gestion-sorties']");
    if (!createBtn) return;

    var lockIcon = createBtn.querySelector(".gr-nav__cta-lock");
    var canCreate = r === "team_rider" || r === "admin";

    createBtn.onclick = null;

    if (canCreate) {
      createBtn.classList.remove("is-locked");
      createBtn.removeAttribute("data-lock");
      createBtn.removeAttribute("aria-disabled");
      if (!createBtn.getAttribute("href")) createBtn.href = "gestion-sorties.html?mode=create";
      if (lockIcon) lockIcon.textContent = "+";
    } else {
      createBtn.classList.add("is-locked");
      createBtn.setAttribute("data-lock", "create");
      createBtn.setAttribute("aria-disabled", "true");
      if (lockIcon) lockIcon.textContent = "🔒";
      createBtn.onclick = function (e) {
        if (!createBtn.classList.contains("is-locked")) return;
        e.preventDefault();
        if (r === "visitor" && typeof global.openGoeloAuth === "function") {
          global.openGoeloAuth();
        }
      };
    }
  }

  function syncTeamRiderModal(r) {
    var modal = global.document.getElementById("modal-teamrider");
    if (!modal) return;

    var title = modal.querySelector(".mtr-title");
    var desc  = modal.querySelector(".mtr-desc");
    var actions = modal.querySelector(".mtr-actions");
    var badge = modal.querySelector(".mtr-badge");
    if (!actions) return;

    if (badge) {
      badge.className = "mtr-badge go-role-badge go-role-badge--" + r;
      badge.textContent = ROLE_LABELS[r] || "Mode Team Rider";
    }

    if (r === "visitor") {
      if (title) title.innerHTML = 'Passez en mode<br><span class="mtr-title--accent">Team Rider</span>';
      if (desc) desc.textContent = "Connecte-toi pour demander l'accès Team Rider et organiser des sorties.";
      actions.innerHTML =
        '<button type="button" class="mtr-btn mtr-btn--primary" data-goelo-auth-login>Se connecter</button>' +
        '<a class="mtr-btn mtr-btn--outline" href="gestion-team-rider.html">En savoir plus</a>';
      return;
    }

    if (r === "user") {
      if (title) title.innerHTML = 'Demande<br><span class="mtr-title--accent">Team Rider</span>';
      if (desc) desc.textContent = "Tu peux déposer une demande pour devenir Team Rider et créer des sorties.";
      actions.innerHTML =
        '<a class="mtr-btn mtr-btn--primary" href="gestion-team-rider.html">Devenir Team Rider</a>' +
        '<button type="button" class="mtr-btn mtr-btn--outline" data-close-modal="modal-teamrider">Fermer</button>';
      return;
    }

    if (r === "team_rider") {
      if (title) title.innerHTML = 'Mode<br><span class="mtr-title--accent">Team Rider actif</span>';
      if (desc) desc.textContent = "Tu peux créer, modifier et publier des sorties depuis ton cockpit.";
      actions.innerHTML =
        '<a class="mtr-btn mtr-btn--primary" href="team-rider.html">Mon cockpit</a>' +
        '<a class="mtr-btn mtr-btn--outline" href="gestion-sorties.html?mode=create">Nouvelle sortie</a>';
      return;
    }

    if (r === "admin") {
      if (title) title.innerHTML = 'Espace<br><span class="mtr-title--accent">Administration</span>';
      if (desc) desc.textContent = "Gère les demandes Team Rider et l'ensemble des sorties.";
      actions.innerHTML =
        '<a class="mtr-btn mtr-btn--primary" href="admin.html">Panneau admin</a>' +
        '<a class="mtr-btn mtr-btn--outline" href="team-rider.html">Cockpit sorties</a>';
    }
  }

  function syncRoleUI(detail) {
    var r = (detail && detail.role) || role();
    var user = (detail && detail.user) || global.GOELO_USER || null;

    global.document.documentElement.classList.remove("goelo-auth-pending");
    global.GOELO_AUTH_PENDING = false;

    setRoleBadges(r);
    syncHeaderConnect(r, user);
    syncHeroCtas(r);
    syncNavCreate(r);
    syncTeamRiderModal(r);

    var aside = global.document.getElementById("so-aside");
    if (aside && (r === "team_rider" || r === "admin")) {
      aside.classList.add("is-unlocked");
      var lockDiv = aside.querySelector(".so-aside__lock");
      if (lockDiv) lockDiv.textContent = "✓";
    }
  }

  function bindModalLoginShortcut() {
    global.document.addEventListener("click", function (e) {
      if (e.target.closest("[data-goelo-auth-login]")) {
        e.preventDefault();
        if (typeof global.closeGoeloAuth === "function") global.closeGoeloAuth();
        setTimeout(function () {
          var m = global.document.getElementById("modal-login");
          if (m) m.hidden = false;
          requestAnimationFrame(function () { m.classList.add("is-open"); });
        }, 180);
      }
    });
  }

  function init() {
    global.document.documentElement.classList.add("goelo-auth-pending");
    bindModalLoginShortcut();

    global.addEventListener("goelo:role-ready", function (e) {
      syncRoleUI(e.detail);
    });

    global.addEventListener("goelo:auth-success", function (e) {
      syncRoleUI(e.detail);
    });

    if (!global.GOELO_AUTH_PENDING && global.GOELO_ROLE) {
      syncRoleUI({ role: global.GOELO_ROLE, user: global.GOELO_USER });
    }
  }

  global.GoeloUI = {
    role: role,
    waitForRole: waitForRole,
    syncRoleUI: syncRoleUI
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
