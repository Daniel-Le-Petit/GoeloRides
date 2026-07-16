/**
 * GoëloRides — Admin : liste des cyclistes (RPC admin_profiles_list).
 */
(function () {
  "use strict";

  var _profiles = [];
  var _filter = "all";
  var _search = "";
  var _initDone = false;

  function getSb() {
    return window.goeloGetSb ? window.goeloGetSb() : null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function roleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "team_rider") return "Ride Leader";
    return "Membre";
  }

  function roleBadgeClass(role) {
    if (role === "admin") return "cyc-role--admin";
    if (role === "team_rider") return "cyc-role--team";
    return "cyc-role--member";
  }

  function profileInitials(p) {
    if (window.GoeloProfile) {
      return window.GoeloProfile.initials(p);
    }
    var name = p.display_name || p.pseudo || p.username || "?";
    return String(name).slice(0, 2).toUpperCase();
  }

  function avatarColor(p, i) {
    if (window.GoeloProfile) {
      return window.GoeloProfile.avatarColor(p, i);
    }
    return "#C8F135";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) {
      void e;
      return "—";
    }
  }

  function filteredProfiles() {
    return _profiles.filter(function (p) {
      if (_filter === "admin" && p.role !== "admin") return false;
      if (_filter === "team_rider" && p.role !== "team_rider") return false;
      if (_filter === "member" && p.role !== "user") return false;
      if (_search) {
        var hay = [
          p.display_name, p.pseudo, p.username, p.email, p.city, p.role
        ].join(" ").toLowerCase();
        if (hay.indexOf(_search) === -1) return false;
      }
      return true;
    });
  }

  function renderStats() {
    function set(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    set("cyc-stat-total", _profiles.length);
    set("cyc-stat-members", _profiles.filter(function (p) { return p.role === "user"; }).length);
    set("cyc-stat-team", _profiles.filter(function (p) { return p.role === "team_rider"; }).length);
    set("cyc-stat-admin", _profiles.filter(function (p) { return p.role === "admin"; }).length);
  }

  function renderList() {
    var host = document.getElementById("cyc-list");
    if (!host) return;

    var list = filteredProfiles();
    if (!list.length) {
      host.innerHTML = "<div class=\"gtr-empty\">Aucun cycliste pour ce filtre.</div>";
      return;
    }

    host.innerHTML = list.map(function (p, i) {
      var pseudo = p.pseudo ? esc(p.pseudo) : "<span class=\"cyc-muted\">—</span>";
      var username = p.username ? esc(p.username) : "<span class=\"cyc-muted\">—</span>";
      var email = p.email ? esc(p.email) : "—";
      var city = p.city ? esc(p.city) : "";
      var level = p.cyclist_level ? esc(p.cyclist_level) : "";
      var meta = [city, level].filter(Boolean).join(" · ");

      return (
        "<article class=\"cyc-card\">" +
          "<div class=\"cyc-card__main\">" +
            "<div class=\"cyc-avatar\" style=\"background:" + esc(avatarColor(p, i)) + "\">" +
              esc(profileInitials(p)) +
            "</div>" +
            "<div class=\"cyc-card__body\">" +
              "<div class=\"cyc-card__head\">" +
                "<span class=\"cyc-card__name\">" + esc(p.display_name || p.pseudo || p.username || "Membre") + "</span>" +
                "<span class=\"cyc-role " + roleBadgeClass(p.role) + "\">" + esc(roleLabel(p.role)) + "</span>" +
              "</div>" +
              "<dl class=\"cyc-meta\">" +
                "<div><dt>Pseudo</dt><dd>" + pseudo + "</dd></div>" +
                "<div><dt>Username</dt><dd>" + username + "</dd></div>" +
                "<div class=\"cyc-meta__email\"><dt>E-mail</dt><dd>" + email + "</dd></div>" +
              "</dl>" +
              (meta ? "<p class=\"cyc-card__sub\">" + meta + " · Inscrit " + esc(fmtDate(p.created_at)) + "</p>" : 
                "<p class=\"cyc-card__sub\">Inscrit " + esc(fmtDate(p.created_at)) + "</p>") +
            "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  async function loadProfiles() {
    var host = document.getElementById("cyc-list");
    if (host) {
      host.innerHTML =
        "<div class=\"gtr-loading\">" +
        "<div class=\"gtr-loading__dot\"></div>" +
        "<div class=\"gtr-loading__dot\"></div>" +
        "<div class=\"gtr-loading__dot\"></div>" +
        "</div>";
    }

    var sb = getSb();
    if (!sb) {
      setTimeout(loadProfiles, 400);
      return;
    }

    try {
      var result = await sb.rpc("admin_profiles_list");
      if (result.error) throw result.error;
      var payload = result.data || {};
      if (payload.ok === false) {
        throw new Error(payload.error === "forbidden" ? "Accès refusé" : (payload.error || "Erreur"));
      }
      _profiles = Array.isArray(payload.profiles) ? payload.profiles : (Array.isArray(payload) ? payload : []);
      renderStats();
      renderList();
    } catch (err) {
      console.error("[admin-cyclistes]", err);
      var msg = err.message || String(err);
      if (/could not find|schema cache|PGRST202/i.test(msg)) {
        msg = "RPC admin_profiles_list absente — appliquer la migration Supabase 20250715180000_admin_profiles_list.sql";
      }
      if (host) {
        host.innerHTML = "<div class=\"gtr-empty\" style=\"color:var(--red)\">Erreur : " + esc(msg) + "</div>";
      }
    }
  }

  function bindFilters() {
    document.querySelectorAll(".cyc-tab[data-filter]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".cyc-tab").forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        _filter = tab.getAttribute("data-filter") || "all";
        renderList();
      });
    });

    var search = document.getElementById("cyc-search");
    if (search) {
      search.addEventListener("input", function () {
        _search = search.value.trim().toLowerCase();
        renderList();
      });
    }

    var refresh = document.getElementById("cyc-refresh");
    if (refresh) refresh.addEventListener("click", loadProfiles);
  }

  function showAdmin(user) {
    var gate = document.getElementById("gtr-admin-gate");
    var panel = document.getElementById("gtr-admin-panel");
    if (gate) gate.style.display = "none";
    if (panel) panel.style.display = "block";

    if (user && window.GoeloProfile) {
      var profile = window.GoeloProfile.profileFromUser(user);
      var displayName = window.GoeloProfile.getDisplayName(profile);
      var nameEl = document.getElementById("admin-name");
      var avEl = document.getElementById("admin-avatar");
      if (nameEl) nameEl.textContent = displayName;
      if (avEl) avEl.textContent = window.GoeloProfile.initials(profile);
    }
  }

  function showGate() {
    var gate = document.getElementById("gtr-admin-gate");
    var panel = document.getElementById("gtr-admin-panel");
    if (gate) gate.style.display = "flex";
    if (panel) panel.style.display = "none";
  }

  function startAdmin(role, user) {
    if (role !== "admin") {
      showGate();
      return;
    }
    if (_initDone) return;
    _initDone = true;

    showAdmin(user);
    bindFilters();
    loadProfiles();

    var logoutBtn = document.getElementById("admin-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        if (typeof window.goeloSignOut === "function") {
          window.goeloSignOut().then(function () {
            window.location.href = "index.html";
          });
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      startAdmin(window.GOELO_ROLE, window.GOELO_USER);
      return;
    }

    window.addEventListener("goelo:role-ready", function handler(e) {
      window.removeEventListener("goelo:role-ready", handler);
      startAdmin(e.detail.role, e.detail.user);
    }, { once: true });
  });
})();
