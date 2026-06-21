/**
 * GoëloRides — /js/team-rider.js
 * ─────────────────────────────────────────────────────────────────
 * Tableau de bord Team Rider / Admin.
 *
 * Corrections appliquées :
 *   • PLUS de createClient() ici — on utilise window.goeloGetSb()
 *   • Détection du rôle via window.GOELO_ROLE (résolu par auth.js)
 *   • renderSorties utilise la table `routes` + front_config
 *   • renderDemands utilise la table `demandes` (Supabase live)
 *   • MOCK_SORTIES / MOCK_DEMANDS supprimés
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  /* ── Constantes ────────────────────────────────────────────── */
  var MONTH_SHORT = ["","JAN","FÉV","MARS","AVR","MAI","JUIN","JUIL","AOÛT","SEPT","OCT","NOV","DÉC"];
  var AV_COLORS   = ["#C8F135","#7DD3FC","#FCA5A5","#FCD34D","#C4B5FD","#86EFAC"];
  var GRUP_COLOR  = { blanc:"#9ca3af", vert:"#C8F135", bleu:"#60a5fa", rouge:"#f87171" };
  var GRUP_LABEL  = { blanc:"Blanc", vert:"Vert", bleu:"Bleu", rouge:"Rouge" };

  var URGENCE_MSGS = {
    retard:    "\u23f1 GOËLORIDES \u2014 Retard\n\nD\u00e9part retard\u00e9 de 15 min.\nMerci de patienter au Parking du Kasino.\n\n\uD83D\uDCAC Message du Team Rider",
    annulation:"\u274C GOËLORIDES \u2014 Annulation\n\nSortie annul\u00e9e \u2014 conditions m\u00e9t\u00e9o.\n\nProchaine sortie bient\u00f4t\u00a0:\ngoelorides.onrender.com",
    meteo:     "\uD83C\uDF27 GOËLORIDES \u2014 M\u00e9t\u00e9o\n\nSortie maintenue \u2705\nAverses possibles \u2014 coupe-vent recommand\u00e9.\n\n\u23f0 Horaire inchang\u00e9",
    rdv:       "\uD83D\uDCCD GOËLORIDES \u2014 Changement RDV\n\n\u26A0\uFE0F Nouveau point de d\u00e9part\u00a0:\nParking de la plage du Ch\u00e2telet\n(et non le Kasino)\n\n\u23f0 Horaire inchang\u00e9"
  };

  var _currentFilter = "all";
  var _currentRole   = "teamrider";
  var _currentEmail  = "";

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

  /* ── Helpers ────────────────────────────────────────────────── */
  function initials(str) {
    return String(str || "").split(" ").map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase();
  }
  function scrollToId(id) { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }

  /* ── front_config parser ─────────────────────────────────────── */
  function parseFc(raw) {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }

  /* Convertit une ligne `routes` en carte normalisée */
  function routeToCard(row) {
    var fc    = parseFc(row.front_config);
    var stats = fc.stats || {};
    var statut = fc.sortieStatus === "cancelled" ? "annulee"
               : fc.visibility   === "public"    ? "publiee"
               : "brouillon";
    return {
      id:        row.id,
      titre:     row.track_name || "\u2014",
      groupe:    row.group_label || "\u2014",
      pace:      row.pace_label  || "\u2014",
      statut:    statut,
      km:        stats.totalKm    != null ? stats.totalKm   : (fc.km    != null ? fc.km    : null),
      dplus:     stats.elevGainM  != null ? stats.elevGainM : (fc.dplus != null ? fc.dplus : null),
      date:      fc.rideDateIso   || null,
      meetTime:  fc.meetTime      || fc.rideTime || null,
      meetPlace: fc.meetPlace     || "Devant le Kasino",
      captain:   fc.captain       || fc.rideLeader || "\u2014",
      isActive:  row.is_active !== false
    };
  }

  /* ══════════════════════════════════════════════════════════════
     BOOT — appelé quand le rôle est connu
     ══════════════════════════════════════════════════════════════ */
  async function boot(role, user) {
    _currentRole  = role;
    _currentEmail = (user && user.email) ? user.email : "";
    var pseudo    = _getPseudo(user);

    var dash = document.getElementById("dashboard");
    var gate = document.getElementById("gate-panel");

    if (!dash || !gate) {
      console.warn("[team-rider] DOM pas prêt");
      return;
    }

    gate.style.display = "none";
    dash.style.display = "block";

    document.getElementById("user-name").textContent   = pseudo + " (" + role + ")";
    document.getElementById("user-avatar").textContent = initials(pseudo);

    var badge = document.getElementById("role-badge");
    if (role === "admin") {
      badge.textContent = "\uD83D\uDC51 ADMIN";
      badge.classList.add("is-admin");
    } else {
      badge.textContent = "\uD83D\uDEB4 TEAM RIDER";
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
     RENDER SORTIES — depuis table `routes`
     ══════════════════════════════════════════════════════════════ */
  async function renderSorties() {
    var list = document.getElementById("sorties-list");
    if (!list) return;
    list.innerHTML = "<p style=\"font-size:.82rem;color:var(--muted)\">Chargement\u2026</p>";

    var sb = window.goeloGetSb();
    if (!sb) {
      list.innerHTML = "<p style=\"color:var(--red)\">Client Supabase non disponible.</p>";
      return;
    }

    var query = sb
      .from("routes")
      .select("id, track_name, group_label, pace_label, sort_order, is_active, front_config, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at",  { ascending: false });

    /* Admins voient tout ; team riders voient seulement les actives */
    if (_currentRole !== "admin") {
      query = query.eq("is_active", true);
    }

    var result = await query;
    if (result.error) {
      console.error("[team-rider.js] renderSorties:", result.error.message);
      list.innerHTML = "<p style=\"color:var(--red)\">Erreur : " + result.error.message + "</p>";
      return;
    }

    var cards = (result.data || []).map(routeToCard);

    /* Filtres UI */
    if (_currentFilter === "publiee") {
      cards = cards.filter(function (c) { return c.statut === "publiee"; });
    } else if (_currentFilter === "brouillon") {
      cards = cards.filter(function (c) { return c.statut === "brouillon"; });
    } else if (_currentFilter === "mine") {
      var email = _currentEmail;
      var pseudo = email ? email.split("@")[0] : "";
      cards = cards.filter(function (c) {
        return email && (c.captain === email || c.captain === pseudo);
      });
    }

    if (cards.length === 0) {
      list.innerHTML = "<p style=\"font-size:.82rem;color:var(--muted);padding:.5rem 0\">Aucune sortie pour ce filtre.</p>";
      return;
    }

    list.innerHTML = cards.map(function (c) {
      var gc        = GRUP_COLOR[_groupKey(c.groupe)] || "#888";
      var gl        = c.groupe;
      var badgeCls  = c.statut === "publiee"  ? "badge-pub"
                    : c.statut === "annulee"  ? "badge-cancel"
                    : "badge-draft";
      var badgeTxt  = c.statut === "publiee"  ? "PUB"
                    : c.statut === "annulee"  ? "ANNUL\u00c9"
                    : "DRAFT";
      var kmStr     = c.km    != null ? c.km    + " km"   : "\u2014 km";
      var dplusStr  = c.dplus != null ? c.dplus + " m D+" : "\u2014 m D+";
      var dateObj   = c.date ? new Date(c.date + "T00:00:00") : null;
      var day       = dateObj ? dateObj.getDate() : "?";
      var month     = dateObj ? MONTH_SHORT[dateObj.getMonth() + 1] : "";
      var titleEsc  = String(c.titre || "").replace(/'/g, "\\'");

      var actions =
        "<button class=\"btn-sm\" onclick=\"location.href='parcours.html?id=" + c.id + "'\">👁 Voir</button>" +
        "<button class=\"btn-sm accent\" onclick=\"location.href='gestion-sorties.html?mode=edit&id=" + c.id + "'\">✏️ Modifier</button>" +
        "<button class=\"btn-sm danger\" onclick=\"cancelSortie(" +
        JSON.stringify(c.id) + "," +
        JSON.stringify(c.titre) +
        ",this)\">✕ Annuler</button>";

      return [
        "<div class=\"sortie-card\" data-s=\"" + c.statut + "\">",
        "<div class=\"sortie-main\">",
        "<div class=\"s-date\"><div class=\"s-date-n\">" + day + "</div><div class=\"s-date-m\">" + month + "</div></div>",
        "<div class=\"s-info\">",
        "<div class=\"s-title\">" + _esc(c.titre) + "</div>",
        "<div class=\"s-sub\">" + kmStr + " \u00b7 " + dplusStr + " \u00b7 " + _esc(gl) + "</div>",
        "</div>",
        "<div class=\"dot-niv\" style=\"background:" + gc + "\"></div>",
        "<span class=\"badge " + badgeCls + "\">" + badgeTxt + "</span>",
        "</div>",
        "<div class=\"s-inscrits\"><span class=\"inscrits-txt\">Capitaine : <strong>" + _esc(c.captain) + "</strong></span></div>",
        "<div class=\"s-actions\">" + actions + "</div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function _groupKey(groupLabel) {
    var gl = String(groupLabel || "").toLowerCase();
    if (gl.indexOf("blanc")  !== -1) return "blanc";
    if (gl.indexOf("vert")   !== -1) return "vert";
    if (gl.indexOf("bleu")   !== -1) return "bleu";
    if (gl.indexOf("rouge")  !== -1) return "rouge";
    return "vert";
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ── Filtre tabs ────────────────────────────────────────────── */
  function filterSorties(filter, btn) {
    document.querySelectorAll(".stab").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    _currentFilter = filter;
    renderSorties();
  }
  window.filterSorties = filterSorties; /* exposé pour les onclick inline du HTML */

  /* ── Annuler une sortie ─────────────────────────────────────── */
  async function cancelSortie(id, titre, btn) {
    if (!confirm("Annuler \"" + titre + "\" ?\n\nPense \u00e0 envoyer un message urgence aux participants.")) return;
    var sb = window.goeloGetSb();
    if (!sb) { toast("Client Supabase non disponible."); return; }

    try {
      /* Lire le front_config actuel */
      var fetch = await sb.from("routes").select("front_config").eq("id", id).single();
      if (fetch.error) throw fetch.error;
      var fc = parseFc(fetch.data.front_config);
      fc.sortieStatus = "cancelled";

      var upd = await sb.from("routes").update({ front_config: fc }).eq("id", id);
      if (upd.error) throw upd.error;

      /* Mise à jour visuelle immédiate */
      var card  = btn.closest(".sortie-card");
      var badge = card ? card.querySelector(".badge") : null;
      if (badge) { badge.className = "badge badge-cancel"; badge.textContent = "ANNUL\u00c9"; }
      toast("Sortie \"" + titre + "\" annul\u00e9e \u2014 envoie un message Messenger \u2193");
      setTimeout(function () { scrollToId("urgence-section"); }, 800);

    } catch (err) {
      console.error("[team-rider.js] cancelSortie:", err.message);
      toast("Erreur : " + err.message);
    }
  }
  window.cancelSortie = cancelSortie;

  /* ══════════════════════════════════════════════════════════════
     RENDER DEMANDES — depuis table `demandes` (admins uniquement)
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
        ? "<div class=\"d-actions\"><button class=\"da-approve\" onclick=\"approveDemand(" + i + ",'" + d.id + "')\">✓ APPROUVER</button>" +
          "<button class=\"da-refuse\" onclick=\"refuseDemand(" + i + ",'" + d.id + "')\">✕ REFUSER</button></div>"
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
  async function refuseDemand(i, id) {
    var sb = window.goeloGetSb();
    if (!sb) return;
    var r = await sb.from("demandes").update({ status: "refused" }).eq("id", id);
    if (r.error) { toast("Erreur : " + r.error.message); return; }
    toast("Demande refus\u00e9e \u2715");
    renderDemands();
  }
  window.approveDemand = approveDemand;
  window.refuseDemand  = refuseDemand;

  /* ══════════════════════════════════════════════════════════════
     URGENCE (inchangé, design identique)
     ══════════════════════════════════════════════════════════════ */
  function genUrgence(btn, type) {
    var result = btn.querySelector(".u-result");
    if (result.style.display === "block") { result.style.display = "none"; return; }
    var msg = URGENCE_MSGS[type] || "";
    result.textContent   = msg;
    result.style.display = "block";
    navigator.clipboard?.writeText(msg).then(function () { toast("Message copi\u00e9 \u2014 colle dans Messenger"); });
    if (!btn.querySelector(".u-copy")) {
      var copyBtn = document.createElement("button");
      copyBtn.className   = "u-copy";
      copyBtn.textContent = "\uD83D\uDCCB Copier \u00e0 nouveau";
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        navigator.clipboard?.writeText(msg).then(function () { toast("Copi\u00e9\u00a0!"); });
      });
      result.after(copyBtn);
    }
  }
  window.genUrgence = genUrgence;

  /* ══════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════ */
  document.addEventListener("DOMContentLoaded", function () {

     function startWithRole(role, user) {
       if (!window.GOELO_ROLE || (window.GOELO_ROLE !== "team_rider" && window.GOELO_ROLE !== "admin")) {
         /* Pas teamrider ni admin → afficher le gate */
         document.getElementById("gate-panel").style.display = "block";
         document.getElementById("dashboard").style.display  = "none";
         return;
       }

       boot(role, user);
     }

    /* Cas 1 : rôle déjà connu (auth.js rapide) */
    if (window.GOELO_ROLE && window.GOELO_ROLE !== "visitor") {
      startWithRole(window.GOELO_ROLE, window.GOELO_USER);
      return;
    }

    /* Cas 2 : attendre l'événement */
    window.addEventListener("goelo:role-ready", function handler(e) {
      window.removeEventListener("goelo:role-ready", handler);
      startWithRole(e.detail.role, e.detail.user);
    }, { once: true });

    /* Cas 3 : mode démo via ?demo=admin ou ?demo=teamrider */
    var demo = new URLSearchParams(location.search).get("demo");
    if (demo === "admin" || demo === "teamrider") {
      /* Laisser auth.js faire son travail, mais si après 2s rien
         n'est venu (pas de session), utiliser le mode démo */
      setTimeout(function () {
        if (document.getElementById("dashboard").style.display === "none" ||
            !document.getElementById("dashboard").style.display) {
          boot(demo, { email: demo + "@demo.local", user_metadata: { pseudo: demo === "admin" ? "Admin" : "Team Rider" } });
        }
      }, 2000);
    }

    /* Re-écouter les changements de session (ex. connexion depuis la modale) */
    window.addEventListener("goelo:auth-success", function (e) {
      startWithRole(window.GOELO_ROLE, window.GOELO_USER);
    });
  });

async function submitSignup(email, password) {
  const sb = window.goeloGetSb();

  if (!sb) {
    console.error("Supabase non initialisé");
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email: email.trim().toLowerCase(),
    password: password
  });

  if (error) {
    console.error("SIGNUP ERROR:", error.message);
    _showError("Erreur inscription : " + error.message);
    return;
  }

  console.log("SIGNUP OK:", data);

  _showError("Compte créé ! Vérifie ton email pour confirmer.", true);
}
})();
