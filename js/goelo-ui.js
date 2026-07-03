/**
 * GoëloRides — UI partagée rôles + permissions visuelles
 * Design system : badges rôle (identité) ≠ badges niveau (difficulté sortie)
 */
(function (global) {
  "use strict";

  var ROLE_LABELS = global.GoeloAuthState && global.GoeloAuthState.ROLE_LABELS
    ? global.GoeloAuthState.ROLE_LABELS
    : {
      visitor:     "Visitor",
      user:        "Cycliste",
      team_rider:  "Team Rider",
      admin:       "Admin"
    };

  var HERO_SECONDARY = {
    visitor:     { text: "Rejoindre en Team Rider", href: null, auth: true },
    user:        { text: "Devenir Team Rider", href: "gestion-team-rider.html", auth: false },
    team_rider:  { text: "Team Rider actif ✓", href: "team-rider.html", auth: false },
    admin:       { text: "Panneau Admin", href: "admin.html", auth: false }
  };

  function readAuthState() {
    if (global.GoeloAuthState) return global.GoeloAuthState.getState();
    return {
      pending: !!global.GOELO_AUTH_PENDING,
      role: global.GOELO_ROLE || "visitor",
      user: global.GOELO_USER || null,
      pseudo: global.GOELO_DISPLAY_NAME || null
    };
  }

  function role() {
    var r = readAuthState().role;
    if (r === "admin" || r === "team_rider" || r === "user") return r;
    return readAuthState().user ? "user" : "visitor";
  }

  function waitForRole() {
    var current = readAuthState();
    if (!current.pending) return Promise.resolve(role());
    return new Promise(function (resolve) {
      function done() {
        resolve(role());
      }
      if (global.GoeloAuthState) {
        var unsub = global.GoeloAuthState.subscribe(function (s) {
          if (!s.pending) {
            unsub();
            done();
          }
        });
      }
      global.addEventListener("goelo:role-ready", function handler() {
        global.removeEventListener("goelo:role-ready", handler);
        done();
      });
    });
  }

  function roleDetail(detail) {
    var s = readAuthState();
    if (detail && detail.role) {
      return {
        role: detail.role,
        user: detail.user != null ? detail.user : s.user,
        pseudo: detail.pseudo !== undefined ? detail.pseudo : s.pseudo
      };
    }
    return { role: role(), user: s.user, pseudo: s.pseudo };
  }

  function setRoleBadges(r) {
    global.document.querySelectorAll("[data-goelo-role-badge]").forEach(function (el) {
      el.className = "go-role-badge go-role-badge--" + r;
      el.textContent = ROLE_LABELS[r] || r;
      el.hidden = false;
      el.removeAttribute("hidden");
    });
  }

  function headerGreetingName(pseudo, user) {
    if (pseudo && String(pseudo).trim()) return String(pseudo).trim();
    if (global.GoeloProfile && user) {
      return global.GoeloProfile.getDisplayName(global.GoeloProfile.profileFromUser(user));
    }
    if (global.GoeloProfile && global.GoeloProfile.sessionDisplayName) {
      return global.GoeloProfile.sessionDisplayName();
    }
    return "Utilisateur";
  }

  function syncHeaderConnect(r, pseudo, user) {
    if (global.GoeloNavbar && global.GoeloNavbar.syncAuth) {
      var s = global.GoeloAuthState ? global.GoeloAuthState.getState() : {};
      global.GoeloNavbar.syncAuth({
        role: r,
        pseudo: pseudo,
        user: user,
        pending: s.pending
      });
      return;
    }

    var btn = global.document.querySelector(".gr-header-connect, [data-goelo-connect-btn]");
    if (!btn) return;

    btn.classList.remove("is-loading", "gr-header-connect--static", "gr-header-connect--greeting");
    btn.removeAttribute("data-goelo-auth-trigger");
    btn.onclick = null;
    btn.hidden = false;
    btn.removeAttribute("hidden");

    if (r === "visitor") {
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg> Se connecter';
      btn.setAttribute("data-goelo-auth-trigger", "");
      btn.removeAttribute("href");
      return;
    }

    var name = headerGreetingName(pseudo, user);
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(global.document.createTextNode("Bonjour " + name));
    btn.classList.add("gr-header-connect--greeting");
    btn.setAttribute("aria-label", "Connecté en tant que " + name);
    if (btn.tagName === "A") {
      btn.removeAttribute("href");
      btn.onclick = function (e) { e.preventDefault(); };
    }
  }

  function applyHeroCta(el, config) {
    if (!el || !config) return;
    var svg = el.querySelector("svg");
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(document.createTextNode(config.text));
    if (svg) el.appendChild(svg);
    el.removeAttribute("data-goelo-auth-trigger");
    el.onclick = null;
    if (config.auth) {
      el.setAttribute("data-goelo-auth-trigger", "");
      el.removeAttribute("href");
      return;
    }
    if (el.tagName === "A") el.href = config.href;
    else el.onclick = function () { global.location.href = config.href; };
  }

  function syncHeroCtas(r) {
    var secondary = HERO_SECONDARY[r] || HERO_SECONDARY.visitor;
    global.document.querySelectorAll("[data-goelo-tr-cta]").forEach(function (el) {
      applyHeroCta(el, secondary);
    });

    var heroTr = global.document.querySelector(".gr-hero-ctas [data-goelo-auth-trigger].gr-btn--ghost");
    if (heroTr && !heroTr.hasAttribute("data-goelo-tr-cta")) {
      heroTr.setAttribute("data-goelo-tr-cta", "");
    }
  }

  function syncLogoutButtons(r) {
    var isVisitor = r === "visitor";
    if (global.GoeloNavbar && global.GoeloNavbar.syncAuth) {
      var s = global.GoeloAuthState
        ? global.GoeloAuthState.getState()
        : {
          user: global.GOELO_USER || null,
          pseudo: global.GOELO_DISPLAY_NAME || null,
          pending: !!global.GOELO_AUTH_PENDING
        };
      global.GoeloNavbar.syncAuth({
        role: r,
        user: isVisitor ? null : s.user,
        pseudo: s.pseudo,
        pending: s.pending
      });
      return;
    }

    global.document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      btn.hidden = isVisitor;
      if (!isVisitor) btn.removeAttribute("hidden");
      var wrap = btn.closest(".gr-nav-logout-wrap");
      if (wrap) {
        wrap.hidden = isVisitor;
        if (!isVisitor) wrap.removeAttribute("hidden");
      }
    });
    global.document.querySelectorAll(".gr-mobile-drawer__cta [data-goelo-auth-trigger]").forEach(function (el) {
      el.hidden = !isVisitor;
    });
    global.document.querySelectorAll(".gr-mobile-drawer__cta [data-goelo-logout-btn]").forEach(function (el) {
      el.hidden = isVisitor;
      if (!isVisitor) el.removeAttribute("hidden");
    });
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
      if (badge) {
        badge.className = "mtr-badge";
        badge.textContent = "Bienvenue";
      }
      if (title) title.innerHTML = 'Rejoins la communaut\u00e9<br><span class="mtr-title--accent">Go\u00ebloRides</span>';
      if (desc) desc.textContent = "Inscris-toi pour participer aux sorties, suivre les parcours et rejoindre les cyclistes du Go\u00eblo.";
      actions.innerHTML =
        '<button type="button" class="mtr-btn mtr-btn--primary" id="mtr-go-signup" data-autofocus>Cr\u00e9er un compte</button>' +
        '<button type="button" class="mtr-btn mtr-btn--outline" id="mtr-go-login">Se connecter</button>';
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
    var resolved = roleDetail(detail);
    var r = resolved.role;
    if (resolved.user && r === "visitor") r = "user";

    global.document.documentElement.classList.remove("goelo-auth-pending");
    global.GOELO_AUTH_PENDING = false;

    setRoleBadges(r);
    syncHeaderConnect(r, resolved.pseudo, resolved.user);
    syncHeroCtas(r);
    syncLogoutButtons(r);
    syncNavCreate(r);
    syncTeamRiderModal(r);

    var aside = global.document.getElementById("so-aside");
    if (aside && (r === "team_rider" || r === "admin")) {
      aside.classList.add("is-unlocked");
      var lockDiv = aside.querySelector(".so-aside__lock");
      if (lockDiv) lockDiv.textContent = "✓";
    }
  }

  function catchUpRoleUI() {
    var s = readAuthState();
    if (s.pending) return;
    syncRoleUI({ role: s.role, user: s.user, pseudo: s.pseudo });
  }

  function bindModalLoginShortcut() {
    global.document.addEventListener("click", function (e) {
      if (e.target.closest("[data-goelo-auth-signup]")) {
        e.preventDefault();
        if (typeof global.closeGoeloAuth === "function") global.closeGoeloAuth();
        setTimeout(function () {
          if (typeof global.openGoeloSignup === "function") global.openGoeloSignup();
        }, 180);
      }
    });
  }

  function bindAuthSubscriptions() {
    function onAuthChange(s) {
      if (s.pending) {
        global.document.documentElement.classList.add("goelo-auth-pending");
        return;
      }
      syncRoleUI({ role: s.role, user: s.user, pseudo: s.pseudo });
    }

    if (global.GoeloAuthState) {
      global.GoeloAuthState.subscribe(onAuthChange);
      onAuthChange(global.GoeloAuthState.getState());
    }

    global.addEventListener("goelo:role-ready", function (e) {
      syncRoleUI(e.detail);
    });

    global.addEventListener("goelo:auth-success", function (e) {
      syncRoleUI(e.detail);
    });

    global.addEventListener("goelo:auth-state", function (e) {
      if (e.detail) syncRoleUI(e.detail);
    });
  }

  function init() {
    bindModalLoginShortcut();
    bindAuthSubscriptions();

    var s = readAuthState();
    if (s.pending) {
      global.document.documentElement.classList.add("goelo-auth-pending");
    }

    global.setTimeout(catchUpRoleUI, 0);
    global.setTimeout(catchUpRoleUI, 100);

    global.addEventListener("goelo:navbar-ready", function () {
      catchUpRoleUI();
    });
  }

  global.GoeloUI = {
    role: role,
    waitForRole: waitForRole,
    syncRoleUI: syncRoleUI,
    catchUpRoleUI: catchUpRoleUI
  };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
