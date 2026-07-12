/**
 * GoëloRides — Activity dashboard admin : parcours, scénarios, funnel.
 */
(function () {
  "use strict";

  var _tickerTimer = null;
  var _tickerPaused = false;
  var _sessions = [];
  var _allEvents = [];
  var _activeTab = "journeys";
  var _selectedSessionId = null;

  function _$(id) { return document.getElementById(id); }

  function esc(s) {
    return window.GoeloActivity ? window.GoeloActivity._esc(s) : String(s == null ? "" : s);
  }

  function fmtTime(iso) {
    return window.GoeloActivity ? window.GoeloActivity.fmtTime(iso) : "—";
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    } catch (e) {
      return fmtTime(iso);
    }
  }

  function renderStats(stats) {
    stats = stats || {};
    function set(id, val, subId, subVal) {
      var el = _$(id);
      if (el) el.textContent = val != null ? val : "—";
      if (subId) {
        var sub = _$(subId);
        if (sub) sub.textContent = subVal || "";
      }
    }
    set("act-stat-rides", stats.rides_active, "act-stat-rides-sub",
      stats.rides_created_today ? "+" + stats.rides_created_today + " créées aujourd'hui" : "");
    set("act-stat-cyclists", stats.cyclists_registered, "act-stat-cyclists-sub",
      stats.cyclists_new_today ? "dont " + stats.cyclists_new_today + " nouvelles" : "");
    set("act-stat-live", stats.events_today, "act-stat-live-sub", "événements aujourd'hui");
    var alerts = (stats.alerts || 0) + (stats.pending_demands || 0);
    set("act-stat-alerts", alerts, "act-stat-alerts-sub",
      alerts ? "à vérifier" : "rien à signaler");
  }

  function renderTicker(events) {
    var host = _$("act-ticker-list");
    var countEl = _$("act-ticker-count");
    if (!host) return;
    var alerts = (events || []).filter(function (ev) {
      return ev.severity === "alert";
    });
    var shown = alerts.length ? alerts.slice(0, 8) : (events || []).slice(0, 8);
    if (countEl) countEl.textContent = String(shown.length);
    if (!shown.length) {
      host.innerHTML = "<p class=\"act-ticker__empty\">En attente d'activité…</p>";
      return;
    }
    var GA = window.GoeloActivity;
    host.innerHTML = shown.map(function (ev) {
      return "<div class=\"act-ticker__row\">" +
        "<span class=\"act-ticker__time\">" + esc(GA.fmtTime(ev.created_at)) + "</span>" +
        "<span class=\"act-ticker__icon\" aria-hidden=\"true\">" + esc(ev.icon) + "</span>" +
        "<span class=\"act-ticker__text\">" + (ev.textHtml || esc(ev.label || ev.text)) + "</span>" +
        "</div>";
    }).join("");
  }

  function setLoading(on) {
    var panel = _$("act-analytics-panel");
    if (!panel || !on) return;
    panel.innerHTML =
      "<div class=\"gtr-loading\">" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "<div class=\"gtr-loading__dot\"></div>" +
      "</div>";
  }

  function sessionById(id) {
    for (var i = 0; i < _sessions.length; i++) {
      if (_sessions[i].visitor_session_id === id) return _sessions[i];
    }
    return null;
  }

  function renderSessionDetail(session) {
    var box = _$("act-session-detail");
    if (!box || !session || !window.GoeloActivity) return;

    var GA = window.GoeloActivity;
    var timeline = GA.collapseScrollDepthTimeline(session.items);

    box.hidden = false;
    box.innerHTML =
      "<div class=\"act-session-detail__head\">" +
      "<div>" +
      "<h3 class=\"act-session-detail__title\">Session " + esc(session.shortId) + "</h3>" +
      "<p class=\"act-session-detail__sub\">" + esc(GA.sessionUserLabel(session)) +
      " · " + session.items.length + " événement" + (session.items.length > 1 ? "s" : "") + "</p>" +
      "</div>" +
      "<button type=\"button\" class=\"act-session-detail__close\" data-act-close-detail aria-label=\"Fermer\">✕</button>" +
      "</div>" +
      "<p class=\"act-session-detail__summary\">" + esc(GA.buildJourneySummary(session.items)) + "</p>" +
      "<ul class=\"act-session-detail__timeline\">" +
      timeline.map(function (ev) {
        var label = GA.detailTimelineLabel(ev);
        if (!label) return "";
        return "<li class=\"act-session-detail__item" + (ev.synthetic ? " is-synthetic" : "") + "\">" +
          "<span class=\"act-session-detail__time\">" + esc(fmtTime(ev.created_at)) + "</span>" +
          "<span class=\"act-session-detail__event\">" + esc(label) + "</span>" +
          "</li>";
      }).join("") +
      "</ul>";
  }

  function renderJourneys() {
    var GA = window.GoeloActivity;
    var panel = _$("act-analytics-panel");
    if (!panel || !GA) return;

    if (!_sessions.length) {
      panel.innerHTML = "<p class=\"gtr-empty\">Aucune session visiteur sur la période chargée.</p>";
      return;
    }

    panel.innerHTML =
      "<div class=\"act-journey-table-wrap\">" +
      "<table class=\"act-journey-table\">" +
      "<thead><tr>" +
      "<th>Date/heure</th><th>Session</th><th>Utilisateur</th><th>Actions</th><th>Parcours résumé</th>" +
      "</tr></thead><tbody>" +
      _sessions.map(function (session) {
        var last = session.items[session.items.length - 1];
        var start = session.items[0];
        var isSelected = _selectedSessionId === session.visitor_session_id;
        return "<tr class=\"act-journey-row" + (isSelected ? " is-selected" : "") + "\" " +
          "data-act-session=\"" + esc(session.visitor_session_id) + "\" tabindex=\"0\" role=\"button\">" +
          "<td class=\"act-journey-table__time\">" + esc(fmtDateTime((start && start.created_at) || (last && last.created_at))) + "</td>" +
          "<td class=\"act-journey-table__sid\">" + esc(session.shortId) + "</td>" +
          "<td>" + esc(GA.sessionUserLabel(session)) + "</td>" +
          "<td class=\"act-journey-table__count\">" + GA.sessionActionCount(session.items) + "</td>" +
          "<td class=\"act-journey-table__path\">" + esc(GA.buildJourneySummary(session.items)) + "</td>" +
          "</tr>";
      }).join("") +
      "</tbody></table></div>";

    if (_selectedSessionId) {
      renderSessionDetail(sessionById(_selectedSessionId));
    } else {
      var detail = _$("act-session-detail");
      if (detail) detail.hidden = true;
    }
  }

  function renderScenarios() {
    var GA = window.GoeloActivity;
    var panel = _$("act-analytics-panel");
    if (!panel || !GA) return;

    var scenarios = GA.analyzeScenarios(_sessions);
    if (!scenarios.length) {
      panel.innerHTML = "<p class=\"gtr-empty\">Aucun scénario détecté.</p>";
      return;
    }

    panel.innerHTML =
      "<div class=\"act-journey-table-wrap\">" +
      "<table class=\"act-journey-table act-scenario-table\">" +
      "<thead><tr><th>Scénario</th><th>Occurrences</th></tr></thead><tbody>" +
      scenarios.map(function (row) {
        return "<tr><td class=\"act-scenario-table__path\">" + esc(row.scenario) + "</td>" +
          "<td class=\"act-scenario-table__count\">" + row.count + "</td></tr>";
      }).join("") +
      "</tbody></table></div>";
  }

  function renderFunnel() {
    var GA = window.GoeloActivity;
    var panel = _$("act-analytics-panel");
    if (!panel || !GA) return;

    var steps = GA.analyzeFunnel(_sessions);
    if (!steps.length) {
      panel.innerHTML = "<p class=\"gtr-empty\">Funnel indisponible.</p>";
      return;
    }

    panel.innerHTML =
      "<div class=\"act-funnel\">" +
      steps.map(function (step, i) {
        var conv = step.conversionRate != null
          ? "<span class=\"act-funnel__rate\">" + step.conversionRate + "% conversion</span>"
          : "";
        var arrow = i < steps.length - 1
          ? "<div class=\"act-funnel__arrow\" aria-hidden=\"true\">↓</div>"
          : "";
        return "<div class=\"act-funnel__step\">" +
          "<div class=\"act-funnel__label\">" + esc(step.title) + "</div>" +
          "<div class=\"act-funnel__metrics\">" +
          "<span class=\"act-funnel__count\">" + step.count + " session" + (step.count > 1 ? "s" : "") + "</span>" +
          conv +
          "</div>" +
          arrow +
          "</div>";
      }).join("") +
      "</div>";
  }

  function renderActiveTab() {
    if (_activeTab === "scenarios") renderScenarios();
    else if (_activeTab === "funnel") renderFunnel();
    else renderJourneys();
  }

  function setActiveTab(tab) {
    _activeTab = tab || "journeys";
    document.querySelectorAll("[data-act-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-act-tab") === _activeTab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderActiveTab();
  }

  async function loadActivity() {
    var sb = window.goeloGetSb ? window.goeloGetSb() : null;
    if (!sb || !window.GoeloActivity) return;

    setLoading(true);
    var GA = window.GoeloActivity;
    var data = await GA.fetchAnalyticsEvents(sb, 200);

    renderStats(data.stats);
    _allEvents = data.events || [];
    _sessions = GA.buildVisitorSessions(_allEvents);
    renderTicker(_allEvents);
    renderActiveTab();

    if (data.error) {
      var errEl = _$("act-feed-error");
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = "Flux limité : " + data.error;
      }
    } else {
      var errBox = _$("act-feed-error");
      if (errBox) errBox.hidden = true;
    }
  }

  function bindControls() {
    var refreshBtn = _$("act-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () { loadActivity(); });
    }

    document.querySelectorAll("[data-act-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTab(btn.getAttribute("data-act-tab"));
      });
    });

    var panel = _$("act-analytics-panel");
    if (panel) {
      panel.addEventListener("click", function (e) {
        var row = e.target.closest("[data-act-session]");
        if (!row) return;
        _selectedSessionId = row.getAttribute("data-act-session");
        renderJourneys();
      });
      panel.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var row = e.target.closest("[data-act-session]");
        if (!row) return;
        e.preventDefault();
        _selectedSessionId = row.getAttribute("data-act-session");
        renderJourneys();
      });
    }

    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-act-close-detail]")) {
        _selectedSessionId = null;
        var detail = _$("act-session-detail");
        if (detail) detail.hidden = true;
        renderJourneys();
        return;
      }
      var btn = e.target.closest("[data-act-verify]");
      if (!btn) return;
      e.preventDefault();
      var wrap = document.getElementById("gtr-toast-wrap");
      if (wrap) {
        var el = document.createElement("div");
        el.className = "gtr-toast";
        el.textContent = "Alerte notée — à traiter manuellement.";
        wrap.appendChild(el);
        setTimeout(function () { el.remove(); }, 3500);
      }
    });

    var pauseBtn = _$("act-ticker-pause");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        _tickerPaused = !_tickerPaused;
        pauseBtn.textContent = _tickerPaused ? "Reprendre" : "Pause";
        if (!_tickerPaused) loadActivity();
      });
    }
  }

  function startTicker() {
    if (_tickerTimer) clearInterval(_tickerTimer);
    _tickerTimer = setInterval(function () {
      if (!_tickerPaused) loadActivity();
    }, 45000);
  }

  function init() {
    var section = _$("act-dashboard");
    if (!section) return;
    bindControls();
    loadActivity();
    startTicker();
  }

  window.GoeloAdminActivity = { init: init, refresh: loadActivity };
})();
