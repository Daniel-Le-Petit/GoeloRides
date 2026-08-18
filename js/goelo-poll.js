/**
 * GoëloRides — Sondages Home (1 clic = vote · résultats %)
 * localStorage voter_key · RPC poll_get_by_slug / poll_vote
 * Un clic remplace le vote existant (1 ligne / identité / sondage).
 * Plusieurs racines : data-poll-slug sur chaque .gr-poll-root
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "goelo_poll_voter_key_v1";
  var VOTED_PREFIX = "goelo_poll_voted_";

  function getSb() {
    return global.goeloGetSb ? global.goeloGetSb() : null;
  }

  function levels() {
    return global.GoeloLevels || {};
  }

  function defaultSlug(root) {
    if (root && root.dataset && root.dataset.pollSlug) {
      return String(root.dataset.pollSlug).trim();
    }
    return levels().POLL_SLUG || "preferences-sorties-v1";
  }

  function isSchedulePoll(slug) {
    var sched = levels().SCHEDULE_POLL_SLUG || "preferences-horaire-v1";
    return String(slug || "") === sched || String(slug || "").indexOf("horaire") !== -1;
  }

  function defaultQuestion(slug) {
    var L = levels();
    if (isSchedulePoll(slug)) {
      return L.SCHEDULE_POLL_QUESTION
        || "Quel jour et quelle heure vous conviennent le mieux pour les sorties GoëloRides ?";
    }
    return L.POLL_QUESTION
      || "Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?";
  }

  function defaultCta(slug) {
    return isSchedulePoll(slug)
      ? "👉 Votez pour votre créneau préféré."
      : "👉 Votez pour votre format préféré.";
  }

  function uuidv4() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVoterKey() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing && existing.length >= 16) return existing;
      var key = uuidv4() + "-" + uuidv4().slice(0, 8);
      localStorage.setItem(STORAGE_KEY, key);
      return key;
    } catch (e) {
      return uuidv4() + "-ephemeral";
    }
  }

  function rememberLocalVote(pollId, optionId) {
    try {
      localStorage.setItem(VOTED_PREFIX + pollId, String(optionId));
    } catch (e) { void e; }
  }

  function readLocalVote(pollId) {
    try {
      return localStorage.getItem(VOTED_PREFIX + pollId) || null;
    } catch (e) {
      return null;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function levelClass(levelKey) {
    var k = String(levelKey || "").toLowerCase();
    if (k === "blanc" || k === "vert" || k === "bleu" || k === "rouge") return "gr-poll__opt--" + k;
    if (k.indexOf("sat-") === 0 || k.indexOf("sun-") === 0 || k.indexOf("week-") === 0) {
      return "gr-poll__opt--schedule";
    }
    return "";
  }

  function hidePoll(root) {
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
    delete root._pollState;
    var wrap = root.closest(".gr-hero-poll") || root.closest(".gr-home-section--poll");
    if (wrap) {
      var siblings = wrap.querySelectorAll(".gr-poll-root");
      var anyVisible = false;
      for (var i = 0; i < siblings.length; i++) {
        if (!siblings[i].hidden && siblings[i].innerHTML) {
          anyVisible = true;
          break;
        }
      }
      if (!anyVisible) wrap.hidden = true;
    }
  }

  function showPollSection(root) {
    root.hidden = false;
    var wrap = root.closest(".gr-hero-poll") || root.closest(".gr-home-section--poll");
    if (wrap) wrap.hidden = false;
  }

  function presetsForSlug(slug) {
    var L = levels();
    if (isSchedulePoll(slug)) {
      return L.schedulePollOptionPresets ? L.schedulePollOptionPresets() : [];
    }
    return L.pollOptionPresets ? L.pollOptionPresets() : [];
  }

  function normalizeOptions(options, slug) {
    var presets = presetsForSlug(slug);
    var byKey = {};
    presets.forEach(function (p) { byKey[p.level_key] = p; });

    return (options || []).map(function (opt) {
      var key = String(opt.level_key || "").toLowerCase();
      var preset = byKey[key] || null;
      if (!preset) {
        var label = String(opt.label || "").toLowerCase();
        for (var i = 0; i < presets.length; i++) {
          if (label.indexOf(String(presets[i].label).toLowerCase()) !== -1) {
            preset = presets[i];
            break;
          }
        }
      }
      if (!preset) return opt;
      return {
        id: opt.id,
        label: preset.label,
        subtitle: preset.subtitle,
        emoji: preset.emoji,
        level_key: preset.level_key,
        sort_order: opt.sort_order,
        percent: opt.percent
      };
    });
  }

  function findOption(options, id) {
    var sid = id ? String(id) : "";
    for (var i = 0; i < (options || []).length; i++) {
      if (String(options[i].id) === sid) return options[i];
    }
    return null;
  }

  function applyServerPayload(root, poll, options, myOptionId) {
    var slug = (poll && poll.slug) || defaultSlug(root);
    var normalized = normalizeOptions(options || [], slug);
    var myId = myOptionId ? String(myOptionId) : null;
    if (myId && poll && poll.id) rememberLocalVote(poll.id, myId);

    root._pollState = {
      poll: poll,
      options: options || [],
      my_option_id: myId,
      has_voted: !!myId,
      slug: slug
    };

    render(root);
  }

  function render(root) {
    var state = root._pollState;
    if (!state || !state.poll) return;

    var poll = state.poll;
    var slug = state.slug || poll.slug || defaultSlug(root);
    var options = normalizeOptions(state.options || [], slug);
    var myId = state.my_option_id ? String(state.my_option_id) : null;
    var myOpt = findOption(options, myId);
    var question = (poll.question && String(poll.question).trim()) || defaultQuestion(slug);

    var html = "";
    html += '<div class="gr-poll">';
    html += '<h2 class="gr-poll__title">' + escapeHtml(question) + "</h2>";

    if (myOpt) {
      html +=
        '<p class="gr-poll__mine-line">Votre choix : ' +
        '<span class="gr-poll__mine-choice">' +
        escapeHtml((myOpt.emoji ? myOpt.emoji + " " : "") + myOpt.label) +
        "</span></p>";
    } else {
      html += '<p class="gr-poll__cta-line">' + escapeHtml(defaultCta(slug)) + "</p>";
    }

    html +=
      '<div class="gr-poll__list" role="listbox" aria-label="' +
      escapeHtml(isSchedulePoll(slug) ? "Créneaux de sortie" : "Formats de sortie") +
      '">';

    options.forEach(function (opt) {
      var id = String(opt.id);
      var isMine = myId && id === myId;
      var pct = myId ? (opt.percent != null ? Number(opt.percent) : 0) : null;
      var cls = "gr-poll__opt " + levelClass(opt.level_key);
      if (isMine) cls += " is-mine";
      if (myId) cls += " is-results";

      html += '<div class="' + cls + '" role="option" aria-selected="' + (isMine ? "true" : "false") + '">';
      
      // Ligne unique : cercle + texte + %
      html +=
        '<button type="button" class="gr-poll__opt-line' + (isMine ? " is-selected" : "") +
        '" data-poll-option="' + escapeHtml(id) +
        '" data-poll-id="' + escapeHtml(poll.id) +
        '" aria-pressed="' + (isMine ? "true" : "false") + '">';
      
      // Cercle contour
      html += '<span class="gr-poll__circle" aria-hidden="true"></span>';
      
      // Texte : titre · subtitle sur une seule ligne
      html += '<span class="gr-poll__opt-text">';
      html += '<span class="gr-poll__label">' + escapeHtml(opt.label) + "</span>";
      if (opt.subtitle) {
        html += '<span class="gr-poll__sub"> · ' + escapeHtml(opt.subtitle) + "</span>";
      }
      html += "</span>";
      
      // Pourcentage aligné à droite (si résultats)
      if (myId) {
        html += '<span class="gr-poll__pct">' + pct + "&nbsp;%</span>";
      }
      
      // Badge "Votre choix" (si sélectionné)
      if (isMine) {
        html += '<span class="gr-poll__badge">Votre choix</span>';
      }
      
      html += "</button>";
      
      // Barre de progression (discrète, sous la ligne)
      if (myId) {
        html += '<div class="gr-poll__bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>';
      }
      
      html += "</div>";
    });

    html += "</div></div>";

    showPollSection(root);
    root.innerHTML = html;
  }

  async function vote(root, pollId, optionId) {
    var sb = getSb();
    if (!sb || !optionId) return;

    var state = root._pollState || {};
    if (state.my_option_id && String(state.my_option_id) === String(optionId)) {
      return;
    }

    var voterKey = getVoterKey();
    var oldChoice = state.my_option_id || null;
    console.info("[GoëloPoll] click-vote", {
      poll_id: pollId,
      slug: state.slug || defaultSlug(root),
      old_choice: oldChoice,
      new_choice: optionId
    });

    root.classList.add("is-busy");
    try {
      var res = await sb.rpc("poll_vote", {
        p_poll_id: pollId,
        p_option_id: optionId,
        p_voter_key: voterKey
      });

      if (res.error) {
        console.warn("[GoëloPoll] vote RPC error:", res.error.message);
        return;
      }

      var data = res.data || {};
      console.info("[GoëloPoll] poll_vote response", {
        ok: data.ok,
        error: data.error || null,
        updated: data.updated,
        my_option_id: data.my_option_id,
        expected: optionId,
        match: String(data.my_option_id) === String(optionId)
      });

      if (data.ok === false) {
        console.error(
          "[GoëloPoll] Vote non mis à jour:",
          data.error,
          "— appliquer supabase/migrations/20260801120000_poll_multi_active_schedule.sql"
        );
        await load(root);
        return;
      }

      applyServerPayload(
        root,
        state.poll,
        data.options || state.options,
        data.my_option_id || optionId
      );
    } catch (err) {
      console.warn("[GoëloPoll] vote exception:", err);
    } finally {
      root.classList.remove("is-busy");
    }
  }

  async function fetchPoll(slug, voterKey) {
    var sb = getSb();
    if (!sb) return null;

    if (slug) {
      var bySlug = await sb.rpc("poll_get_by_slug", {
        p_slug: slug,
        p_voter_key: voterKey
      });
      if (!bySlug.error) return bySlug;

      // Fallback si migration pas encore appliquée
      console.warn("[GoëloPoll] poll_get_by_slug indisponible, fallback poll_get_active:", bySlug.error.message);
    }

    var res = await sb.rpc("poll_get_active", { p_voter_key: voterKey });
    if (res.error) throw res.error;
    return res;
  }

  async function load(root) {
    if (!root) return;
    var sb = getSb();
    if (!sb) {
      hidePoll(root);
      return;
    }

    var slug = defaultSlug(root);

    try {
      var voterKey = getVoterKey();
      var res = await fetchPoll(slug, voterKey);
      if (!res || res.error) {
        console.warn("[GoëloPoll] get:", res && res.error && res.error.message);
        hidePoll(root);
        return;
      }

      var data = res.data || {};
      if (!data.poll) {
        hidePoll(root);
        return;
      }

      // Si fallback poll_get_active a renvoyé un autre sondage, ignorer
      if (slug && data.poll.slug && String(data.poll.slug) !== String(slug)) {
        console.warn("[GoëloPoll] slug mismatch (migration manquante ?)", {
          expected: slug,
          got: data.poll.slug
        });
        hidePoll(root);
        return;
      }

      var localOpt = readLocalVote(data.poll.id);
      var myOpt = data.my_option_id || null;

      if (!data.has_voted && localOpt) {
        myOpt = localOpt;
      } else if (data.has_voted && myOpt) {
        rememberLocalVote(data.poll.id, myOpt);
      }

      console.info("[GoëloPoll] load", {
        poll_id: data.poll.id,
        slug: data.poll.slug || slug,
        my_option_id: myOpt,
        from_server: !!data.my_option_id
      });

      applyServerPayload(root, data.poll, data.options || [], myOpt);
    } catch (err) {
      console.warn("[GoëloPoll] load exception:", err);
      hidePoll(root);
    }
  }

  function bind(root) {
    if (!root || root.dataset.pollBound === "1") return;
    root.dataset.pollBound = "1";
    root.addEventListener("click", function (e) {
      if (root.classList.contains("is-busy")) return;
      var optBtn = e.target.closest("[data-poll-option]");
      if (!optBtn) return;
      e.preventDefault();
      e.stopPropagation();
      var pollId = optBtn.getAttribute("data-poll-id");
      var optionId = optBtn.getAttribute("data-poll-option");
      if (!pollId || !optionId) return;
      vote(root, pollId, optionId);
    });
  }

  function resolveRoot(selector) {
    return typeof selector === "string"
      ? document.querySelector(selector)
      : selector;
  }

  function init(selector) {
    var root = resolveRoot(selector);
    if (!root) {
      console.warn("[GoëloPoll] init: root introuvable", selector);
      return;
    }
    console.info("[GoëloPoll] init OK", root.id || root.className, defaultSlug(root));
    bind(root);
    load(root);
  }

  function initAll(selector) {
    var nodes = document.querySelectorAll(selector || ".gr-poll-root[data-poll-slug]");
    for (var i = 0; i < nodes.length; i++) {
      init(nodes[i]);
    }
  }

  function reloadAll(selector) {
    var nodes = document.querySelectorAll(selector || ".gr-poll-root[data-poll-slug]");
    for (var i = 0; i < nodes.length; i++) {
      load(nodes[i]);
    }
  }

  global.GoeloPoll = {
    init: init,
    initAll: initAll,
    load: load,
    reloadAll: reloadAll,
    getVoterKey: getVoterKey
  };
})(typeof window !== "undefined" ? window : this);
