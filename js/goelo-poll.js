/**
 * GoëloRides — Sondage Home (1 clic = vote · résultats %)
 * localStorage voter_key · RPC poll_get_active / poll_vote
 * Un clic remplace le vote existant (1 ligne / identité).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "goelo_poll_voter_key_v1";
  var VOTED_PREFIX = "goelo_poll_voted_";

  function getSb() {
    return global.goeloGetSb ? global.goeloGetSb() : null;
  }

  function defaultQuestion() {
    return (global.GoeloLevels && global.GoeloLevels.POLL_QUESTION)
      || "Quelle sortie vous ferait vraiment venir rouler avec GoëloRides ?";
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
    return "";
  }

  function hidePoll(root) {
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
    delete root._pollState;
    var wrap = root.closest(".gr-hero-poll") || root.closest(".gr-home-section--poll");
    if (wrap) wrap.hidden = true;
  }

  function showPollSection(root) {
    root.hidden = false;
    var wrap = root.closest(".gr-hero-poll") || root.closest(".gr-home-section--poll");
    if (wrap) wrap.hidden = false;
  }

  function normalizeOptions(options) {
    var presets = (global.GoeloLevels && global.GoeloLevels.pollOptionPresets)
      ? global.GoeloLevels.pollOptionPresets()
      : [];
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
    var normalized = normalizeOptions(options || []);
    var myId = myOptionId ? String(myOptionId) : null;
    if (myId) rememberLocalVote(poll.id, myId);

    root._pollState = {
      poll: poll,
      options: options || [],
      my_option_id: myId,
      has_voted: !!myId
    };

    render(root);
  }

  function render(root) {
    var state = root._pollState;
    if (!state || !state.poll) return;

    var poll = state.poll;
    var options = normalizeOptions(state.options || []);
    var myId = state.my_option_id ? String(state.my_option_id) : null;
    var myOpt = findOption(options, myId);
    var question = defaultQuestion();

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
      html += '<p class="gr-poll__cta-line">👉 Votez pour votre format préféré.</p>';
    }

    html += '<div class="gr-poll__list" role="listbox" aria-label="Formats de sortie">';

    options.forEach(function (opt) {
      var id = String(opt.id);
      var isMine = myId && id === myId;
      var pct = myId ? (opt.percent != null ? Number(opt.percent) : 0) : null;
      var cls = "gr-poll__opt " + levelClass(opt.level_key);
      if (isMine) cls += " is-mine";
      if (myId) cls += " is-results";

      html += '<div class="' + cls + '" role="option" aria-selected="' + (isMine ? "true" : "false") + '">';
      html +=
        '<button type="button" class="gr-poll__btn' + (isMine ? " is-selected" : "") +
        '" data-poll-option="' + escapeHtml(id) +
        '" data-poll-id="' + escapeHtml(poll.id) +
        '" aria-pressed="' + (isMine ? "true" : "false") + '">';
      html += '<span class="gr-poll__emoji" aria-hidden="true">' + escapeHtml(opt.emoji || "") + "</span>";
      html += '<span class="gr-poll__btn-text">';
      html += '<span class="gr-poll__label">' + escapeHtml(opt.label) + "</span>";
      if (opt.subtitle) {
        html += '<span class="gr-poll__sub">' + escapeHtml(opt.subtitle) + "</span>";
      }
      if (myId) {
        html += '<span class="gr-poll__pct">' + pct + "&nbsp;%</span>";
      }
      html += "</span>";
      if (isMine) html += '<span class="gr-poll__badge">Votre choix</span>';
      html += "</button>";
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
          "— appliquer supabase/migrations/20260731160000_poll_vote_allow_update.sql"
        );
        // Recharge pour rester cohérent avec le serveur
        await load(root);
        return;
      }

      // Mise à jour immédiate UI depuis la réponse RPC
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

  async function load(root) {
    if (!root) return;
    var sb = getSb();
    if (!sb) {
      hidePoll(root);
      return;
    }

    try {
      var voterKey = getVoterKey();
      var res = await sb.rpc("poll_get_active", { p_voter_key: voterKey });
      if (res.error) {
        console.warn("[GoëloPoll] get_active:", res.error.message);
        hidePoll(root);
        return;
      }

      var data = res.data || {};
      if (!data.poll) {
        hidePoll(root);
        return;
      }

      var localOpt = readLocalVote(data.poll.id);
      var myOpt = data.my_option_id || null;

      // Source de vérité = Supabase ; localStorage seulement en secours
      if (!data.has_voted && localOpt) {
        myOpt = localOpt;
      } else if (data.has_voted && myOpt) {
        rememberLocalVote(data.poll.id, myOpt);
      }

      console.info("[GoëloPoll] load", {
        poll_id: data.poll.id,
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

  function init(selector) {
    var root = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;
    if (!root) {
      console.warn("[GoëloPoll] init: root introuvable", selector);
      return;
    }
    console.info("[GoëloPoll] init OK", root.id || root.className);
    bind(root);
    load(root);
  }

  global.GoeloPoll = {
    init: init,
    load: load,
    getVoterKey: getVoterKey
  };
})(typeof window !== "undefined" ? window : this);
