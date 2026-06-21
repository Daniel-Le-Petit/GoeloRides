 /**
 * gestion-team-rider-admin.js
 * GoëloRides — Dashboard admin : gestion des demandes Team Rider
 *
 * CORRECTIONS appliquées :
 *  - Suppression du client Supabase local → utilise window.goeloGetSb() (singleton auth.js)
 *  - Suppression de la détection admin par JWT/localStorage → utilise window.GOELO_ROLE
 *  - Suppression des références à window.GOELO_SUPABASE_URL / ANON_KEY inexistants
 *  - Intégration avec goelo:role-ready (au lieu de DOMContentLoaded seul)
 *  - Conversion let/const → var pour cohérence avec le codebase
 *  - Conversion arrow functions → function() pour cohérence
 *  - Conversion template literals → concaténation pour cohérence
 *  - Null-checks sur tous les accès DOM
 *  - Bouton refresh branché
 *  - Mise à jour du nom/avatar admin dans la topbar
 */
(function () {
  "use strict";

  /* ── State ───────────────────────────────────────────────── */
  var _allDemands = [];
  var _filter     = "all";
  var _initDone   = false;  /* guard anti-double init */

  /* ── Toast ───────────────────────────────────────────────── */
  function showToast(msg, type) {
    var wrap = document.getElementById("gtr-toast-wrap");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className = "gtr-toast" + (type === "error" ? " gtr-toast--error" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function fmtDate(isoStr) {
    if (!isoStr) return "\u2014";
    try {
      var d   = new Date(isoStr);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      var months = ["jan","fév","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];
      return pad(d.getDate()) + " " + months[d.getMonth()] + " " + d.getFullYear()
           + " · " + pad(d.getHours()) + "h" + pad(d.getMinutes());
    } catch (e) { return isoStr; }
  }

  function levelBadge(level) {
    var l = (level || "vert").toLowerCase();
    return "<span class=\"gtr-badge-level gtr-badge-level--" + l + "\">" + l.toUpperCase() + "</span>";
  }

  function statusBadge(status) {
    var map = {
      pending:  { cls: "pending",  label: "EN ATTENTE" },
      approved: { cls: "approved", label: "APPROU\u00c9E" },
      refused:  { cls: "refused",  label: "REFUS\u00c9E" }
    };
    var s = map[status] || map.pending;
    return "<span class=\"gtr-badge-status gtr-badge-status--" + s.cls + "\">" + s.label + "</span>";
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* ── Render stats ────────────────────────────────────────── */
  function renderStats(demands) {
    function set(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    set("stat-total",    demands.length);
    set("stat-pending",  demands.filter(function (d) { return d.status === "pending"; }).length);
    set("stat-approved", demands.filter(function (d) { return d.status === "approved"; }).length);
    set("stat-refused",  demands.filter(function (d) { return d.status === "refused"; }).length);
  }

  /* ── Render demand card ──────────────────────────────────── */
  function demandCardHtml(d) {
    var isPending = d.status === "pending";
    var msgHtml = d.message
      ? "<div class=\"gtr-demand-card__message\">\u201c" + _esc(d.message) + "\u201d</div>"
      : "";
    var actionsHtml = isPending
      ? "<div class=\"gtr-demand-card__actions\">" +
        "<button class=\"gtr-btn-approve\" onclick=\"window.__gtrApprove('" + _esc(d.id) + "')\">✓ Approuver</button>" +
        "<button class=\"gtr-btn-refuse\"  onclick=\"window.__gtrRefuse('"  + _esc(d.id) + "')\">✕ Refuser</button>" +
        "</div>"
      : "";
    var phoneRow = d.phone
      ? "<div class=\"gtr-demand-card__meta-row\">" +
        "<span class=\"gtr-demand-card__meta-icon\">📞</span>" +
        "<span>" + _esc(d.phone) + "</span></div>"
      : "";

    return "<div class=\"gtr-demand-card\" id=\"dc-" + _esc(d.id) + "\">" +
      "<div class=\"gtr-demand-card__head\">" +
        "<span class=\"gtr-demand-card__name\">" + _esc((d.first_name || "") + " " + (d.last_name || "")) + "</span>" +
        "<div class=\"gtr-demand-card__badges\">" + levelBadge(d.level) + statusBadge(d.status || "pending") + "</div>" +
      "</div>" +
      "<div class=\"gtr-demand-card__meta\">" +
        "<div class=\"gtr-demand-card__meta-row\">" +
          "<span class=\"gtr-demand-card__meta-icon\">✉</span>" +
          "<span>" + _esc(d.email || "") + "</span></div>" +
        phoneRow +
        "<div class=\"gtr-demand-card__meta-row\">" +
          "<span class=\"gtr-demand-card__meta-icon\">🗓</span>" +
          "<span>" + fmtDate(d.created_at) + "</span></div>" +
      "</div>" +
      msgHtml +
      actionsHtml +
    "</div>";
  }

  /* ── Render list ─────────────────────────────────────────── */
  function renderList() {
    var list = document.getElementById("gtr-demands-list");
    if (!list) return;

    var filtered = _allDemands;
    if (_filter === "pending")  filtered = _allDemands.filter(function (d) { return d.status === "pending"; });
    if (_filter === "approved") filtered = _allDemands.filter(function (d) { return d.status === "approved"; });
    if (_filter === "refused")  filtered = _allDemands.filter(function (d) { return d.status === "refused"; });

    if (filtered.length === 0) {
      list.innerHTML = "<div class=\"gtr-empty\">Aucune demande pour ce filtre.</div>";
      return;
    }
    list.innerHTML = filtered.map(demandCardHtml).join("");
  }

  /* ── Fetch all demands ───────────────────────────────────── */
  async function loadDemands() {
    var list = document.getElementById("gtr-demands-list");
    if (list) {
      list.innerHTML =
        "<div class=\"gtr-loading\">" +
        "<div class=\"gtr-loading__dot\"></div>" +
        "<div class=\"gtr-loading__dot\"></div>" +
        "<div class=\"gtr-loading__dot\"></div>" +
        "</div>";
    }
    /* CORRECTION : utiliser window.goeloGetSb() — pas de nouveau client */
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb) {
      console.warn("[admin] Supabase pas prêt, retry..."); 
      setTimeout(loadDemands, 500); 
      return;
    }
    try {
      var result = await sb
        .from("demandes")
        .select("*")
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      _allDemands = result.data || [];
      renderStats(_allDemands);
      renderList();
    } catch (err) {
      console.error("[admin] loadDemands:", err);
      if (list) list.innerHTML = "<div class=\"gtr-empty\" style=\"color:var(--red)\">Erreur : " + _esc(err.message) + "</div>";
      showToast("Impossible de charger les demandes", "error");
    }
  }

  /* ── Approve ─────────────────────────────────────────────── */
  async function approveDemand(id) {
    var btns = document.querySelectorAll("#dc-" + id + " button");
    btns.forEach(function (b) { b.disabled = true; });
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb) { showToast("Client Supabase non disponible", "error"); return; }
    try {
      var result = await sb.from("demandes").update({ status: "approved" }).eq("id", id);
      if (result.error) throw result.error;
      showToast("Demande approuvée ✓");
      await loadDemands();
    } catch (err) {
      console.error("[admin] approveDemand:", err);
      showToast("Erreur : " + err.message, "error");
      btns.forEach(function (b) { b.disabled = false; });
    }
  }

  /* ── Refuse ──────────────────────────────────────────────── */
  async function refuseDemand(id) {
    var btns = document.querySelectorAll("#dc-" + id + " button");
    btns.forEach(function (b) { b.disabled = true; });
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb) { showToast("Client Supabase non disponible", "error"); return; }
    try {
      var result = await sb.from("demandes").update({ status: "refused" }).eq("id", id);
      if (result.error) throw result.error;
      showToast("Demande refusée");
      await loadDemands();
    } catch (err) {
      console.error("[admin] refuseDemand:", err);
      showToast("Erreur : " + err.message, "error");
      btns.forEach(function (b) { b.disabled = false; });
    }
  }

  /* Exposer pour les onclick inline générés dynamiquement */
  window.__gtrApprove = approveDemand;
  window.__gtrRefuse  = refuseDemand;

  /* ── Filter tabs ─────────────────────────────────────────── */
  function bindFilterTabs() {
    document.querySelectorAll(".gtr-tab[data-filter]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".gtr-tab").forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        _filter = tab.getAttribute("data-filter");
        renderList();
      });
    });
  }

  /* ── Show/hide sections ──────────────────────────────────── */
  function showAdmin(user) {
    var gate  = document.getElementById("gtr-admin-gate");
    var panel = document.getElementById("gtr-admin-panel");
    if (gate)  gate.style.display  = "none";
    if (panel) panel.style.display = "block";

    /* Mettre à jour le nom/avatar dans la topbar */
    if (user) {
      var um     = user.user_metadata || {};
      var pseudo = um.pseudo || um.name || (user.email ? user.email.split("@")[0] : "Admin");
      var nameEl = document.getElementById("admin-name");
      var avEl   = document.getElementById("admin-avatar");
      if (nameEl) nameEl.textContent = pseudo;
      if (avEl)   avEl.textContent   = pseudo.slice(0, 2).toUpperCase();
    }
  }

  function showGate() {
    var gate  = document.getElementById("gtr-admin-gate");
    var panel = document.getElementById("gtr-admin-panel");
    if (gate)  gate.style.display  = "flex";
    if (panel) panel.style.display = "none";
  }

  /* ── Init principal ──────────────────────────────────────── */
  function startAdmin(role, user) {
    if (role !== "admin") {
      showGate();
      return;
    }
    if (_initDone) return;
    _initDone = true;

    showAdmin(user);
    bindFilterTabs();
    loadDemands();

    /* Bouton refresh */
    var refreshBtn = document.getElementById("btn-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () { loadDemands(); });
    }

    /* Bouton déconnexion */
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

  /* ── Bootstrap — attendre que auth.js ait résolu le rôle ── */
  document.addEventListener("DOMContentLoaded", function () {

    /* Cas 1 : rôle déjà connu (auth.js plus rapide que DOMContentLoaded) */
    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      startAdmin(window.GOELO_ROLE, window.GOELO_USER);
      return;
    }

    /* Cas 2 : attendre goelo:role-ready */
    window.addEventListener("goelo:role-ready", function handler(e) {
      window.removeEventListener("goelo:role-ready", handler);
      startAdmin(e.detail.role, e.detail.user);
    }, { once: true });

    /* Cas 3 : mode démo ?demo=admin */
    var demo = new URLSearchParams(location.search).get("demo");
    if (demo === "admin") {
      setTimeout(function () {
        var panel = document.getElementById("gtr-admin-panel");
        if (!panel || panel.style.display === "none") {
          startAdmin("admin", {
            email: "admin@demo.local",
            user_metadata: { pseudo: "Admin Demo" }
          });
        }
      }, 2000);
    }
  });

})();
