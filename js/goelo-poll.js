/**
 * GoëloRides — Sondage Home (vote modifiable · résultats %)
 * localStorage voter_key · RPC poll_get_active / poll_vote
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

  function renderOptions(root, state) {
    var poll = state.poll;
    var options = normalizeOptions(state.options || []);
    var myId = state.my_option_id ? String(state.my_option_id) : null;
    var hasVoted = !!state.has_voted;
    var editing = !!state.editing;
    var showResults = hasVoted && !editing;
    var selectedId = state.selected_option_id ? String(state.selected_option_id) : null;
    var question = defaultQuestion();
    var myOpt = findOption(options, myId);

    root._pollState = {
      poll: poll,
      options: state.options || [],
      my_option_id: myId,
      has_voted: hasVoted,
      editing: editing,
      selected_option_id: selectedId
    };

    var html = "";
    html += '<div class="gr-poll">';
    html += '<h2 class="gr-poll__title">' + escapeHtml(question) + "</h2>";

    if (showResults && myOpt) {
      html +=
        '<p class="gr-poll__mine-line">Votre choix : ' +
        '<span class="gr-poll__mine-choice">' +
        escapeHtml((myOpt.emoji ? myOpt.emoji + " " : "") + myOpt.label) +
        "</span></p>";
    } else if (!showResults) {
      html += '<p class="gr-poll__cta-line">' +
        (editing ? "Choisissez un nouveau format." : "👉 Votez pour votre format préféré.") +
        "</p>";
    }

    html += '<div class="gr-poll__list" role="listbox" aria-label="Formats de sortie">';

    options.forEach(function (opt) {
      var id = String(opt.id);
      var isMine = myId && id === myId;
      var isSelected = selectedId && id === selectedId;
      var pct = showResults ? (opt.percent != null ? Number(opt.percent) : 0) : 0;
      var cls = "gr-poll__opt " + levelClass(opt.level_key);
      if (isMine) cls += " is-mine";
      if (isSelected) cls += " is-selected";
      if (showResults) cls += " is-results";

      html += '<div class="' + cls + '" role="option" aria-selected="' + (isSelected || isMine ? "true" : "false") + '">';
      if (showResults) {
        html +=
          '<div class="gr-poll__opt-inner" aria-label="' +
          escapeHtml(opt.label) + " : " + pct + ' %">';
        html += '<div class="gr-poll__opt-top">';
        html += '<span class="gr-poll__emoji" aria-hidden="true">' + escapeHtml(opt.emoji || "") + "</span>";
        html += '<span class="gr-poll__label">' + escapeHtml(opt.label) + "</span>";
        if (isMine) html += '<span class="gr-poll__badge">Votre choix</span>';
        html += '<span class="gr-poll__pct">' + pct + "&nbsp;%</span>";
        html += "</div>";
        if (opt.subtitle) {
          html += '<p class="gr-poll__sub">' + escapeHtml(opt.subtitle) + "</p>";
        }
        html += '<div class="gr-poll__bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>';
        html += "</div>";
      } else {
        html +=
          '<button type="button" class="gr-poll__btn' + (isSelected ? " is-selected" : "") +
          '" data-poll-option="' + escapeHtml(id) +
          '" data-poll-id="' + escapeHtml(poll.id) +
          '" aria-pressed="' + (isSelected ? "true" : "false") + '">';
        html += '<span class="gr-poll__emoji" aria-hidden="true">' + escapeHtml(opt.emoji || "") + "</span>";
        html += '<span class="gr-poll__btn-text">';
        html += '<span class="gr-poll__label">' + escapeHtml(opt.label) + "</span>";
        if (opt.subtitle) {
          html += '<span class="gr-poll__sub">' + escapeHtml(opt.subtitle) + "</span>";
        }
        html += "</span></button>";
      }
      html += "</div>";
    });

    html += "</div>";

    html += '<div class="gr-poll__actions">';
    if (showResults) {
      html +=
        '<button type="button" class="gr-poll__edit" data-poll-edit="' +
        escapeHtml(poll.id) + '">Modifier mon choix</button>';
    } else {
      var canSubmit = !!selectedId && (!editing || selectedId !== myId);
      var label;
      if (!selectedId) label = "Choisir une option";
      else if (editing) label = "Valider mon nouveau choix";
      else label = "Valider mon choix";
      html +=
        '<button type="button" class="gr-poll__submit" data-poll-submit="' +
        escapeHtml(poll.id) + '"' + (canSubmit ? "" : " disabled") + ">" +
        label +
        "</button>";
      if (editing) {
        html +=
          '<button type="button" class="gr-poll__cancel" data-poll-cancel="' +
          escapeHtml(poll.id) + '">Annuler</button>';
      }
    }
    html += "</div>";

    html += "</div>";

    showPollSection(root);
    root.innerHTML = html;
  }

  function selectOption(root, optionId) {
    var state = root._pollState;
    if (!state) return;
    if (state.has_voted && !state.editing) return;
    console.info("[GoëloPoll] select", optionId);
    state.selected_option_id = String(optionId);
    renderOptions(root, state);
  }

  function startEdit(root) {
    var state = root._pollState;
    if (!state || !state.has_voted) return;
    console.info("[GoëloPoll] edit mode");
    state.editing = true;
    state.selected_option_id = state.my_option_id || null;
    renderOptions(root, state);
  }

  function cancelEdit(root) {
    var state = root._pollState;
    if (!state) return;
    state.editing = false;
    state.selected_option_id = null;
    renderOptions(root, state);
  }

  async function vote(root, pollId, optionId) {
    var sb = getSb();
    if (!sb || !optionId) return;
    var voterKey = getVoterKey();
    console.info("[GoëloPoll] poll_vote", { pollId: pollId, optionId: optionId });
    root.classList.add("is-busy");
    try {
      var res = await sb.rpc("poll_vote", {
        p_poll_id: pollId,
        p_option_id: optionId,
        p_voter_key: voterKey
      });
      if (res.error) {
        console.warn("[GoëloPoll] vote:", res.error.message);
        root.classList.remove("is-busy");
        return;
      }
      var data = res.data || {};
      if (data.ok === false) {
        console.warn("[GoëloPoll] vote error:", data.error);
        // Ancienne RPC already_voted : recharger quand même
        if (data.error === "already_voted") {
          rememberLocalVote(pollId, data.my_option_id || optionId);
        }
      } else if (data.my_option_id || optionId) {
        rememberLocalVote(pollId, data.my_option_id || optionId);
      }
      await load(root);
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
      var hasVoted = !!data.has_voted;
      var myOpt = data.my_option_id || null;

      if (!hasVoted && localOpt) {
        hasVoted = true;
        myOpt = myOpt || localOpt;
      }

      renderOptions(root, {
        poll: data.poll,
        options: data.options || [],
        my_option_id: myOpt,
        has_voted: hasVoted,
        editing: false,
        selected_option_id: null
      });
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

      var editBtn = e.target.closest("[data-poll-edit]");
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        startEdit(root);
        return;
      }

      var cancelBtn = e.target.closest("[data-poll-cancel]");
      if (cancelBtn) {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit(root);
        return;
      }

      var optBtn = e.target.closest("[data-poll-option]");
      if (optBtn) {
        e.preventDefault();
        e.stopPropagation();
        selectOption(root, optBtn.getAttribute("data-poll-option"));
        return;
      }

      var submitBtn = e.target.closest("[data-poll-submit]");
      if (submitBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (submitBtn.disabled) return;
        var state = root._pollState;
        var pollId = submitBtn.getAttribute("data-poll-submit");
        var optionId = state && state.selected_option_id;
        if (!pollId || !optionId) return;
        vote(root, pollId, optionId);
      }
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
