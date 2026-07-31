/**
 * GoëloRides — Admin sondages
 */
(function () {
  "use strict";

  function getSb() {
    return window.goeloGetSb ? window.goeloGetSb() : null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showGate(show) {
    var gate = document.getElementById("gtr-admin-gate");
    var panel = document.getElementById("gtr-admin-panel");
    if (gate) gate.style.display = show ? "" : "none";
    if (panel) panel.style.display = show ? "none" : "";
  }

  function setStatus(msg, isError) {
    var el = document.getElementById("poll-admin-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  }

  function defaultOptionsFromLevels() {
    if (window.GoeloLevels && window.GoeloLevels.pollOptionPresets) {
      return window.GoeloLevels.pollOptionPresets();
    }
    return [
      { label: "Découverte", subtitle: "25–40 km · tranquille", emoji: "🟢", level_key: "blanc", sort_order: 0 },
      { label: "Intermédiaire", subtitle: "40–60 km · régulier", emoji: "🔵", level_key: "vert", sort_order: 1 },
      { label: "Confirmé", subtitle: "55–75 km · soutenu", emoji: "🟣", level_key: "bleu", sort_order: 2 },
      { label: "Expert", subtitle: "75 km+ · exigeant", emoji: "🔴", level_key: "rouge", sort_order: 3 }
    ];
  }

  function leaderFromOptions(options) {
    if (!options || !options.length) return null;
    var best = options[0];
    options.forEach(function (o) {
      if (Number(o.votes || 0) > Number(best.votes || 0)) best = o;
    });
    return best;
  }

  function renderPollCard(poll) {
    var opts = poll.options || [];
    var leader = leaderFromOptions(opts);
    var total = poll.votes_count != null ? poll.votes_count : opts.reduce(function (n, o) {
      return n + Number(o.votes || 0);
    }, 0);

    var rows = opts.map(function (o) {
      var votes = Number(o.votes || 0);
      var pct = total ? Math.round((100 * votes) / total) : (o.percent != null ? Number(o.percent) : 0);
      var isLead = leader && String(leader.id) === String(o.id) && total > 0;
      return (
        '<li class="poll-opt' + (isLead ? " is-leader" : "") + '">' +
        '<div class="poll-opt__top">' +
        '<span>' + escapeHtml((o.emoji || "") + " " + o.label) + "</span>" +
        '<span class="poll-opt__stats">' + votes + " · " + pct + "%</span>" +
        "</div>" +
        '<div class="poll-opt__bar"><span style="width:' + pct + '%"></span></div>' +
        (o.subtitle ? '<p class="poll-opt__sub">' + escapeHtml(o.subtitle) + "</p>" : "") +
        "</li>"
      );
    }).join("");

    return (
      '<article class="poll-card' + (poll.is_active ? " is-active" : "") + '" data-poll-id="' + escapeHtml(poll.id) + '">' +
      '<header class="poll-card__head">' +
      '<div>' +
      '<p class="poll-card__badge">' + (poll.is_active ? "Actif" : "Inactif") + "</p>" +
      '<h2 class="poll-card__title">' + escapeHtml(poll.question) + "</h2>" +
      '<p class="poll-card__meta">' + total + " vote" + (total === 1 ? "" : "s") +
      (leader && total ? " · En tête : " + escapeHtml(leader.label) : "") +
      "</p>" +
      "</div>" +
      '<div class="poll-card__actions">' +
      '<button type="button" class="btn-secondary" data-poll-toggle="' + escapeHtml(poll.id) + '" data-active="' +
      (poll.is_active ? "1" : "0") + '">' +
      (poll.is_active ? "Désactiver" : "Activer") +
      "</button>" +
      "</div>" +
      "</header>" +
      '<ul class="poll-card__opts">' + rows + "</ul>" +
      "</article>"
    );
  }

  async function loadList() {
    var root = document.getElementById("poll-admin-list");
    var sb = getSb();
    if (!root || !sb) return;

    root.innerHTML = '<p class="page-sub">Chargement…</p>';
    var res = await sb.rpc("poll_admin_list");
    if (res.error) {
      root.innerHTML = '<p class="page-sub is-error">Erreur : ' + escapeHtml(res.error.message) + "</p>";
      return;
    }
    var data = res.data || {};
    if (data.ok === false) {
      root.innerHTML = '<p class="page-sub is-error">Accès refusé</p>';
      return;
    }
    var polls = data.polls || [];
    if (!polls.length) {
      root.innerHTML = '<p class="page-sub">Aucun sondage pour le moment.</p>';
      return;
    }
    root.innerHTML = polls.map(renderPollCard).join("");
  }

  async function createPoll(e) {
    e.preventDefault();
    var sb = getSb();
    if (!sb) return;

    var questionEl = document.getElementById("poll-question");
    var activateEl = document.getElementById("poll-activate");
    var question = questionEl ? questionEl.value.trim() : "";
    if (question.length < 3) {
      setStatus("Indique une question.", true);
      return;
    }

    setStatus("Création…");
    var res = await sb.rpc("poll_admin_create", {
      p_question: question,
      p_options: defaultOptionsFromLevels(),
      p_slug: null,
      p_activate: !!(activateEl && activateEl.checked)
    });

    if (res.error) {
      setStatus(res.error.message, true);
      return;
    }
    if (res.data && res.data.ok === false) {
      setStatus(res.data.error || "Échec", true);
      return;
    }

    setStatus("Sondage créé.");
    if (questionEl) questionEl.value = "";
    await loadList();
  }

  async function toggleActive(pollId, currentlyActive) {
    var sb = getSb();
    if (!sb) return;
    var res = await sb.rpc("poll_admin_set_active", {
      p_poll_id: pollId,
      p_active: !currentlyActive
    });
    if (res.error) {
      setStatus(res.error.message, true);
      return;
    }
    if (res.data && res.data.ok === false) {
      setStatus(res.data.error || "Échec", true);
      return;
    }
    setStatus(currentlyActive ? "Sondage désactivé." : "Sondage activé.");
    await loadList();
  }

  function bindUi() {
    var form = document.getElementById("poll-create-form");
    if (form) form.addEventListener("submit", createPoll);

    var refresh = document.getElementById("poll-refresh");
    if (refresh) refresh.addEventListener("click", function () { loadList(); });

    var list = document.getElementById("poll-admin-list");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-poll-toggle]");
        if (!btn) return;
        var id = btn.getAttribute("data-poll-toggle");
        var active = btn.getAttribute("data-active") === "1";
        toggleActive(id, active);
      });
    }

    var logout = document.getElementById("admin-logout-btn");
    if (logout) {
      logout.addEventListener("click", function () {
        if (typeof window.goeloSignOut === "function") {
          window.goeloSignOut({ redirect: "/" });
        }
      });
    }
  }

  async function initAdmin() {
    bindUi();

    if (window.GoeloUI && window.GoeloUI.waitForRole) {
      try { await window.GoeloUI.waitForRole(); } catch (e) { void e; }
    }

    var role = window.GOELO_ROLE;
    var user = window.GOELO_USER;
    if (role !== "admin") {
      showGate(true);
      return;
    }

    showGate(false);
    var nameEl = document.getElementById("admin-name");
    var av = document.getElementById("admin-avatar");
    var pseudo = window.GOELO_DISPLAY_NAME || (user && user.email) || "Admin";
    if (nameEl) nameEl.textContent = pseudo;
    if (av) av.textContent = String(pseudo).slice(0, 2).toUpperCase();

    var q = document.getElementById("poll-question");
    if (q && !q.value) {
      q.value = (window.GoeloLevels && window.GoeloLevels.POLL_QUESTION)
        || "Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?";
    }

    await loadList();
  }

  window.addEventListener("goelo:role-ready", function () { initAdmin(); });
  window.addEventListener("goelo:auth-success", function () { initAdmin(); });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdmin);
  } else {
    initAdmin();
  }
})();
