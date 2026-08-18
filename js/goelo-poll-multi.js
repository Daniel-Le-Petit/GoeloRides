/**
 * GoëloRides — Sondage multi-choix (checkboxes + texte libre + Envoyer)
 * RPC poll_multi_get_by_slug / poll_multi_submit · voter_key partagé avec GoeloPoll
 */
(function (global) {
  "use strict";

  var SUBMITTED_PREFIX = "goelo_poll_multi_submitted_";

  function getSb() {
    return global.goeloGetSb ? global.goeloGetSb() : null;
  }

  function levels() {
    return global.GoeloLevels || {};
  }

  function getVoterKey() {
    if (global.GoeloPoll && typeof global.GoeloPoll.getVoterKey === "function") {
      return global.GoeloPoll.getVoterKey();
    }
    try {
      var k = localStorage.getItem("goelo_poll_voter_key_v1");
      if (k && k.length >= 16) return k;
    } catch (e) { void e; }
    return null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function defaultSlug(root) {
    if (root && root.dataset && root.dataset.pollSlug) {
      return String(root.dataset.pollSlug).trim();
    }
    return levels().MOTIVATION_POLL_SLUG || "preferences-motivations-v1";
  }

  function presets() {
    return levels().motivationPollOptionPresets
      ? levels().motivationPollOptionPresets()
      : [];
  }

  function normalizeOptions(options) {
    var list = presets();
    var byKey = {};
    list.forEach(function (p) { byKey[p.level_key] = p; });
    return (options || []).map(function (opt) {
      var key = String(opt.level_key || "").toLowerCase();
      var preset = byKey[key] || null;
      if (!preset) return opt;
      return {
        id: opt.id,
        label: preset.label,
        subtitle: preset.subtitle || "",
        emoji: preset.emoji || "",
        level_key: preset.level_key,
        sort_order: opt.sort_order,
        percent: opt.percent
      };
    });
  }

  function asIdSet(ids) {
    var set = {};
    (ids || []).forEach(function (id) {
      if (id != null) set[String(id)] = true;
    });
    return set;
  }

  function rememberSubmitted(pollId, optionIds) {
    try {
      localStorage.setItem(SUBMITTED_PREFIX + pollId, JSON.stringify(optionIds || []));
    } catch (e) { void e; }
  }

  function readSubmitted(pollId) {
    try {
      var raw = localStorage.getItem(SUBMITTED_PREFIX + pollId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function hide(root) {
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
    delete root._multiState;
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

  function show(root) {
    root.hidden = false;
    var wrap = root.closest(".gr-hero-poll") || root.closest(".gr-home-section--poll");
    if (wrap) wrap.hidden = false;
  }

  function applyPayload(root, poll, options, myOptionIds, myFreeText, hasSubmitted) {
    var ids = (myOptionIds || []).map(String);
    if (hasSubmitted && poll && poll.id) rememberSubmitted(poll.id, ids);
    root._multiState = {
      poll: poll,
      options: options || [],
      my_option_ids: ids,
      my_free_text: myFreeText || "",
      has_submitted: !!hasSubmitted,
      draft_ids: ids.slice(),
      draft_text: myFreeText || ""
    };
    render(root);
  }

  function render(root) {
    var state = root._multiState;
    if (!state || !state.poll) return;

    var poll = state.poll;
    var options = normalizeOptions(state.options || []);
    var hasSubmitted = !!state.has_submitted;
    var selected = asIdSet(hasSubmitted ? state.my_option_ids : state.draft_ids);
    var question = (poll.question && String(poll.question).trim())
      || levels().MOTIVATION_POLL_QUESTION
      || "Qu'est-ce qui vous ferait venir rouler avec nous ?";
    var freePrompt = levels().MOTIVATION_FREE_PROMPT
      || "Autre chose ? Dites-nous ce qui vous donnerait envie de venir…";

    var html = "";
    html += '<div class="gr-poll gr-poll--multi">';
    html += '<h2 class="gr-poll__title">' + escapeHtml(question) + "</h2>";

    if (hasSubmitted) {
      html += '<p class="gr-poll__cta-line">Merci ! Voici les réponses de la communauté.</p>';
    } else {
      html += '<p class="gr-poll__cta-line">👉 Cochez tout ce qui compte pour vous.</p>';
    }

    html += '<div class="gr-poll__list gr-poll__list--checks" role="group" aria-label="Motivations">';

    options.forEach(function (opt) {
      var id = String(opt.id);
      var isMine = !!selected[id];
      var pct = hasSubmitted ? (opt.percent != null ? Number(opt.percent) : 0) : null;
      var cls = "gr-poll__opt gr-poll__opt--check";
      if (isMine) cls += " is-mine";
      if (hasSubmitted) cls += " is-results";

      html += '<div class="' + cls + '">';
      if (hasSubmitted) {
        html += '<div class="gr-poll__btn--check gr-poll__btn--static' + (isMine ? " is-selected" : "") + '">';
        html += '<span class="gr-poll__check" aria-hidden="true">' + (isMine ? "✓" : "") + "</span>";
        html += '<span class="gr-poll__opt-text">';
        html += '<span class="gr-poll__label">' + escapeHtml(opt.label) + "</span>";
        html += "</span>";
        html += '<span class="gr-poll__pct">' + pct + "&nbsp;%</span>";
        if (isMine) html += '<span class="gr-poll__badge">Votre choix</span>';
        html += "</div>";
        html += '<div class="gr-poll__bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>';
      } else {
        html +=
          '<label class="gr-poll__btn--check' + (isMine ? " is-selected" : "") + '">' +
          '<input type="checkbox" class="gr-poll__checkbox" data-multi-option="' + escapeHtml(id) + '"' +
          (isMine ? " checked" : "") + ">" +
          '<span class="gr-poll__check" aria-hidden="true">' + (isMine ? "✓" : "") + "</span>" +
          '<span class="gr-poll__opt-text">' +
          '<span class="gr-poll__label">' + escapeHtml(opt.label) + "</span>" +
          "</span></label>";
      }
      html += "</div>";
    });

    html += "</div>";

    if (!hasSubmitted) {
      html += '<label class="gr-poll__free">';
      html += '<span class="gr-poll__free-label">' + escapeHtml(freePrompt) + "</span>";
      html +=
        '<textarea class="gr-poll__textarea" data-multi-free rows="2" maxlength="500" ' +
        'placeholder="Facultatif">' +
        escapeHtml(state.draft_text || "") +
        "</textarea>";
      html += "</label>";
      html +=
        '<button type="button" class="gr-poll__submit" data-multi-submit>' +
        "Envoyer</button>";
      html += '<p class="gr-poll__hint" data-multi-hint hidden></p>';
    } else if (state.my_free_text) {
      html +=
        '<p class="gr-poll__mine-line">Votre précision : ' +
        '<span class="gr-poll__mine-choice">' + escapeHtml(state.my_free_text) + "</span></p>";
      html +=
        '<button type="button" class="gr-poll__edit" data-multi-edit>Modifier ma réponse</button>';
    } else {
      html +=
        '<button type="button" class="gr-poll__edit" data-multi-edit>Modifier ma réponse</button>';
    }

    html += "</div>";
    show(root);
    root.innerHTML = html;
  }

  function syncDraftFromDom(root) {
    var state = root._multiState;
    if (!state) return;
    var ids = [];
    root.querySelectorAll("[data-multi-option]:checked").forEach(function (el) {
      ids.push(el.getAttribute("data-multi-option"));
    });
    state.draft_ids = ids;
    var ta = root.querySelector("[data-multi-free]");
    state.draft_text = ta ? ta.value : "";
  }

  function setHint(root, msg, isError) {
    var el = root.querySelector("[data-multi-hint]");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("is-error", !!isError);
  }

  async function submit(root) {
    var sb = getSb();
    var state = root._multiState;
    if (!sb || !state || !state.poll) return;

    syncDraftFromDom(root);
    var ids = state.draft_ids || [];
    if (!ids.length) {
      setHint(root, "Cochez au moins une réponse.", true);
      return;
    }

    var voterKey = getVoterKey();
    if (!voterKey) {
      setHint(root, "Impossible d’enregistrer (navigateur).", true);
      return;
    }

    root.classList.add("is-busy");
    setHint(root, "Envoi…", false);
    try {
      var res = await sb.rpc("poll_multi_submit", {
        p_poll_id: state.poll.id,
        p_option_ids: ids,
        p_free_text: state.draft_text || "",
        p_voter_key: voterKey
      });
      if (res.error) {
        setHint(root, res.error.message, true);
        return;
      }
      var data = res.data || {};
      if (data.ok === false) {
        setHint(root, data.error === "no_options" ? "Cochez au moins une réponse." : (data.error || "Échec"), true);
        return;
      }
      applyPayload(
        root,
        state.poll,
        data.options || state.options,
        data.my_option_ids || ids,
        (data.my_free_text != null && data.my_free_text !== "null")
          ? (typeof data.my_free_text === "string" ? data.my_free_text : "")
          : (state.draft_text || ""),
        true
      );
    } catch (err) {
      console.warn("[GoëloPollMulti] submit:", err);
      setHint(root, "Erreur réseau.", true);
    } finally {
      root.classList.remove("is-busy");
    }
  }

  async function load(root) {
    if (!root) return;
    var sb = getSb();
    if (!sb) {
      hide(root);
      return;
    }
    var slug = defaultSlug(root);
    try {
      var voterKey = getVoterKey();
      var res = await sb.rpc("poll_multi_get_by_slug", {
        p_slug: slug,
        p_voter_key: voterKey
      });
      if (res.error) {
        console.warn("[GoëloPollMulti] get:", res.error.message);
        hide(root);
        return;
      }
      var data = res.data || {};
      if (!data.poll) {
        hide(root);
        return;
      }

      var myIds = data.my_option_ids || [];
      if (!data.has_submitted) {
        var local = readSubmitted(data.poll.id);
        if (local && local.length) myIds = local;
      }

      var freeText = data.my_free_text;
      if (freeText == null || freeText === "null") freeText = "";

      applyPayload(
        root,
        data.poll,
        data.options || [],
        myIds,
        freeText,
        !!data.has_submitted
      );
    } catch (err) {
      console.warn("[GoëloPollMulti] load:", err);
      hide(root);
    }
  }

  function bind(root) {
    if (!root || root.dataset.multiBound === "1") return;
    root.dataset.multiBound = "1";

    root.addEventListener("change", function (e) {
      var cb = e.target.closest("[data-multi-option]");
      if (!cb || root._multiState && root._multiState.has_submitted) return;
      syncDraftFromDom(root);
      var label = cb.closest(".gr-poll__btn--check");
      if (label) {
        label.classList.toggle("is-selected", cb.checked);
        var mark = label.querySelector(".gr-poll__check");
        if (mark) mark.textContent = cb.checked ? "✓" : "";
      }
      setHint(root, "", false);
    });

    root.addEventListener("click", function (e) {
      if (root.classList.contains("is-busy")) return;
      if (e.target.closest("[data-multi-submit]")) {
        e.preventDefault();
        submit(root);
        return;
      }
      if (e.target.closest("[data-multi-edit]")) {
        e.preventDefault();
        var state = root._multiState;
        if (!state) return;
        state.has_submitted = false;
        state.draft_ids = (state.my_option_ids || []).slice();
        state.draft_text = state.my_free_text || "";
        render(root);
      }
    });
  }

  function init(selector) {
    var root = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;
    if (!root) {
      console.warn("[GoëloPollMulti] init: root introuvable", selector);
      return;
    }
    bind(root);
    load(root);
  }

  global.GoeloPollMulti = {
    init: init,
    load: load
  };
})(typeof window !== "undefined" ? window : this);
