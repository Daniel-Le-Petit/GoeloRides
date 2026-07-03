/**
 * GoëloRides — Navbar responsive partagée (structure gr-nav / sorties.html)
 */
(function (global) {
  "use strict";

  var NAV_LINKS = [
    { id: "sorties", label: "Sorties", href: "sorties.html" },
    { id: "groupes", label: "Groupes", href: "groupes.html" },
    { id: "infos", label: "Infos pratiques", href: "infos-pratiques.html" },
    { id: "actus", label: "Actualités", href: "https://www.instagram.com/goelo.rides/", external: true }
  ];

  var ACCOUNT_LINKS = [
    { label: "Mon profil", href: "profile.html" },
    { label: "Mes inscriptions", href: "my-bookings.html" }
  ];

  var USER_ICON = '<span class="gr-nav__user-icon" aria-hidden="true">\uD83D\uDC64</span>';
  var CHEVRON = '<svg class="gr-nav__user-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var BURGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  var CONNECT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>';

  var mounted = false;

  function pageIdFromPath() {
    var path = (global.location.pathname || "").split("/").pop() || "index.html";
    if (path === "" || path === "/") return "home";
    return path.replace(/\.html$/, "");
  }

  function resolveActive(mount) {
    if (mount && mount.getAttribute("data-goelo-navbar-active")) {
      return mount.getAttribute("data-goelo-navbar-active");
    }
    var map = {
      index: "home",
      sorties: "sorties",
      groupes: "groupes",
      "infos-pratiques": "infos",
      profile: "profile",
      "my-bookings": "bookings"
    };
    return map[pageIdFromPath()] || "";
  }

  function resolveVariant(mount) {
    if (mount && mount.getAttribute("data-goelo-navbar-variant")) {
      return mount.getAttribute("data-goelo-navbar-variant");
    }
    if (pageIdFromPath() === "index" || pageIdFromPath() === "home") return "hero";
    return "default";
  }

  function navLinkHtml(link, activeId) {
    var current = link.id === activeId ? ' aria-current="page"' : "";
    var ext = link.external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return '<li><a href="' + link.href + '"' + current + ext + ">" + link.label + "</a></li>";
  }

  function greetingName(pseudo, user) {
    if (pseudo && String(pseudo).trim()) return String(pseudo).trim();
    if (global.GoeloProfile && user) {
      return global.GoeloProfile.getDisplayName(global.GoeloProfile.profileFromUser(user));
    }
    if (global.GoeloProfile && global.GoeloProfile.sessionDisplayName) {
      return global.GoeloProfile.sessionDisplayName();
    }
    return "Utilisateur";
  }

  function buildNavbarHtml(activeId, variant) {
    var links = NAV_LINKS.map(function (l) { return navLinkHtml(l, activeId); }).join("");
    links += '<li class="gr-nav__tr-item"><span class="gr-nav__tr-label" data-goelo-nav-tr-label>Team Rider</span></li>';

    var accountDesktop = ACCOUNT_LINKS.map(function (l) {
      return '<a role="menuitem" href="' + l.href + '">' + l.label + "</a>";
    }).join("");

    var heroClass = variant === "hero" ? " gr-nav--hero" : "";

    return (
      '<nav class="gr-nav goelo-navbar' + heroClass + '" id="goelo-navbar" role="navigation" aria-label="Navigation principale">' +
        '<a href="index.html" class="gr-nav__logo" aria-label="Go\u00EBloRides \u2014 Accueil">GO\u00CBLO<span>RIDES</span></a>' +
        '<ul class="gr-nav__links">' + links + "</ul>" +
        '<div class="gr-nav__extras" data-goelo-navbar-extras></div>' +
        '<button type="button" class="gr-nav__connect" data-goelo-navbar-connect data-goelo-auth-trigger hidden>' +
          CONNECT_ICON + " Se connecter" +
        "</button>" +
        '<div class="gr-nav__user" data-goelo-user-menu hidden>' +
          '<button type="button" class="gr-nav__user-btn" data-goelo-user-toggle aria-haspopup="menu" aria-expanded="false">' +
            USER_ICON +
            '<span data-goelo-navbar-greeting>Bonjour Utilisateur</span>' +
            CHEVRON +
          "</button>" +
          '<div class="gr-nav__dropdown" role="menu" data-goelo-user-dropdown hidden>' +
            accountDesktop +
            '<hr class="gr-nav__dropdown-sep" aria-hidden="true">' +
            '<button type="button" class="gr-nav__dropdown-logout" role="menuitem" data-goelo-logout-btn aria-label="Se d\u00E9connecter">' +
              '<span data-goelo-logout-label>D\u00E9connexion</span>' +
              '<span data-goelo-logout-spinner hidden aria-hidden="true">D\u00E9connexion\u2026</span>' +
            "</button>" +
          "</div>" +
        "</div>" +
        '<button type="button" class="gr-nav__burger" data-goelo-navbar-burger aria-label="Menu" aria-controls="gr-mobile-drawer">' +
          BURGER +
        "</button>" +
      "</nav>"
    );
  }

  function buildDrawerHtml(activeId) {
    var mainLinks = NAV_LINKS.map(function (l) { return navLinkHtml(l, activeId); }).join("");
    mainLinks += '<li><span class="gr-mobile-drawer__label" data-goelo-nav-tr-label>Team Rider</span></li>';

    var accountLinks = ACCOUNT_LINKS.map(function (l) {
      return '<li><a href="' + l.href + '">' + l.label + "</a></li>";
    }).join("");

    return (
      '<div id="gr-mobile-drawer" class="gr-mobile-drawer" hidden aria-modal="true" role="dialog" aria-label="Menu">' +
        '<div class="gr-mobile-drawer__backdrop" data-goelo-mobile-close></div>' +
        '<nav class="gr-mobile-drawer__panel" aria-label="Navigation mobile">' +
          '<div class="gr-mobile-drawer__head">' +
            '<span class="gr-mobile-drawer__logo">GO\u00CBLO<span>RIDES</span></span>' +
            '<button type="button" class="gr-mobile-drawer__close" data-goelo-mobile-close aria-label="Fermer">\u2715</button>' +
          "</div>" +
          '<ul class="gr-mobile-drawer__links">' + mainLinks + "</ul>" +
          '<hr class="gr-mobile-drawer__sep" data-goelo-mobile-account-sep hidden aria-hidden="true">' +
          '<ul class="gr-mobile-drawer__account" data-goelo-mobile-account hidden>' + accountLinks + "</ul>" +
          '<hr class="gr-mobile-drawer__sep" data-goelo-mobile-logout-sep hidden aria-hidden="true">' +
          '<ul class="gr-mobile-drawer__account" data-goelo-mobile-logout-wrap hidden>' +
            '<li><button type="button" class="gr-mobile-drawer__logout" data-goelo-logout-btn aria-label="Se d\u00E9connecter">' +
              '<span data-goelo-logout-label>D\u00E9connexion</span>' +
              '<span data-goelo-logout-spinner hidden aria-hidden="true">D\u00E9connexion\u2026</span>' +
            "</button></li>" +
          "</ul>" +
          '<div class="gr-mobile-drawer__cta" data-goelo-mobile-connect-wrap hidden>' +
            '<button type="button" class="gr-mobile-drawer__btn" data-goelo-mobile-connect data-goelo-auth-trigger>Se connecter</button>' +
          "</div>" +
        "</nav>" +
      "</div>"
    );
  }

  function collectExtras(oldNav) {
    if (!oldNav) return [];
    var extras = [];
    oldNav.querySelectorAll(".gr-nav__cta, #nav-create-sortie, #nav-create-group").forEach(function (el) {
      var wrap = el.closest("[style*='position']") || el;
      if (extras.indexOf(wrap) === -1) extras.push(wrap);
    });
    oldNav.querySelectorAll(".gr-popover").forEach(function (el) {
      if (extras.indexOf(el.parentElement) === -1 && el.parentElement) {
        extras.push(el.parentElement);
      }
    });
    return extras;
  }

  function setVisible(el, show) {
    if (!el) return;
    if (show) {
      el.hidden = false;
      el.removeAttribute("hidden");
      el.classList.remove("is-hidden");
    } else {
      el.hidden = true;
      el.setAttribute("hidden", "");
      el.classList.add("is-hidden");
    }
  }

  function mountNavbar() {
    if (mounted) return;
    var mount = global.document.querySelector("[data-goelo-navbar]");
    var legacyNav = global.document.querySelector(".gr-nav:not(.goelo-navbar), .nav");
    var legacyHeader = global.document.querySelector(".gr-header");
    var replaceTarget = mount || legacyNav || legacyHeader;
    if (!replaceTarget) return;

    var activeId = resolveActive(mount || replaceTarget);
    var variant = resolveVariant(mount || replaceTarget);
    var extras = collectExtras(legacyNav);

    var wrapper = global.document.createElement("div");
    wrapper.innerHTML = buildNavbarHtml(activeId, variant);
    var navbar = wrapper.firstElementChild;

    replaceTarget.parentNode.insertBefore(navbar, replaceTarget);
    replaceTarget.remove();

    var extrasSlot = navbar.querySelector("[data-goelo-navbar-extras]");
    extras.forEach(function (node) {
      if (extrasSlot) extrasSlot.appendChild(node);
    });

    var oldDrawer = global.document.getElementById("gr-mobile-drawer");
    if (oldDrawer) oldDrawer.remove();

    var drawerWrap = global.document.createElement("div");
    drawerWrap.innerHTML = buildDrawerHtml(activeId);
    global.document.body.appendChild(drawerWrap.firstElementChild);

    mounted = true;
    bindEvents();
    bindLogoutButtons();
    global.dispatchEvent(new CustomEvent("goelo:navbar-ready"));
  }

  function closeUserDropdown() {
    var btn = global.document.querySelector("[data-goelo-user-toggle]");
    var panel = global.document.querySelector("[data-goelo-user-dropdown]");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (panel) panel.hidden = true;
  }

  function toggleUserDropdown() {
    var btn = global.document.querySelector("[data-goelo-user-toggle]");
    var panel = global.document.querySelector("[data-goelo-user-dropdown]");
    if (!btn || !panel) return;
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    panel.hidden = open;
  }

  function openMobileMenu() {
    var drawer = global.document.getElementById("gr-mobile-drawer");
    if (!drawer) return;
    drawer.removeAttribute("hidden");
    global.document.documentElement.classList.add("gr-mobile-menu-open");
    global.document.body.classList.add("gr-mobile-menu-open");
  }

  function closeMobileMenu() {
    var drawer = global.document.getElementById("gr-mobile-drawer");
    if (!drawer) return;
    drawer.setAttribute("hidden", "");
    global.document.documentElement.classList.remove("gr-mobile-menu-open");
    global.document.body.classList.remove("gr-mobile-menu-open");
  }

  function setLogoutLoading(isLoading) {
    global.document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      btn.disabled = !!isLoading;
      btn.classList.toggle("is-logging-out", !!isLoading);
      var label = btn.querySelector("[data-goelo-logout-label]");
      var spinner = btn.querySelector("[data-goelo-logout-spinner]");
      if (label) label.hidden = !!isLoading;
      if (spinner) spinner.hidden = !isLoading;
    });
  }

  function handleLogoutClick() {
    if (global.document.querySelector("[data-goelo-logout-btn]:disabled")) return;
    closeUserDropdown();
    closeMobileMenu();
    setLogoutLoading(true);

    var signOut = global.goeloSignOut;
    if (typeof signOut !== "function") {
      global.location.href = "/";
      return;
    }

    signOut({ redirect: "/" }).catch(function () {
      global.location.href = "/";
    });
  }

  function bindLogoutButtons() {
    global.document.querySelectorAll("[data-goelo-logout-btn]").forEach(function (btn) {
      if (btn.dataset.goeloLogoutBound === "1") return;
      btn.dataset.goeloLogoutBound = "1";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        handleLogoutClick();
      });
    });
  }

  function bindEvents() {
    var burger = global.document.querySelector("[data-goelo-navbar-burger]");
    if (burger) burger.addEventListener("click", openMobileMenu);

    global.document.querySelectorAll("[data-goelo-mobile-close]").forEach(function (el) {
      el.addEventListener("click", closeMobileMenu);
    });

    var userToggle = global.document.querySelector("[data-goelo-user-toggle]");
    if (userToggle) {
      userToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleUserDropdown();
      });
    }

    global.document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-goelo-user-menu]")) closeUserDropdown();
    });

    global.document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeUserDropdown();
        closeMobileMenu();
      }
    });
  }

  function syncTrLabel(role) {
    global.document.querySelectorAll("[data-goelo-nav-tr-label]").forEach(function (el) {
      el.textContent = "Team Rider";
      el.className = el.classList.contains("gr-mobile-drawer__label")
        ? "gr-mobile-drawer__label"
        : "gr-nav__tr-label";
      if (role === "team_rider" || role === "admin") {
        el.classList.add("go-role-badge", "go-role-badge--" + role);
      }
    });
  }

  function syncAuth(detail) {
    if (!mounted) return;

    var s = detail || {};
    var pending = !!s.pending;
    var r = s.role;
    var user = s.user;
    var pseudo = s.pseudo;

    if (!r && global.GoeloAuthState) {
      var state = global.GoeloAuthState.getState();
      pending = state.pending;
      r = state.role;
      user = state.user;
      pseudo = state.pseudo;
    }

    if (user && r === "visitor") r = "user";
    var isVisitor = !user || r === "visitor";

    var connect = global.document.querySelector("[data-goelo-navbar-connect]");
    var userMenu = global.document.querySelector("[data-goelo-user-menu]");
    var mobileConnectWrap = global.document.querySelector("[data-goelo-mobile-connect-wrap]");
    var mobileAccount = global.document.querySelector("ul[data-goelo-mobile-account]");
    var accountSep = global.document.querySelector("[data-goelo-mobile-account-sep]");
    var mobileLogoutWrap = global.document.querySelector("[data-goelo-mobile-logout-wrap]");
    var mobileLogoutSep = global.document.querySelector("[data-goelo-mobile-logout-sep]");

    if (pending) {
      setVisible(connect, false);
      setVisible(userMenu, false);
      setVisible(mobileConnectWrap, false);
      return;
    }

    setVisible(connect, isVisitor);
    setVisible(userMenu, !isVisitor);
    setVisible(mobileConnectWrap, isVisitor);
    setVisible(mobileAccount, !isVisitor);
    setVisible(accountSep, !isVisitor);
    setVisible(mobileLogoutWrap, !isVisitor);
    setVisible(mobileLogoutSep, !isVisitor);

    if (!isVisitor) {
      var name = greetingName(pseudo, user);
      global.document.querySelectorAll("[data-goelo-navbar-greeting]").forEach(function (el) {
        el.textContent = "Bonjour " + name;
      });
    }

    syncTrLabel(r);
    bindLogoutButtons();
  }

  function init() {
    mountNavbar();

    function onAuth(detail) {
      syncAuth(detail);
      if (global.GoeloUI && global.GoeloUI.syncNavCreate) {
        var role = detail && detail.role;
        if (!role && global.GoeloAuthState) role = global.GoeloAuthState.getState().role;
        global.GoeloUI.syncNavCreate(role);
      }
    }

    if (global.GoeloAuthState) {
      onAuth(global.GoeloAuthState.getState());
      global.GoeloAuthState.subscribe(function (state) {
        onAuth(state);
      });
    } else {
      onAuth({
        role: global.GOELO_ROLE || "visitor",
        user: global.GOELO_USER || null,
        pseudo: global.GOELO_DISPLAY_NAME || null,
        pending: !!global.GOELO_AUTH_PENDING
      });
    }

    global.addEventListener("goelo:role-ready", function (e) { onAuth(e.detail); });
    global.addEventListener("goelo:auth-success", function (e) { onAuth(e.detail); });
    global.addEventListener("goelo:auth-state", function (e) { onAuth(e.detail); });
  }

  global.GoeloNavbar = {
    init: init,
    mount: mountNavbar,
    syncAuth: syncAuth,
    openMobileMenu: openMobileMenu,
    closeMobileMenu: closeMobileMenu
  };

  global.openMobileMenu = openMobileMenu;
  global.closeMobileMenu = closeMobileMenu;

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
