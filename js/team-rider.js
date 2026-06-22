/**
 * GoëloRides — /js/team-rider.js
 */
(function () {
  "use strict";

  var _currentFilter = "all";
  var _currentRole   = "visitor";
  var _currentEmail  = "";
  var _bootDone      = false;

  var URGENCE_MSGS = {
    retard:    "\u23f1 GOËLORIDES \u2014 Retard\n\nD\u00e9part retard\u00e9 de 15 min.\nMerci de patienter au Parking du Kasino.\n\n\uD83D\uDCAC Message du Team Rider",
    annulation:"\u274C GOËLORIDES \u2014 Annulation\n\nSortie annul\u00e9e \u2014 conditions m\u00e9t\u00e9o.\n\nProchaine sortie bient\u00f4t\u00a0:\ngoelorides.onrender.com",
    meteo:     "\uD83C\uDF27 GOËLORIDES \u2014 M\u00e9t\u00e9o\n\nSortie maintenue \u2705\nAverses possibles \u2014 coupe-vent recommand\u00e9.\n\n\u23f0 Horaire inchang\u00e9",
    rdv:       "\uD83D\uDCCD GOËLORIDES \u2014 Changement RDV\n\n\u26A0\uFE0F Nouveau point de d\u00e9part\u00a0:\nParking de la plage du Ch\u00e2telet\n(et non le Kasino)\n\n\u23f0 Horaire inchang\u00e9"
  };

  /* ── Toast ─────────────────────────────────────────────────── */
  function toast(msg) {
    var wrap = document.getElementById("toast-wrap");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className   = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function initials(str) {
    return String(str || "").split(" ").map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase();
  }

  function scrollToId(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }
  window.scrollToId = scrollToId;

  function parseFc(raw) {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  /* ══════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════ */
  async function boot(role, user) {
    /* CORRECTION M3+M4 : guard anti-double boot */
    if (_bootDone) {
      console.log("[team-rider] boot() déjà exécuté, ignoré");
      return;
    }
    _bootDone = true;

    _currentRole  = role;
    _currentEmail = (user && user.email) ? user.email : "";

    var pseudo = _getPseudo(user);

    var dash = document.getElementById("dashboard");
    var gate = document.getElementById("gate-panel");

    /* CORRECTION M2+M3 : null-checks exhaustifs */
    if (!dash || !gate) {
      console.warn("[team-rider] Éléments dashboard/gate introuvables dans le DOM");
      return;
    }

    gate.style.display = "none";
    dash.style.display = "block";

    var userNameEl   = document.getElementById("user-name");
    var userAvatarEl = document.getElementById("user-avatar");
    var badgeEl      = document.getElementById("role-badge");

    if (userNameEl)   userNameEl.textContent   = pseudo + " (" + role + ")";
    if (userAvatarEl) userAvatarEl.textContent = initials(pseudo);
    if (badgeEl) {
      badgeEl.className = "topbar-badge go-role-badge go-role-badge--" + role;
      if (role === "admin") {
        badgeEl.textContent = "ADMIN";
      } else {
        badgeEl.textContent = "TEAM RIDER";
      }
    }

    await renderSorties();
    if (role === "admin") renderDemands();
  }

  function _getPseudo(user) {
    if (!user) return "Team Rider";
    var um = user.user_metadata || {};
    return um.pseudo || um.name || (user.email ? user.email.split("@")[0] : "Team Rider");
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER SORTIES
     ══════════════════════════════════════════════════════════════ */
  async function renderSorties() {
    var list = document.getElementById("sorties-list");
    if (!list) return;
    list.innerHTML = "<p class=\"go-sc-empty\">Chargement…</p>";

    var sb = window.goeloGetSb();
    if (!sb) {
      list.innerHTML = "<p class=\"go-sc-empty\" style=\"color:var(--red)\">Client Supabase non disponible.</p>";
      return;
    }

    if (!window.GoeloSortieCards) {
      list.innerHTML = "<p class=\"go-sc-empty\">Module cartes non chargé.</p>";
      return;
    }

    var query = sb
      .from("routes")
      .select("id, track_name, group_label, pace_label, sort_order, is_active, front_config, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at",  { ascending: false });

    if (_currentRole !== "admin") {
      query = query.eq("is_active", true);
    }

    var result = await query;
    if (result.error) {
      console.error("[team-rider.js] renderSorties:", result.error.message);
      list.innerHTML = "<p class=\"go-sc-empty\" style=\"color:var(--red)\">Erreur : " + result.error.message + "</p>";
      return;
    }

    var cards = (result.data || []).map(function (row) {
      return window.GoeloSortieCards.fromRouteRow(row);
    });

    if (_currentFilter === "publiee") {
      cards = cards.filter(function (c) { return c.statut === "publiee"; });
    } else if (_currentFilter === "brouillon") {
      cards = cards.filter(function (c) { return c.statut === "brouillon"; });
    } else if (_currentFilter === "mine") {
      cards = cards.filter(function (c) {
        return window.GoeloSortieCards.isCardOwner(c, window.GOELO_USER);
      });
    }

    try {
      var partRpc = await sb.rpc("signup_list_all_names", {});
      if (!partRpc.error && partRpc.data) {
        var byRoute = partRpc.data;
        if (Array.isArray(byRoute) && byRoute.length) byRoute = byRoute[0];
        if (byRoute && typeof byRoute === "object") {
          cards.forEach(function (c) {
            var v = byRoute[c.id];
            if (!v) return;
            var arr = Array.isArray(v) ? v : (v.participants || []);
            c.participants = arr.map(function (p) {
              return typeof p === "string" ? p : (p.pseudo || p.email || "?");
            });
          });
        }
      }
    } catch (e) { void e; }

    window.GoeloSortieCards.renderList(cards, list, {
      viewMode: "team-rider",
      emptyHtml: "<p class=\"go-sc-empty\">Aucune sortie pour ce filtre.</p>"
    });
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function filterSorties(filter, btn) {
    document.querySelectorAll(".stab").forEach(function (b) { b.classList.remove("active"); });
    if (btn) btn.classList.add("active");
    _currentFilter = filter;
    renderSorties();
  }
  window.filterSorties = filterSorties;

  async function cancelSortie(id, titre, btn) {
    if (!confirm("Annuler \"" + titre + "\" ?\n\nPense \u00e0 envoyer un message urgence aux participants.")) return;
    var sb = window.goeloGetSb();
    if (!sb) { toast("Client Supabase non disponible."); return; }
    try {
      var fetch = await sb.from("routes").select("front_config").eq("id", id).single();
      if (fetch.error) throw fetch.error;
      var fc = parseFc(fetch.data.front_config);
      fc.sortieStatus = "cancelled";
      var upd = await sb.from("routes").update({ front_config: fc }).eq("id", id);
      if (upd.error) throw upd.error;
      var card  = btn ? btn.closest(".go-sc-card") : null;
      var badge = card ? card.querySelector(".go-sc-badge--statut") : null;
      if (card) card.classList.add("is-cancelled");
      if (badge) {
        badge.className = "go-sc-badge go-sc-badge--statut go-sc-badge--cancel";
        badge.textContent = "Annulée";
      }
      toast("Sortie \"" + titre + "\" annul\u00e9e \u2014 envoie un message Messenger \u2193");
      setTimeout(function () { scrollToId("urgence-section"); }, 800);
    } catch (err) {
      console.error("[team-rider.js] cancelSortie:", err.message);
      toast("Erreur : " + err.message);
    }
  }
  window.cancelSortie = cancelSortie;

  /* ══════════════════════════════════════════════════════════════
     RENDER DEMANDES
     ══════════════════════════════════════════════════════════════ */
  async function renderDemands() {
    var section = document.getElementById("demands-section");
    var list    = document.getElementById("demand-list");
    var label   = document.getElementById("demands-count-label");
    if (!section || !list) return;
    section.style.display = "block";

    var sb = window.goeloGetSb();
    if (!sb) { list.innerHTML = "<p style=\"color:var(--red)\">Client Supabase non disponible.</p>"; return; }

    var result = await sb
      .from("demandes")
      .select("*")
      .order("created_at", { ascending: false });

    if (result.error) {
      console.error("[team-rider.js] renderDemands:", result.error.message);
      list.innerHTML = "<p style=\"color:var(--red)\">Erreur demandes : " + result.error.message + "</p>";
      return;
    }

    var demands = result.data || [];
    var pending = demands.filter(function (d) { return !d.status || d.status === "pending"; }).length;
    if (label) label.textContent = pending > 0 ? "\u00b7 " + pending + " en attente" : "\u00b7 Aucune en attente";

    if (demands.length === 0) {
      list.innerHTML = "<p style=\"font-size:.82rem;color:var(--muted)\">Aucune demande.</p>";
      return;
    }

    list.innerHTML = demands.map(function (d, i) {
      var isPending = !d.status || d.status === "pending";
      var statusLbl = d.status === "approved" ? "\u2713 APPROUV\u00c9E"
                    : d.status === "refused"  ? "\u2715 REFUS\u00c9E"
                    : "EN ATTENTE";
      var statusCls = d.status === "approved" ? "badge-pub"
                    : d.status === "refused"  ? "badge-cancel"
                    : "badge-att";
      var name  = _esc(d.name || d.first_name || "\u2014");
      var email = _esc(d.email || "");
      var quote = d.message ? "<div class=\"d-quote\">\u201c " + _esc(d.message) + " \u201d</div>" : "";
      var date  = d.created_at ? d.created_at.slice(0, 10) : (d.date || "");
      var actions = isPending
        ? "<div class=\"d-actions\">" +
          "<button class=\"da-approve\" onclick=\"approveDemand(" + i + ",'" + d.id + "')\">✓ APPROUVER</button>" +
          "<button class=\"da-refuse\" onclick=\"refuseDemand(" + i + ",'" + d.id + "')\">✕ REFUSER</button>" +
          "</div>"
        : "";
      return [
        "<div class=\"demand-card\" id=\"dc-" + i + "\">",
        "<div class=\"d-head\"><span class=\"d-name\">" + name + "</span><span class=\"badge " + statusCls + "\" id=\"dbadge-" + i + "\">" + statusLbl + "</span></div>",
        "<div class=\"d-meta\">" + email + (date ? " \u00b7 " + date : "") + "</div>",
        quote,
        actions,
        "</div>"
      ].join("");
    }).join("");
  }
  window.renderDemands = renderDemands;

  async function approveDemand(i, id) {
    var sb = window.goeloGetSb();
    if (!sb) return;
    var r = await sb.from("demandes").update({ status: "approved" }).eq("id", id);
    if (r.error) { toast("Erreur : " + r.error.message); return; }
    toast("Demande approuv\u00e9e \u2713");
    renderDemands();
  }
  window.approveDemand = approveDemand;

  async function refuseDemand(i, id) {
    var sb = window.goeloGetSb();
    if (!sb) return;
    var r = await sb.from("demandes").update({ status: "refused" }).eq("id", id);
    if (r.error) { toast("Erreur : " + r.error.message); return; }
    toast("Demande refus\u00e9e \u2715");
    renderDemands();
  }
  window.refuseDemand = refuseDemand;

  /* ══════════════════════════════════════════════════════════════
     URGENCE
     ══════════════════════════════════════════════════════════════ */
  function genUrgence(btn, type) {
    /* CORRECTION m DOM : null-check sur u-result */
    var result = btn ? btn.querySelector(".u-result") : null;
    if (!result) return;
    if (result.style.display === "block") { result.style.display = "none"; return; }
    var msg = URGENCE_MSGS[type] || "";
    result.textContent   = msg;
    result.style.display = "block";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(function () {
        toast("Message copi\u00e9 \u2014 colle dans Messenger");
      });
    }
    if (!btn.querySelector(".u-copy")) {
      var copyBtn = document.createElement("button");
      copyBtn.className   = "u-copy";
      copyBtn.textContent = "\uD83D\uDCCB Copier \u00e0 nouveau";
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(msg).then(function () { toast("Copi\u00e9\u00a0!"); });
        }
      });
      result.after(copyBtn);
    }
  }
  window.genUrgence = genUrgence;

  /* ══════════════════════════════════════════════════════════════
     INIT — point d'entrée unique
     ══════════════════════════════════════════════════════════════ */
  function startWithRole(role, user) {
    var gate = document.getElementById("gate-panel");
    var dash = document.getElementById("dashboard");

    /* CORRECTION M2 : null-checks avant accès à .style */
    if (!gate || !dash) {
      console.warn("[team-rider] gate-panel ou dashboard introuvable");
      return;
    }

    /* CORRECTION C5 : comparer avec "team_rider" (format officiel) */
    if (role !== "team_rider" && role !== "admin") {
      gate.style.display = "block";
      dash.style.display = "none";
      return;
    }

    boot(role, user);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-go-sc-cancel]");
      if (!btn) return;
      e.preventDefault();
      cancelSortie(
        btn.getAttribute("data-go-sc-cancel"),
        btn.getAttribute("data-go-sc-title") || "cette sortie",
        btn
      );
    });

    /* Cas 1 : rôle déjà connu (auth.js plus rapide) */
    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      startWithRole(window.GOELO_ROLE, window.GOELO_USER);
      return;
    }

    /* Cas 2 : attendre l'événement goelo:role-ready */
    window.addEventListener("goelo:role-ready", function handler(e) {
      window.removeEventListener("goelo:role-ready", handler);
      startWithRole(e.detail.role, e.detail.user);
    }, { once: true });

    /* Cas 3 : mode démo via ?demo=admin ou ?demo=team_rider */
    var demo = new URLSearchParams(location.search).get("demo");
    if (demo === "admin" || demo === "team_rider") {
      setTimeout(function () {
        var dash = document.getElementById("dashboard");
        if (!dash || !dash.style.display || dash.style.display === "none") {
          boot(demo, {
            email: demo + "@demo.local",
            user_metadata: { pseudo: demo === "admin" ? "Admin" : "Team Rider" }
          });
        }
      }, 2000);
    }

    /* CORRECTION M4 : { once: true } pour éviter les appels répétés */
    window.addEventListener("goelo:auth-success", function (e) {
      startWithRole(e.detail.role || window.GOELO_ROLE, window.GOELO_USER);
    }, { once: true });
  });

})();
